/* Admin panel — users / requests */
(() => {
  const escapeHtml = window.tbEscapeHtml || ((v) => String(v ?? ""));
  const t = window.t || ((k) => k);

  const statsEl = document.getElementById("admin-stats");
  const usersBody = document.getElementById("users-tbody");
  const requestsBody = document.getElementById("requests-tbody");
  const tabUsers = document.getElementById("tab-users");
  const tabRequests = document.getElementById("tab-requests");

  function showTab(name) {
    const isUsers = name === "users";
    tabUsers.hidden = !isUsers;
    tabRequests.hidden = isUsers;
    document.querySelectorAll(".sidebar__link[data-tab]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === name);
    });
  }

  document.querySelectorAll(".sidebar__link[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showTab(btn.dataset.tab);
      if (btn.dataset.tab === "requests") loadRequests();
      else loadUsers();
    });
  });

  async function loadStats() {
    const res = await fetch("/api/admin/stats");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !statsEl) return;
    const s = data.stats || {};
    statsEl.innerHTML = `
      <div class="admin-stat"><strong>${s.buyers || 0}</strong><span>${escapeHtml(t("auth.role_user"))}</span></div>
      <div class="admin-stat"><strong>${s.suppliers || 0}</strong><span>${escapeHtml(t("auth.role_supplier"))}</span></div>
      <div class="admin-stat"><strong>${s.blocked || 0}</strong><span>${escapeHtml(t("admin.stat_blocked"))}</span></div>
      <div class="admin-stat"><strong>${s.requests_total || 0}</strong><span>${escapeHtml(t("admin.stat_requests"))}</span></div>
    `;
  }

  async function loadUsers() {
    const q = document.getElementById("users-q")?.value.trim() || "";
    const role = document.getElementById("users-role")?.value || "";
    const blocked = document.getElementById("users-blocked")?.checked ? "1" : "";
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (blocked) params.set("blocked", blocked);
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!usersBody) return;
    if (!res.ok || !data.ok) {
      usersBody.innerHTML = `<tr><td colspan="6" class="shell-empty">${escapeHtml(data.error || t("js.err_send"))}</td></tr>`;
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      usersBody.innerHTML = `<tr><td colspan="6" class="shell-empty">${escapeHtml(t("admin.empty_users"))}</td></tr>`;
      return;
    }
    usersBody.innerHTML = items
      .map((u) => {
        const roleLabel =
          u.role === "supplier" ? t("auth.role_supplier") : t("auth.role_user");
        const status = u.blocked
          ? `<span class="admin-badge admin-badge--bad">${escapeHtml(t("admin.status_blocked"))}</span>`
          : `<span class="admin-badge admin-badge--ok">${escapeHtml(t("admin.status_active"))}</span>`;
        const bin = u.bin
          ? `<code>${escapeHtml(u.bin)}</code>${u.bin.length === 12 ? "" : ` <span class="admin-badge admin-badge--warn">${escapeHtml(t("admin.bin_bad"))}</span>`}`
          : "—";
        const actionLabel = u.blocked ? t("admin.unblock") : t("admin.block");
        return `<tr>
          <td>
            <strong>${escapeHtml(u.name || "")}</strong>
            <div class="admin-muted">${escapeHtml(u.email || "")}</div>
          </td>
          <td>${escapeHtml(roleLabel)}</td>
          <td>${escapeHtml(u.company_name || "—")}</td>
          <td>${bin}</td>
          <td>${status}</td>
          <td class="admin-actions">
            <button type="button" class="btn btn--ghost btn--sm" data-block="${escapeHtml(u.id)}" data-next="${u.blocked ? "0" : "1"}">${escapeHtml(actionLabel)}</button>
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
        loadStats();
      });
    });
  }

  async function loadRequests() {
    const q = document.getElementById("requests-q")?.value.trim() || "";
    const status = document.getElementById("requests-status")?.value || "";
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const res = await fetch(`/api/admin/requests?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!requestsBody) return;
    if (!res.ok || !data.ok) {
      requestsBody.innerHTML = `<tr><td colspan="5" class="shell-empty">${escapeHtml(data.error || t("js.err_send"))}</td></tr>`;
      return;
    }
    const items = data.items || [];
    if (!items.length) {
      requestsBody.innerHTML = `<tr><td colspan="5" class="shell-empty">${escapeHtml(t("admin.empty_requests"))}</td></tr>`;
      return;
    }
    requestsBody.innerHTML = items
      .map((r) => {
        const created = (r.created_at || "").slice(0, 16).replace("T", " ");
        return `<tr>
          <td>
            <div>${escapeHtml(r.text || "")}</div>
            <div class="admin-muted">${escapeHtml((r.matched_categories || []).join(", "))}</div>
          </td>
          <td>
            <strong>${escapeHtml(r.user_name || "")}</strong>
            <div class="admin-muted">${escapeHtml(r.user_email || "")}</div>
          </td>
          <td><span class="admin-badge">${escapeHtml(r.status || "")}</span></td>
          <td>${Number(r.offers_count) || 0}</td>
          <td class="admin-muted">${escapeHtml(created)}</td>
        </tr>`;
      })
      .join("");
  }

  document.getElementById("users-refresh")?.addEventListener("click", loadUsers);
  document.getElementById("requests-refresh")?.addEventListener("click", loadRequests);
  document.getElementById("users-q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadUsers();
  });
  document.getElementById("requests-q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadRequests();
  });
  document.getElementById("users-role")?.addEventListener("change", loadUsers);
  document.getElementById("users-blocked")?.addEventListener("change", loadUsers);
  document.getElementById("requests-status")?.addEventListener("change", loadRequests);

  loadStats();
  // Прячем экран загрузки, когда список пользователей подгрузился
  Promise.resolve(loadUsers()).finally(() => window.tbHidePageLoader?.());
})();
