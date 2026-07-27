/* Buyer purchase history — full view with filters */

const viewHistory = document.getElementById("view-history");
const historyFullList = document.getElementById("history-full-list");
const historyFilters = document.getElementById("history-filters");
const historySearch = document.getElementById("history-search");
const navHistory = document.getElementById("nav-history");

let historyCache = [];
let historyFilter = "all";
let historyQuery = "";

function histStatusLabel(status) {
  const tr = typeof t === "function" ? t : (k) => k;
  if (status === "completed") return tr("js.status_completed");
  if (status === "deal") return tr("js.in_deal");
  if (status === "cancelled") return tr("js.cancelled");
  return tr("js.status_waiting");
}

function histStatusClass(status) {
  if (status === "completed") return "is-done";
  if (status === "deal") return "is-deal";
  if (status === "cancelled") return "is-cancelled";
  return "is-sent";
}

function histFormatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const loc = window.I18N_LANG === "en" ? "en-GB" : window.I18N_LANG === "kk" ? "kk-KZ" : "ru-RU";
  return d.toLocaleString(loc, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function histEscape(s) {
  return window.tbEscapeHtml(s);
}

function histCardMeta(item) {
  const tr = typeof t === "function" ? t : (k) => k;
  const status = item.status || "sent";
  if (status === "cancelled") return tr("js.cancelled");
  if (status === "completed") {
    const accepted =
      item.accepted_offer ||
      (item.offers || []).find((o) => o.id === item.accepted_offer_id);
    const company =
      item.deal_partner_name ||
      item.accepted_supplier?.company_name ||
      accepted?.company_name ||
      tr("js.supplier");
    const price = accepted?.price ? `${accepted.price} ₸` : "";
    return [company, price].filter(Boolean).join(" · ");
  }
  if (status === "deal") {
    const partner =
      item.deal_partner_name ||
      item.accepted_supplier?.company_name ||
      tr("js.supplier");
    const price = item.accepted_offer?.price
      ? `${item.accepted_offer.price} ₸`
      : "";
    return [partner, price].filter(Boolean).join(" · ");
  }
  const n = (item.offers || []).length;
  return n ? tr("js.offers_n", { n }) : tr("js.waiting_prices");
}

function filteredHistoryItems() {
  let items = historyCache.slice();
  if (historyFilter !== "all") {
    items = items.filter((i) => (i.status || "sent") === historyFilter);
  }
  const q = historyQuery.trim().toLowerCase();
  if (q) {
    items = items.filter((i) => {
      const hay = [
        i.text,
        i.summary,
        i.deal_partner_name,
        i.accepted_supplier?.company_name,
        ...(i.offers || []).map((o) => o.company_name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  return items;
}

function renderHistoryView() {
  if (!historyFullList) return;
  const items = filteredHistoryItems();
  if (!items.length) {
    historyFullList.innerHTML =
      `<p class="shell-empty">${typeof t === "function" ? t("js.no_items") : "Нет заявок по этому фильтру"}</p>`;
    return;
  }
  historyFullList.innerHTML = items
    .map((item) => {
      const status = item.status || "sent";
      return `
      <article class="history-card" data-id="${histEscape(item.id)}">
        <div class="history-card__top">
          <span class="history-card__status ${histStatusClass(status)}">${histStatusLabel(status)}</span>
          <time class="history-card__date">${histEscape(histFormatDate(item.completed_at || item.deal_started_at || item.created_at))}</time>
        </div>
        <p class="history-card__text">${histEscape(item.text || t("js.request"))}</p>
        <p class="history-card__meta">${histEscape(histCardMeta(item))}</p>
        <div class="history-card__actions">
          <button type="button" class="btn btn--solid btn--sm btn-open-history" data-id="${histEscape(item.id)}">${t("js.open")}</button>
        </div>
      </article>`;
    })
    .join("");

  historyFullList.querySelectorAll(".btn-open-history, .history-card").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (el.classList.contains("history-card") && e.target.closest("button")) return;
      const id = el.dataset.id || el.closest("[data-id]")?.dataset.id;
      const item = historyCache.find((x) => x.id === id);
      if (!item) return;
      if (typeof showView === "function") showView("home");
      if (typeof showRequest === "function") showRequest(item);
    });
  });
}

async function loadHistoryView(force) {
  if (!force && historyCache.length) {
    renderHistoryView();
    return historyCache;
  }
  if (typeof refreshLists === "function") {
    const { history = [], active = [], deals = [] } = await refreshLists();
    historyCache = [...deals, ...active, ...history];
  } else {
    const res = await fetch("/api/requests");
    const data = await res.json().catch(() => ({}));
    historyCache = res.ok && data.ok ? data.items || [] : [];
  }
  // newest first already from API
  renderHistoryView();
  return historyCache;
}

function openHistoryView() {
  if (typeof showView === "function") showView("history");
  loadHistoryView(true);
}

historyFilters?.addEventListener("click", (e) => {
  const btn = e.target.closest(".history-filter");
  if (!btn) return;
  historyFilter = btn.dataset.filter || "all";
  historyFilters.querySelectorAll(".history-filter").forEach((b) => {
    b.classList.toggle("is-active", b === btn);
  });
  renderHistoryView();
});

historySearch?.addEventListener("input", () => {
  historyQuery = historySearch.value || "";
  renderHistoryView();
});

navHistory?.addEventListener("click", (e) => {
  e.preventDefault();
  openHistoryView();
});

// Patch showView to support history
const _prevShowViewHistory = window.showView;
window.showView = function (view) {
  if (typeof _prevShowViewHistory === "function") _prevShowViewHistory(view);
  const hist = document.getElementById("view-history");
  if (hist) hist.hidden = view !== "history";
  document
    .querySelector(".main")
    ?.classList.toggle(
      "catalog-mode",
      view === "favorites" ||
        view === "supplier" ||
        view === "history" ||
        view === "profile"
    );
  if (view === "history") {
    document.querySelectorAll(".sidebar__link[data-view]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.view === "history");
    });
    loadHistoryView(true);
  }
};

window.loadHistoryView = loadHistoryView;
window.openHistoryView = openHistoryView;
window.setHistoryCache = function (items) {
  historyCache = items || [];
};
