/* Admin panel UI — live analytics dashboard */
(() => {
  const escapeHtml =
    window.tbEscapeHtml ||
    ((v) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"));
  const t = window.t || ((k) => k);

  const statsEl = document.getElementById("ap-stats");
  const pagesEl = document.getElementById("ap-pages");
  const feedEl = document.getElementById("ap-feed");
  const usersBody = document.getElementById("users-tbody");
  const requestsBody = document.getElementById("requests-tbody");
  const productsBody = document.getElementById("products-tbody");
  const notificationsBody = document.getElementById("notifications-tbody");
  const ratingsBody = document.getElementById("ratings-tbody");
  const titleEl = document.getElementById("ap-title");
  const leadEl = document.getElementById("ap-lead");
  const updatedEl = document.getElementById("ap-updated");
  const ephemeralEl = document.getElementById("ap-ephemeral");
  const dbEl = document.getElementById("ap-db");
  const views = {
    overview: document.getElementById("tab-overview"),
    users: document.getElementById("tab-users"),
    requests: document.getElementById("tab-requests"),
    products: document.getElementById("tab-products"),
    notifications: document.getElementById("tab-notifications"),
    ratings: document.getElementById("tab-ratings"),
  };

  let filterMeta = null;
  let pollTimer = null;

  const LOADERS = {
    loadUsers: () => loadUsers(),
    loadRequests: () => loadRequests(),
    loadProducts: () => loadProducts(),
    loadNotifications: () => loadNotifications(),
    loadRatings: () => loadRatings(),
  };

  function formParams(formId) {
    const form = document.getElementById(formId);
    const params = new URLSearchParams();
    if (!form) return params;
    new FormData(form).forEach((value, key) => {
      const v = String(value ?? "").trim();
      if (v !== "") params.set(key, v);
    });
    return params;
  }

  function fillDatalist(id, values) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = (values || [])
      .map((v) => `<option value="${escapeHtml(v)}"></option>`)
      .join("");
  }

  function fillSelect(select, values, allLabel) {
    if (!select) return;
    const current = select.value;
    const opts = [`<option value="">${escapeHtml(allLabel || t("admin.filter_all"))}</option>`];
    (values || []).forEach((v) => {
      const label =
        select.dataset.meta === "roles"
          ? v === "supplier"
            ? t("auth.role_supplier")
            : v === "user"
              ? t("auth.role_user")
              : v
          : select.dataset.meta === "request_statuses" && STATUS_LABEL[v]
            ? STATUS_LABEL[v]()
            : v;
      opts.push(`<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`);
    });
    select.innerHTML = opts.join("");
    if ([...select.options].some((o) => o.value === current)) select.value = current;
  }

  async function loadFilterMeta() {
    const res = await fetch("/api/admin/filter-meta");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return;
    filterMeta = data.meta || {};
    fillDatalist("dl-cities", filterMeta.cities);
    fillDatalist("dl-companies", filterMeta.companies);
    fillDatalist("dl-categories", filterMeta.categories);
    fillDatalist("dl-subcategories", filterMeta.subcategories);
    fillDatalist("dl-units", filterMeta.units);
    fillDatalist("dl-banks", filterMeta.banks);
    document.querySelectorAll("select[data-meta]").forEach((sel) => {
      const key = sel.dataset.meta;
      fillSelect(sel, filterMeta[key] || [], t("admin.filter_all"));
    });
  }

  function wireFilters() {
    document.querySelectorAll("form.ap-filters").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fn = LOADERS[form.dataset.load];
        if (fn) fn();
      });
      form.addEventListener("reset", () => {
        setTimeout(() => {
          const fn = LOADERS[form.dataset.load];
          if (fn) fn();
        }, 0);
      });
    });
  }

  const STATUS_LABEL = {
    sent: () => t("home.filter_sent"),
    deal: () => t("home.filter_deal"),
    completed: () => t("home.filter_done"),
    cancelled: () => t("home.filter_cancelled"),
  };

  const FEED_LABEL = {
    login: () => t("admin.feed_login"),
    register: () => t("admin.feed_register"),
    request_created: () => t("admin.feed_request"),
    offer_sent: () => t("admin.feed_offer"),
    page_view: () => t("admin.feed_page"),
  };

  const COLORS = {
    accent: "#0095ff",
    deep: "#0055ff",
    soft: "rgba(0, 149, 255, 0.18)",
    ink: "#000b22",
    muted: "#5a6578",
    ok: "#0f7b4a",
    warn: "#b54708",
    bad: "#b42318",
    grid: "rgba(0, 11, 34, 0.06)",
  };

  const charts = { wave: null, daily: null, status: null, roles: null };

  function showTab(name) {
    Object.entries(views).forEach(([key, el]) => {
      if (!el) return;
      const on = key === name;
      el.hidden = !on;
      el.classList.toggle("is-active", on);
    });
    document.querySelectorAll(".ap-nav__btn[data-tab]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === name);
    });
    const active = views[name];
    if (active && titleEl) titleEl.textContent = active.dataset.title || t("admin.title");
    if (active && leadEl) leadEl.textContent = active.dataset.lead || t("admin.lead");
    if (name === "overview") loadAnalytics();
    if (name === "users") loadUsers();
    if (name === "requests") loadRequests();
    if (name === "products") loadProducts();
    if (name === "notifications") loadNotifications();
    if (name === "ratings") loadRatings();
  }

  document.querySelectorAll(".ap-nav__btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showTab(btn.dataset.tab);
    });
  });

  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.goto));
  });

  function upsertChart(key, canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    if (charts[key]) {
      charts[key].data = config.data;
      charts[key].options = { ...charts[key].options, ...config.options };
      charts[key].update("none");
      return;
    }
    charts[key] = new window.Chart(canvas, config);
  }

  function kpiCard(value, label, tone) {
    return `<article class="ap-stat${tone ? ` ap-stat--${tone}` : ""}">
      <span class="ap-stat__value">${escapeHtml(value)}</span>
      <span class="ap-stat__label">${escapeHtml(label)}</span>
    </article>`;
  }

  function renderKpis(k) {
    if (!statsEl) return;
    statsEl.innerHTML = [
      kpiCard(k.online_now || 0, t("admin.kpi_online"), "live"),
      kpiCard(k.views_1h || 0, t("admin.kpi_views_1h")),
      kpiCard(k.views_24h || 0, t("admin.kpi_views_24h")),
      kpiCard(k.logins_24h || 0, t("admin.kpi_logins")),
      kpiCard(k.registers_24h || 0, t("admin.kpi_registers")),
      kpiCard(k.requests_24h || 0, t("admin.kpi_requests_24h")),
      kpiCard(k.offers_24h || 0, t("admin.kpi_offers_24h")),
      kpiCard(k.deals_active || 0, t("admin.kpi_deals")),
      kpiCard(k.buyers || 0, t("auth.role_user")),
      kpiCard(k.suppliers || 0, t("auth.role_supplier")),
      kpiCard(k.blocked || 0, t("admin.stat_blocked"), "warn"),
      kpiCard(k.requests_total || 0, t("admin.stat_requests")),
    ].join("");
  }

  function renderPages(pages) {
    if (!pagesEl) return;
    if (!pages || !pages.length) {
      pagesEl.innerHTML = `<p class="ap-hint">${escapeHtml(t("admin.empty_pages"))}</p>`;
      return;
    }
    const max = Math.max(...pages.map((p) => p.count), 1);
    pagesEl.innerHTML = pages
      .map((p) => {
        const pct = Math.round((p.count / max) * 100);
        return `<div class="ap-page-row">
          <code class="ap-page-row__path">${escapeHtml(p.path)}</code>
          <div class="ap-page-row__bar"><span style="width:${pct}%"></span></div>
          <strong>${p.count}</strong>
        </div>`;
      })
      .join("");
  }

  function renderFeed(feed) {
    if (!feedEl) return;
    if (!feed || !feed.length) {
      feedEl.innerHTML = `<p class="ap-hint">${escapeHtml(t("admin.empty_feed"))}</p>`;
      return;
    }
    feedEl.innerHTML = feed
      .map((e) => {
        const label = FEED_LABEL[e.kind] ? FEED_LABEL[e.kind]() : e.kind;
        const when = new Date((e.ts || 0) * 1000);
        const time = when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        return `<div class="ap-feed__row">
          <span class="ap-feed__time">${escapeHtml(time)}</span>
          <span class="ap-badge">${escapeHtml(label)}</span>
          <span class="ap-feed__path">${escapeHtml(e.path || e.role || "—")}</span>
        </div>`;
      })
      .join("");
  }

  function renderCharts(data) {
    const wave = data.wave || { labels: [], activity: [], unique: [] };
    upsertChart("wave", "chart-wave", {
      type: "line",
      data: {
        labels: wave.labels,
        datasets: [
          {
            label: t("admin.series_activity"),
            data: wave.activity,
            borderColor: COLORS.accent,
            backgroundColor: COLORS.soft,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: t("admin.series_unique"),
            data: wave.unique,
            borderColor: COLORS.deep,
            backgroundColor: "transparent",
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
            borderDash: [4, 4],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { ticks: { maxTicksLimit: 8, color: COLORS.muted }, grid: { color: COLORS.grid } },
          y: { beginAtZero: true, ticks: { precision: 0, color: COLORS.muted }, grid: { color: COLORS.grid } },
        },
        animation: false,
      },
    });

    const daily = data.daily || {};
    upsertChart("daily", "chart-daily", {
      type: "bar",
      data: {
        labels: daily.labels || [],
        datasets: [
          {
            label: t("admin.kpi_logins"),
            data: daily.logins || [],
            backgroundColor: COLORS.accent,
            borderRadius: 4,
          },
          {
            label: t("admin.kpi_requests_24h"),
            data: daily.requests || [],
            backgroundColor: COLORS.deep,
            borderRadius: 4,
          },
          {
            label: t("admin.kpi_offers_24h"),
            data: daily.offers || [],
            backgroundColor: "#38bdf8",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { stacked: false, ticks: { color: COLORS.muted }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0, color: COLORS.muted }, grid: { color: COLORS.grid } },
        },
        animation: false,
      },
    });

    const status = data.requests_by_status || {};
    const statusKeys = Object.keys(status);
    upsertChart("status", "chart-status", {
      type: "doughnut",
      data: {
        labels: statusKeys.map((k) => (STATUS_LABEL[k] ? STATUS_LABEL[k]() : k)),
        datasets: [
          {
            data: statusKeys.map((k) => status[k]),
            backgroundColor: ["#3538cd", "#087443", "#667085", "#b42318", "#0095ff"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
        animation: false,
      },
    });

    const roles = data.role_activity_24h || {};
    upsertChart("roles", "chart-roles", {
      type: "pie",
      data: {
        labels: [
          t("auth.role_user"),
          t("auth.role_supplier"),
          t("admin.role"),
          t("admin.role_guest"),
        ],
        datasets: [
          {
            data: [roles.user || 0, roles.supplier || 0, roles.admin || 0, roles.guest || 0],
            backgroundColor: ["#0095ff", "#0055ff", "#000b22", "#94a3b8"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
        animation: false,
      },
    });
  }

  async function loadAnalytics() {
    const res = await fetch("/api/admin/analytics");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return;
    renderKpis(data.kpis || {});
    renderPages(data.top_pages || []);
    renderFeed(data.feed || []);
    renderCharts(data);
    if (ephemeralEl) ephemeralEl.hidden = !data.ephemeral_note;
    if (dbEl) {
      const db = data.db || {};
      const backend = db.backend || "?";
      dbEl.hidden = false;
      dbEl.classList.toggle("is-bad", !db.ok);
      dbEl.textContent = db.ok
        ? `${t("admin.db_ok")}: ${backend}${db.detail ? ` · ${db.detail}` : ""}`
        : `${t("admin.db_bad")}: ${db.detail || backend}`;
    }
    if (updatedEl) {
      const d = new Date((data.generated_at || Date.now() / 1000) * 1000);
      updatedEl.textContent = `${t("admin.updated")}: ${d.toLocaleTimeString()}`;
    }
  }

  async function loadUsers() {
    const params = formParams("filters-users");
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json().catch(() => ({}));
    const countEl = document.getElementById("users-count");
    if (countEl) countEl.textContent = data.total != null ? `${t("admin.found")}: ${data.total}` : "";
    if (!usersBody) return;
    if (!res.ok || !data.ok) {
      usersBody.innerHTML = `<tr><td colspan="8" class="ap-empty">${escapeHtml(data.error || t("js.err_send"))}</td></tr>`;
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      usersBody.innerHTML = `<tr><td colspan="8" class="ap-empty">${escapeHtml(t("admin.empty_users"))}</td></tr>`;
      return;
    }
    usersBody.innerHTML = items
      .map((u) => {
        const roleLabel =
          u.role === "supplier" ? t("auth.role_supplier") : t("auth.role_user");
        const status = u.blocked
          ? `<span class="ap-badge ap-badge--bad">${escapeHtml(t("admin.status_blocked"))}</span>`
          : `<span class="ap-badge ap-badge--ok">${escapeHtml(t("admin.status_active"))}</span>`;
        const bin = u.bin
          ? `<code>${escapeHtml(u.bin)}</code>${
              u.bin.length === 12
                ? ""
                : ` <span class="ap-badge ap-badge--warn">${escapeHtml(t("admin.bin_bad"))}</span>`
            }`
          : "—";
        const cats = (u.categories || []).slice(0, 3).join(", ") || u.category || "—";
        const actionLabel = u.blocked ? t("admin.unblock") : t("admin.block");
        const actionClass = u.blocked ? "ap-btn ap-btn--ok" : "ap-btn ap-btn--danger";
        return `<tr>
          <td>
            <strong>${escapeHtml(u.name || "")}</strong>
            <div class="ap-muted">${escapeHtml(u.email || "")}</div>
            <div class="ap-muted">${escapeHtml(u.phone || "")}</div>
          </td>
          <td>${escapeHtml(roleLabel)}${u.supplier_role ? `<div class="ap-muted">${escapeHtml(u.supplier_role)}</div>` : ""}</td>
          <td>${escapeHtml(u.company_name || "—")}</td>
          <td>${bin}</td>
          <td>${escapeHtml(u.city || "—")}</td>
          <td><div class="ap-muted">${escapeHtml(cats)}</div></td>
          <td>${status}</td>
          <td class="ap-actions">
            <button type="button" class="${actionClass}" data-block="${escapeHtml(u.id)}" data-next="${u.blocked ? "0" : "1"}">${escapeHtml(actionLabel)}</button>
          </td>
        </tr>`;
      })
      .join("");

    usersBody.querySelectorAll("[data-block]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.block;
        const blockedNext = btn.dataset.next === "1";
        if (blockedNext && !confirm(t("admin.confirm_block"))) return;
        const res2 = await fetch(`/api/admin/users/${id}/block`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocked: blockedNext }),
        });
        const d2 = await res2.json().catch(() => ({}));
        if (!res2.ok || !d2.ok) {
          alert(d2.error || t("js.err_send"));
          return;
        }
        loadUsers();
        loadAnalytics();
      });
    });
  }

  async function loadRequests() {
    const params = formParams("filters-requests");
    const res = await fetch(`/api/admin/requests?${params}`);
    const data = await res.json().catch(() => ({}));
    const countEl = document.getElementById("requests-count");
    if (countEl) countEl.textContent = data.total != null ? `${t("admin.found")}: ${data.total}` : "";
    if (!requestsBody) return;
    if (!res.ok || !data.ok) {
      requestsBody.innerHTML = `<tr><td colspan="6" class="ap-empty">${escapeHtml(data.error || t("js.err_send"))}</td></tr>`;
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      requestsBody.innerHTML = `<tr><td colspan="6" class="ap-empty">${escapeHtml(t("admin.empty_requests"))}</td></tr>`;
      return;
    }
    requestsBody.innerHTML = items
      .map((r) => {
        const created = (r.created_at || "").slice(0, 16).replace("T", " ");
        const st = r.status || "sent";
        const stLabel = STATUS_LABEL[st] ? STATUS_LABEL[st]() : st;
        return `<tr>
          <td>
            <div>${escapeHtml(r.text || "")}</div>
            <div class="ap-muted">${escapeHtml(r.id || "")}</div>
          </td>
          <td>
            <strong>${escapeHtml(r.user_name || "")}</strong>
            <div class="ap-muted">${escapeHtml(r.user_email || "")}</div>
          </td>
          <td><span class="ap-badge ap-badge--${escapeHtml(st)}">${escapeHtml(stLabel)}</span></td>
          <td>${Number(r.offers_count) || 0} / ${Number(r.suppliers_count) || 0}</td>
          <td class="ap-muted">${escapeHtml((r.matched_categories || []).join(", "))}</td>
          <td class="ap-muted">${escapeHtml(created)}</td>
        </tr>`;
      })
      .join("");
  }

  async function loadProducts() {
    const params = formParams("filters-products");
    const res = await fetch(`/api/admin/products?${params}`);
    const data = await res.json().catch(() => ({}));
    const countEl = document.getElementById("products-count");
    if (countEl) countEl.textContent = data.total != null ? `${t("admin.found")}: ${data.total}` : "";
    if (!productsBody) return;
    if (!res.ok || !data.ok) {
      productsBody.innerHTML = `<tr><td colspan="6" class="ap-empty">${escapeHtml(data.error || t("js.err_send"))}</td></tr>`;
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      productsBody.innerHTML = `<tr><td colspan="6" class="ap-empty">${escapeHtml(t("admin.empty_products"))}</td></tr>`;
      return;
    }
    productsBody.innerHTML = items
      .map(
        (p) => `<tr>
        <td><strong>${escapeHtml(p.name || "")}</strong><div class="ap-muted">${escapeHtml(p.description || "")}</div></td>
        <td>${escapeHtml(p.company_name || "—")}</td>
        <td>${escapeHtml(p.category || "—")}</td>
        <td>${escapeHtml(p.subcategory || "—")}</td>
        <td>${escapeHtml(p.unit || "—")}</td>
        <td>${escapeHtml(p.price || "—")}</td>
      </tr>`
      )
      .join("");
  }

  async function loadNotifications() {
    const params = formParams("filters-notifications");
    const res = await fetch(`/api/admin/notifications?${params}`);
    const data = await res.json().catch(() => ({}));
    const countEl = document.getElementById("notifications-count");
    if (countEl) countEl.textContent = data.total != null ? `${t("admin.found")}: ${data.total}` : "";
    if (!notificationsBody) return;
    if (!res.ok || !data.ok) {
      notificationsBody.innerHTML = `<tr><td colspan="5" class="ap-empty">${escapeHtml(data.error || t("js.err_send"))}</td></tr>`;
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      notificationsBody.innerHTML = `<tr><td colspan="5" class="ap-empty">${escapeHtml(t("admin.empty_notifications"))}</td></tr>`;
      return;
    }
    notificationsBody.innerHTML = items
      .map((n) => {
        const created = (n.created_at || "").slice(0, 16).replace("T", " ");
        return `<tr>
          <td class="ap-muted">${escapeHtml(created)}</td>
          <td><span class="ap-badge">${escapeHtml(n.type || "—")}</span></td>
          <td><strong>${escapeHtml(n.title || "")}</strong><div class="ap-muted">${escapeHtml(n.body || "")}</div></td>
          <td class="ap-muted">${escapeHtml(n.user_id || "—")}</td>
          <td>${n.read ? t("admin.yes") : t("admin.no")}</td>
        </tr>`;
      })
      .join("");
  }

  async function loadRatings() {
    const params = formParams("filters-ratings");
    const res = await fetch(`/api/admin/ratings?${params}`);
    const data = await res.json().catch(() => ({}));
    const countEl = document.getElementById("ratings-count");
    if (countEl) countEl.textContent = data.total != null ? `${t("admin.found")}: ${data.total}` : "";
    if (!ratingsBody) return;
    if (!res.ok || !data.ok) {
      ratingsBody.innerHTML = `<tr><td colspan="5" class="ap-empty">${escapeHtml(data.error || t("js.err_send"))}</td></tr>`;
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      ratingsBody.innerHTML = `<tr><td colspan="5" class="ap-empty">${escapeHtml(t("admin.empty_ratings"))}</td></tr>`;
      return;
    }
    ratingsBody.innerHTML = items
      .map((r) => {
        const created = (r.created_at || "").slice(0, 16).replace("T", " ");
        return `<tr>
          <td class="ap-muted">${escapeHtml(created)}</td>
          <td><strong>${escapeHtml(r.score || "—")}</strong></td>
          <td class="ap-muted">${escapeHtml(r.from_user_id || "—")}</td>
          <td class="ap-muted">${escapeHtml(r.to_user_id || "—")}</td>
          <td>${escapeHtml(r.comment || "—")}</td>
        </tr>`;
      })
      .join("");
  }

  document.getElementById("ap-refresh")?.addEventListener("click", () => {
    const active = Object.entries(views).find(([, el]) => el && !el.hidden)?.[0] || "overview";
    showTab(active);
  });

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      const overview = views.overview;
      if (overview && !overview.hidden) loadAnalytics();
    }, 8000);
  }

  wireFilters();
  showTab("overview");
  const boot = () =>
    Promise.all([loadFilterMeta(), loadAnalytics()]).finally(() => {
      window.tbHidePageLoader?.();
      startPoll();
    });
  if (window.Chart) boot();
  else window.addEventListener("load", boot);
})();
