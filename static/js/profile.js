function profileLocale() {
  const lang = window.I18N_LANG || "ru";
  if (lang === "kk") return "kk-KZ";
  if (lang === "en") return "en-US";
  return "ru-RU";
}

function formatMemberSince(iso) {
  if (!iso || typeof t !== "function") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const lang = window.I18N_LANG || "ru";
  let cleaned;
  if (lang === "ru") {
    const months = [
      "января", "февраля", "марта", "апреля", "мая", "июня",
      "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ];
    cleaned = `${months[d.getMonth()]} ${d.getFullYear()}`;
  } else {
    const date = d.toLocaleDateString(profileLocale(), {
      month: "long",
      year: "numeric",
    });
    cleaned = String(date).replace(/\s*г\.?\s*$/i, "").trim();
  }
  return t("home.profile_member_since", { date: cleaned });
}

function profileFieldVal(id) {
  let v = profileVal(id);
  if (v === "https://" || v === "http://" || v === "KZ...") return "";
  return v;
}

function profileVal(id) {
  return String(document.getElementById(id)?.value || "").trim();
}

function syncInterestSelect() {
  const select = document.getElementById("profile-preferred-categories");
  const chips = document.getElementById("profile-chips");
  if (!select || !chips) return;
  const on = new Set(
    [...chips.querySelectorAll(".profile-chip.is-on")].map((b) => b.dataset.cat)
  );
  [...select.options].forEach((opt) => {
    opt.selected = on.has(opt.value);
  });
  const countEl = document.getElementById("profile-interest-count");
  if (countEl && typeof t === "function") {
    countEl.textContent = t("home.profile_interest_count", { n: on.size });
  }
}

function updateProfileCompleteness() {
  const isSupplier = !!document.querySelector(".profile-view--supplier");
  let checks;
  if (isSupplier) {
    const cats = document.getElementById("profile-categories-grid");
    const catCount = cats
      ? [...cats.querySelectorAll('input[type="checkbox"]:checked')].length
      : (() => {
          const sel = document.getElementById("profile-categories");
          return sel ? [...sel.options].filter((o) => o.selected).length : 0;
        })();
    const countEl = document.getElementById("profile-cat-count");
    if (countEl && typeof t === "function") {
      countEl.textContent = catCount
        ? t("dash.categories_selected", { n: catCount })
        : t("dash.categories_none");
    }
    checks = [
      !!profileVal("profile-name"),
      !!profileVal("profile-phone"),
      !!profileVal("profile-contact-person"),
      !!profileVal("profile-company-name"),
      /^\d{12}$/.test(profileVal("profile-bin")),
      !!profileVal("profile-legal-address"),
      !!profileVal("profile-actual-address"),
      !!profileFieldVal("profile-website"),
      !!profileVal("profile-bank-name"),
      !!profileVal("profile-bik"),
      !!profileFieldVal("profile-iban"),
      catCount > 0,
      !!profileVal("profile-description"),
    ];
  } else {
    checks = [
      !!profileVal("profile-name"),
      !!profileVal("profile-phone"),
      !!profileVal("profile-city"),
      !!profileVal("profile-position"),
      !!profileVal("profile-company"),
      !!profileVal("profile-address"),
      !!profileVal("profile-about"),
      document.querySelectorAll("#profile-chips .profile-chip.is-on").length > 0,
    ];
  }
  const filled = checks.filter(Boolean).length;
  const pct = Math.round((filled / Math.max(checks.length, 1)) * 100);
  const pctEl = document.getElementById("profile-complete-pct");
  const fill = document.getElementById("profile-complete-fill");
  const bar = document.getElementById("profile-complete-bar");
  if (pctEl && typeof t === "function") {
    pctEl.textContent = t("home.profile_complete_pct", { n: pct });
  } else if (pctEl) {
    pctEl.textContent = `${pct}%`;
  }
  if (fill) fill.style.width = `${pct}%`;
  if (bar) {
    bar.setAttribute("aria-valuenow", String(pct));
    bar.classList.toggle("is-high", pct >= 80);
    bar.classList.toggle("is-mid", pct >= 40 && pct < 80);
  }
}

function renderProfileStats(stats) {
  const grid = document.getElementById("profile-stats-grid");
  if (!grid || !stats) return;
  const favTotal = (stats.favorites_products ?? 0) + (stats.favorites_suppliers ?? 0);
  const cards = [
    {
      label: t("home.profile_stats_requests"),
      value: stats.requests_total ?? 0,
      goto: "history",
    },
    {
      label: t("home.profile_stats_active"),
      value: stats.active ?? 0,
      goto: "history",
      filter: "sent",
    },
    {
      label: t("home.profile_stats_completed"),
      value: stats.completed ?? 0,
      goto: "history",
      filter: "completed",
    },
    {
      label: t("home.profile_stats_offers"),
      value: stats.offers_received ?? 0,
      goto: "history",
    },
    {
      label: t("home.profile_stats_favorites"),
      value: favTotal,
      goto: "favorites",
      sub: t("home.profile_stats_favorites_sub", {
        products: stats.favorites_products ?? 0,
        suppliers: stats.favorites_suppliers ?? 0,
      }),
    },
  ];

  grid.innerHTML = cards
    .map(
      (c) => `
    <button type="button" class="analytics-card analytics-card--btn" data-goto="${c.goto}"${
        c.filter ? ` data-filter="${c.filter}"` : ""
      }>
      <p class="analytics-card__label">${c.label}</p>
      <p class="analytics-card__value">${c.value}</p>
      ${c.sub ? `<p class="analytics-card__sub">${c.sub}</p>` : ""}
    </button>`
    )
    .join("");

  grid.querySelectorAll(".analytics-card--btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.goto;
      if (!view || typeof showView !== "function") return;
      showView(view);
      if (view === "history") {
        if (typeof loadHistoryView === "function") loadHistoryView(true);
        const filter = btn.dataset.filter;
        if (filter) {
          const filterBtn = document.querySelector(
            `#history-filters .history-filter[data-filter="${filter}"]`
          );
          filterBtn?.click();
        }
      }
      location.hash = view;
    });
  });
}

async function loadBuyerProfile(force) {
  const grid = document.getElementById("profile-stats-grid");
  if (!grid) return;
  if (!force && grid.dataset.loaded === "1") {
    updateProfileCompleteness();
    return;
  }

  const sinceEl = document.getElementById("profile-member-since");
  if (sinceEl && !sinceEl.textContent) {
    sinceEl.textContent = formatMemberSince(sinceEl.dataset.since || "");
  }

  grid.innerHTML = `<p class="shell-empty">${t("js.loading")}</p>`;
  try {
    const res = await fetch("/api/my/stats");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      grid.innerHTML = `<p class="shell-empty">${t("home.profile_stats_fail")}</p>`;
      return;
    }
    grid.dataset.loaded = "1";
    renderProfileStats(data.stats);
    if (sinceEl && data.member_since) {
      sinceEl.textContent = formatMemberSince(data.member_since);
    }
  } catch (_) {
    grid.innerHTML = `<p class="shell-empty">${t("home.profile_stats_fail")}</p>`;
  }
  updateProfileCompleteness();
}

window.loadBuyerProfile = loadBuyerProfile;
window.updateProfileCompleteness = updateProfileCompleteness;

document.querySelectorAll(".profile-quick-link").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.goto;
    if (!view || typeof showView !== "function") return;
    showView(view);
    if (view === "history" && typeof loadHistoryView === "function") {
      loadHistoryView(true);
    }
    location.hash = view;
  });
});

const profileChips = document.getElementById("profile-chips");
if (profileChips) {
  profileChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".profile-chip");
    if (!chip) return;
    chip.classList.toggle("is-on");
    chip.setAttribute("aria-pressed", chip.classList.contains("is-on") ? "true" : "false");
    syncInterestSelect();
    updateProfileCompleteness();
  });
}

document.getElementById("profile-clear-interests")?.addEventListener("click", () => {
  document.querySelectorAll("#profile-chips .profile-chip.is-on").forEach((chip) => {
    chip.classList.remove("is-on");
    chip.setAttribute("aria-pressed", "false");
  });
  syncInterestSelect();
  updateProfileCompleteness();
});

const profileFormEl = document.getElementById("profile-form");
if (profileFormEl) {
  profileFormEl.addEventListener("input", () => updateProfileCompleteness());
  profileFormEl.addEventListener("change", () => updateProfileCompleteness());

  const binInput = document.getElementById("profile-bin");
  binInput?.addEventListener("input", () => {
    binInput.value = binInput.value.replace(/\D/g, "").slice(0, 12);
    updateProfileCompleteness();
  });
}

const passwordForm = document.getElementById("password-form");
if (passwordForm) {
  const passwordError = document.getElementById("password-error");
  const passwordSuccess = document.getElementById("password-success");

  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (passwordError) {
      passwordError.hidden = true;
      passwordError.textContent = "";
    }
    if (passwordSuccess) {
      passwordSuccess.hidden = true;
      passwordSuccess.textContent = "";
    }

    const current = passwordForm.querySelector('[name="current_password"]')?.value || "";
    const next = passwordForm.querySelector('[name="new_password"]')?.value || "";
    const confirm = passwordForm.querySelector('[name="confirm_password"]')?.value || "";
    if (next !== confirm) {
      if (passwordError) {
        passwordError.hidden = false;
        passwordError.textContent = t("home.profile_pass_mismatch");
      }
      return;
    }

    const btn = passwordForm.querySelector('[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-busy");
    }

    try {
      const res = await fetch("/api/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (passwordError) {
          passwordError.hidden = false;
          passwordError.textContent = data.error || t("js.err_password");
        }
        return;
      }
      passwordForm.reset();
      if (passwordSuccess) {
        passwordSuccess.hidden = false;
        passwordSuccess.textContent = data.message || t("js.password_changed");
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("is-busy");
      }
    }
  });
}

async function loadSupplierProfileStats() {
  const grid = document.getElementById("supplier-profile-stats");
  if (!grid) return;
  try {
    const res = await fetch("/api/my/analytics");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      grid.innerHTML = "";
      return;
    }
    const s = data.stats || {};
    const win =
      s.win_rate == null ? "—" : `${s.win_rate}%`;
    grid.innerHTML = `
      <div class="analytics-card">
        <p class="analytics-card__label">${t("dash.profile_stats_requests")}</p>
        <p class="analytics-card__value">${s.requests_total ?? 0}</p>
      </div>
      <div class="analytics-card">
        <p class="analytics-card__label">${t("dash.profile_stats_offers")}</p>
        <p class="analytics-card__value">${s.offers_sent ?? 0}</p>
      </div>
      <div class="analytics-card">
        <p class="analytics-card__label">${t("dash.profile_stats_winrate")}</p>
        <p class="analytics-card__value">${win}</p>
      </div>
      <div class="analytics-card">
        <p class="analytics-card__label">${t("dash.profile_stats_deal")}</p>
        <p class="analytics-card__value">${s.in_deal ?? 0}</p>
      </div>
    `;
  } catch (_) {
    grid.innerHTML = "";
  }
}

const sinceBoot = document.getElementById("profile-member-since");
if (sinceBoot && !sinceBoot.textContent) {
  sinceBoot.textContent = formatMemberSince(sinceBoot.dataset.since || "");
}
syncInterestSelect();
updateProfileCompleteness();
window.loadSupplierProfileStats = loadSupplierProfileStats;
loadSupplierProfileStats();

if (location.hash === "#profile") {
  loadBuyerProfile(true);
  loadSupplierProfileStats();
}
