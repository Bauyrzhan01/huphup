const box = document.getElementById("supplier-requests");
const dealSection = document.getElementById("supplier-deal-section");
const dealTitle = document.getElementById("supplier-deal-title");
const dealPartner = document.getElementById("supplier-deal-partner");
const dealThread = document.getElementById("supplier-deal-thread");
const dealForm = document.getElementById("supplier-deal-form");
const dealInput = document.getElementById("supplier-deal-input");
const dealFile = document.getElementById("supplier-deal-file");
const dealAttach = document.getElementById("supplier-deal-attach");
const dealComplete = document.getElementById("supplier-deal-complete");
const rateBlock = document.getElementById("supplier-rate-block");
const rateTitle = document.getElementById("supplier-rate-title");
const rateStars = document.getElementById("supplier-rate-stars");
const rateComment = document.getElementById("supplier-rate-comment");
const rateSubmit = document.getElementById("supplier-rate-submit");
const rateDone = document.getElementById("supplier-rate-done");
const rateError = document.getElementById("supplier-rate-error");
const productsBox = document.getElementById("supplier-products");
const productForm = document.getElementById("product-form");
const productCategory = document.getElementById("product-category");
const productSubcategory = document.getElementById("product-subcategory");

let activeDealId = null;
let dealPollTimer = null;
let editingProductId = null;
let pendingRateScore = 0;

let CATALOG_CATEGORIES = Array.isArray(window.CATALOG_CATEGORIES)
  ? window.CATALOG_CATEGORIES
  : [];
const CATEGORY_OPTIONS =
  Array.isArray(window.CATEGORY_OPTIONS) && window.CATEGORY_OPTIONS.length
    ? window.CATEGORY_OPTIONS
    : [];
const SUPPLIER_CATEGORY = window.SUPPLIER_CATEGORY || "";

function detailLabels() {
  return {
    "город": t("js.detail.city"),
    "доставка": t("js.detail.delivery"),
    "марка_бетона": t("js.detail.concrete"),
    "марка_цемента": t("js.detail.cement"),
    "вид_дерева": t("js.detail.wood"),
    "стек": t("js.detail.stack"),
    "срок": t("js.detail.term"),
    "формат_работы": t("js.detail.format"),
    "уровень": t("js.detail.level"),
  };
}

function escapeHtml(value) {
  return window.tbEscapeHtml(value);
}

function formatItem(item) {
  const qty = item.qty ? `${item.qty} ${item.unit || ""} `.trim() + " " : "";
  const size = item.size ? ` · ${item.size}` : "";
  return `${qty}${item.name || t("js.position")}${size}`.trim();
}

function formatDetails(details, forYou) {
  if (!details || !Object.keys(details).length) return "";
  const cats = new Set((forYou || []).map((i) => i.category).filter(Boolean));
  const allow = new Set(["город", "доставка", "срок"]);
  if (!cats.size || cats.has("Строительство") || cats.has("Стройматериалы")) {
    ["марка_бетона", "марка_цемента", "вид_дерева", "тип_кирпича"].forEach((k) => allow.add(k));
  }
  if (cats.has("IT и ПО")) {
    ["стек", "формат_работы", "уровень"].forEach((k) => allow.add(k));
  }
  const bits = [];
  for (const [key, label] of Object.entries(detailLabels())) {
    if (allow.has(key) && details[key]) bits.push(`${label}: ${details[key]}`);
  }
  return bits.join(" · ");
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDeadline(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return t("js.hm", { h, m });
  if (m > 0) return t("js.m_only", { m });
  return t("js.s_only", { s });
}

/* ---------- Tabs ---------- */
function showTab(name) {
  document.querySelectorAll(".dash-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === name);
  });
  document.querySelectorAll(".dash-panel").forEach((panel) => {
    const on = panel.id === `tab-${name}`;
    panel.hidden = !on;
    panel.classList.toggle("is-active", on);
  });
  if (name === "products") loadProducts();
  if (name === "requests") loadRequests();
  if (name === "history") loadSupplierHistory(true);
  if (name === "analytics") loadAnalytics(true);
  if (name === "oversee") loadOversee(true);
  if (name === "team") loadTeamPanel();
  if (name === "profile" && typeof loadSupplierProfileStats === "function") {
    loadSupplierProfileStats();
  }
  const hash = name === "requests" ? "" : `#${name}`;
  if (location.hash !== hash) {
    history.replaceState(null, "", hash || location.pathname);
  }
}

document.getElementById("dash-tabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".dash-tab");
  if (!btn) return;
  showTab(btn.dataset.tab);
});

document.querySelector("#tab-profile .profile-hero__quick")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (!btn) return;
  showTab(btn.dataset.tab);
});

document.getElementById("refresh-requests")?.addEventListener("click", () => loadRequests());
document.getElementById("refresh-history")?.addEventListener("click", () => loadSupplierHistory(true));
document.getElementById("refresh-analytics")?.addEventListener("click", () => loadAnalytics(true));
document.getElementById("refresh-oversee")?.addEventListener("click", () => loadOversee(true));

/* ---------- Analytics ---------- */
const analyticsGrid = document.getElementById("analytics-grid");

function formatDuration(sec) {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  if (s < 60) return t("js.s_only", { s });
  const m = Math.floor(s / 60);
  if (m < 60) return t("js.m_only", { m });
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? t("js.hm_rem", { h, m: rm }) : t("js.h_only", { h });
}

async function loadAnalytics(force) {
  if (!analyticsGrid) return;
  if (!force && analyticsGrid.dataset.loaded === "1") return;
  analyticsGrid.innerHTML = `<p class="shell-empty">${t("js.loading")}</p>`;
  const res = await fetch("/api/my/analytics");
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    analyticsGrid.innerHTML = `<p class="shell-empty">${t("js.analytics_fail")}</p>`;
    return;
  }
  const s = data.stats || {};
  analyticsGrid.dataset.loaded = "1";
  analyticsGrid.innerHTML = `
    <article class="analytics-card">
      <p class="analytics-card__label">${t("js.analytics_incoming")}</p>
      <p class="analytics-card__value">${s.requests_total ?? 0}</p>
    </article>
    <article class="analytics-card">
      <p class="analytics-card__label">${t("js.analytics_sent")}</p>
      <p class="analytics-card__value">${s.offers_sent ?? 0}</p>
    </article>
    <article class="analytics-card">
      <p class="analytics-card__label">Win-rate</p>
      <p class="analytics-card__value">${s.win_rate != null ? s.win_rate + "%" : "—"}</p>
      <p class="analytics-card__sub">${t("js.won_lost", { won: s.won ?? 0, lost: s.lost ?? 0 })}</p>
    </article>
    <article class="analytics-card">
      <p class="analytics-card__label">${t("js.analytics_avg")}</p>
      <p class="analytics-card__value">${formatDuration(s.avg_response_seconds)}</p>
    </article>
    <article class="analytics-card">
      <p class="analytics-card__label">${t("js.in_deal_now")}</p>
      <p class="analytics-card__value">${s.in_deal ?? 0}</p>
    </article>
  `;
}

/* ---------- Offer templates ---------- */
let offerTemplates = [];

async function loadOfferTemplates() {
  const res = await fetch("/api/my/offer-templates");
  const data = await res.json().catch(() => ({}));
  offerTemplates = res.ok && data.ok ? data.items || [] : [];
  return offerTemplates;
}

function templatesBarHtml(requestId) {
  if (!offerTemplates.length) {
    return `<div class="offer-templates" data-req="${escapeHtml(requestId)}">
      <span class="offer-templates__label">${t("js.templates_label")}</span>
      <span class="offer-templates__empty">${t("js.no_templates")}</span>
    </div>`;
  }
  const chips = offerTemplates
    .map(
      (tpl) =>
        `<button type="button" class="offer-tpl-chip" data-id="${escapeHtml(tpl.id)}" title="${escapeHtml(
          [tpl.price && tpl.price + " ₸", tpl.term, tpl.delivery].filter(Boolean).join(" · ")
        )}">${escapeHtml(tpl.name || t("js.template"))}</button>`
    )
    .join("");
  return `<div class="offer-templates" data-req="${escapeHtml(requestId)}">
    <span class="offer-templates__label">${t("js.templates")}</span>
    ${chips}
  </div>`;
}

function applyTemplateToForm(form, tpl) {
  if (!form || !tpl) return;
  if (form.price && tpl.price) form.price.value = tpl.price;
  if (form.term && tpl.term != null) form.term.value = tpl.term;
  if (form.delivery && tpl.delivery != null) form.delivery.value = tpl.delivery;
  if (form.message && tpl.message != null) form.message.value = tpl.message;
}

/* ---------- Supplier sales history ---------- */
const supplierHistoryList = document.getElementById("supplier-history-list");
const supplierHistoryFilters = document.getElementById("supplier-history-filters");
const supplierHistorySearch = document.getElementById("supplier-history-search");

let supplierHistoryCache = [];
let supplierHistoryFilter = "all";
let supplierHistoryQuery = "";

function supplierHistKind(item) {
  if (item.is_deal_party && item.status === "completed") return "won";
  if (item.is_deal_party && item.status === "deal") return "deal";
  if (item.my_offer && !item.is_deal_party && (item.status === "deal" || item.status === "completed")) {
    return "lost";
  }
  if (item.my_offer) return "offered";
  return "other";
}

function supplierHistLabel(kind) {
  const tr = typeof t === "function" ? t : (k) => k;
  if (kind === "won") return tr("js.won");
  if (kind === "deal") return tr("js.in_deal");
  if (kind === "lost") return tr("js.lost");
  if (kind === "offered") return t("js.reply_sent");
  return t("js.request");
}

function supplierHistClass(kind) {
  if (kind === "won") return "is-done";
  if (kind === "deal") return "is-deal";
  if (kind === "lost") return "is-lost";
  return "is-sent";
}

function filteredSupplierHistory() {
  let items = supplierHistoryCache.filter((i) => {
    const kind = supplierHistKind(i);
    return kind === "won" || kind === "deal" || kind === "lost" || kind === "offered";
  });
  if (supplierHistoryFilter === "won") {
    items = items.filter((i) => supplierHistKind(i) === "won");
  } else if (supplierHistoryFilter === "deal") {
    items = items.filter((i) => supplierHistKind(i) === "deal");
  } else if (supplierHistoryFilter === "lost") {
    items = items.filter((i) => supplierHistKind(i) === "lost");
  }
  const q = supplierHistoryQuery.trim().toLowerCase();
  if (q) {
    items = items.filter((i) => {
      const hay = [i.text, i.user_name, i.summary, i.my_offer?.price]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  return items;
}

function renderSupplierHistory() {
  if (!supplierHistoryList) return;
  const items = filteredSupplierHistory();
  if (!items.length) {
    supplierHistoryList.innerHTML =
      '<p class="shell-empty">${t("js.no_items")}</p>';
    return;
  }
  supplierHistoryList.innerHTML = items
    .map((item) => {
      const kind = supplierHistKind(item);
      const price = item.my_offer?.price || item.accepted_offer?.price || "";
      const date = formatDate(item.completed_at || item.deal_started_at || item.created_at);
      const action =
        item.is_deal_party
          ? `<button type="button" class="btn btn--solid btn--sm btn-open-hist-deal" data-id="${escapeHtml(item.id)}">${t("js.open")}</button>`
          : "";
      return `
      <article class="history-card">
        <div class="history-card__top">
          <span class="history-card__status ${supplierHistClass(kind)}">${supplierHistLabel(kind)}</span>
          <time class="history-card__date">${escapeHtml(date)}</time>
        </div>
        <p class="history-card__text">${escapeHtml(item.text || t("js.request"))}</p>
        <p class="history-card__meta">${escapeHtml(
          [item.user_name || t("js.client"), price ? `${price} ₸` : ""].filter(Boolean).join(" · ")
        )}</p>
        <div class="history-card__actions">${action}</div>
      </article>`;
    })
    .join("");

  const map = Object.fromEntries(items.map((i) => [i.id, i]));
  supplierHistoryList.querySelectorAll(".btn-open-hist-deal").forEach((btn) => {
    btn.addEventListener("click", () => {
      const req = map[btn.dataset.id];
      if (!req) return;
      showTab("requests");
      openDeal(req);
    });
  });
}

async function loadSupplierHistory(force) {
  if (!force && supplierHistoryCache.length) {
    renderSupplierHistory();
    return;
  }
  const res = await fetch("/api/requests");
  const data = await res.json().catch(() => ({}));
  supplierHistoryCache = res.ok && data.ok ? data.items || [] : [];
  renderSupplierHistory();
}

supplierHistoryFilters?.addEventListener("click", (e) => {
  const btn = e.target.closest(".history-filter");
  if (!btn) return;
  supplierHistoryFilter = btn.dataset.filter || "all";
  supplierHistoryFilters.querySelectorAll(".history-filter").forEach((b) => {
    b.classList.toggle("is-active", b === btn);
  });
  renderSupplierHistory();
});

supplierHistorySearch?.addEventListener("input", () => {
  supplierHistoryQuery = supplierHistorySearch.value || "";
  renderSupplierHistory();
});

/* ---------- Deal chat ---------- */
function stopDealPoll() {
  if (dealPollTimer) {
    clearInterval(dealPollTimer);
    dealPollTimer = null;
  }
}

function startDealPoll(requestId) {
  stopDealPoll();
  activeDealId = requestId;
  dealPollTimer = setInterval(async () => {
    if (!activeDealId) return;
    try {
      const res = await fetch(`/api/requests/${activeDealId}/messages`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        renderDealMessages(data.messages || [], data.request);
        if (data.status === "completed") {
          stopDealPoll();
          loadRequests();
        }
      }
    } catch {
      /* ignore */
    }
  }, 4000);
}

function renderDealMessages(messages, req) {
  const atBottom =
    dealThread.scrollHeight - dealThread.scrollTop - dealThread.clientHeight < 80;
  const attHtml = window.tbDealAttachmentHtml || (() => "");
  dealThread.innerHTML = "";
  (messages || []).forEach((msg) => {
    const row = document.createElement("div");
    const role = msg.role || "system";
    row.className = `deal-msg ${role}`;
    if (role === "system") {
      row.innerHTML = `<div class="deal-msg-bubble system">${escapeHtml(msg.text)}</div>`;
    } else {
      const mine = role === "supplier";
      row.classList.toggle("mine", mine);
      row.classList.toggle("theirs", !mine);
      const attachment = msg.attachment ? attHtml(msg.attachment) : "";
      const textPart = msg.text ? `<div class="deal-msg-bubble">${escapeHtml(msg.text)}</div>` : "";
      row.innerHTML = `
        <div class="deal-msg-meta">${escapeHtml(msg.sender_name || "")}</div>
        ${textPart}
        ${attachment}
      `;
    }
    dealThread.appendChild(row);
  });
  if (atBottom) dealThread.scrollTop = dealThread.scrollHeight;

  const open = req?.status === "deal";
  dealForm.hidden = !open;
  dealComplete.hidden = !open;
  if (dealInput) dealInput.disabled = !open;
  dealTitle.textContent = open ? t("js.deal_with_client") : t("js.deal_done");
}

function showRateError(msg) {
  if (!rateError) return;
  rateError.hidden = !msg;
  rateError.textContent = msg || "";
}

function paintRateStars(score) {
  if (!rateStars) return;
  rateStars.querySelectorAll(".rate-star").forEach((btn) => {
    const v = Number(btn.dataset.score);
    btn.classList.toggle("is-on", v <= score);
  });
}

function bindRateStars() {
  if (!rateStars || rateStars.dataset.bound) return;
  rateStars.dataset.bound = "1";
  rateStars.innerHTML = [1, 2, 3, 4, 5]
    .map((n) => `<button type="button" class="rate-star" data-score="${n}" aria-label="${n}">?</button>`)
    .join("");
  rateStars.addEventListener("click", (e) => {
    const btn = e.target.closest(".rate-star");
    if (!btn) return;
    pendingRateScore = Number(btn.dataset.score);
    paintRateStars(pendingRateScore);
    showRateError("");
  });
}

const dealNext = document.getElementById("supplier-deal-next");
const dealNextContacts = document.getElementById("supplier-deal-next-contacts");

function renderDealNext(req) {
  if (!dealNext) return;
  const completed = req?.status === "completed" && req?.is_deal_party;
  if (!completed) {
    dealNext.hidden = true;
    return;
  }
  dealNext.hidden = false;
  const name = req.deal_partner_name || req.user_name || t("js.client");
  const phone = req.deal_partner_phone || "";
  const email = req.deal_partner_email || "";
  if (dealNextContacts) {
    const phoneHtml = phone
      ? `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>`
      : escapeHtml(t("js.no_phone"));
    const emailHtml = email
      ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`
      : escapeHtml(t("js.no_email"));
    dealNextContacts.innerHTML = `
      <strong>${escapeHtml(t("home.deal_next_contacts"))}: ${escapeHtml(name)}</strong>
      <span>${phoneHtml}</span>
      <span>${emailHtml}</span>
    `;
  }
}

function renderRateBlock(req) {
  renderDealNext(req);
  if (!rateBlock) return;
  const completed = req?.status === "completed" && req?.is_deal_party;
  if (!completed) {
    rateBlock.hidden = true;
    return;
  }
  rateBlock.hidden = false;
  bindRateStars();
  const name = req.rate_target_name || t("js.rate_buyer");
  if (req.my_rating) {
    if (rateTitle) rateTitle.textContent = t("js.your_rating");
    if (rateStars) rateStars.hidden = true;
    if (rateComment) rateComment.hidden = true;
    if (rateSubmit) rateSubmit.hidden = true;
    if (rateDone) {
      rateDone.hidden = false;
      const c = req.my_rating.comment ? ` · ${req.my_rating.comment}` : "";
      rateDone.textContent = t("js.score_of_5", { score: req.my_rating.score }) + c;
    }
    showRateError("");
    return;
  }
  if (rateTitle) rateTitle.textContent = t("js.rate_name", { name });
  if (rateStars) rateStars.hidden = false;
  if (rateComment) {
    rateComment.hidden = false;
    rateComment.value = "";
  }
  if (rateSubmit) rateSubmit.hidden = false;
  if (rateDone) rateDone.hidden = true;
  pendingRateScore = 0;
  paintRateStars(0);
  showRateError("");
}

function openDeal(req) {
  dealSection.hidden = false;
  activeDealId = req.id;
  const price = req.accepted_offer?.price;
  dealPartner.textContent = price
    ? `${req.user_name || t("js.client")} · ${t("js.your_price")} ${price} ₸`
    : req.user_name || t("js.client");
  renderDealMessages(req.deal_messages || [], req);
  renderRateBlock(req);
  if (req.status === "deal") startDealPoll(req.id);
  else stopDealPoll();
}

/* ---------- Requests ---------- */
function renderRequests(items) {
  const open = items.filter((i) => {
    if ((i.status || "sent") !== "sent") return false;
    if (i.my_offer) return true;
    return !i.offer_expired;
  });
  const deals = items.filter((i) => i.status === "deal" && i.is_deal_party);
  const completed = items.filter((i) => i.status === "completed" && i.is_deal_party);
  const lost = items.filter(
    (i) =>
      (i.status === "deal" || i.status === "completed") &&
      !i.is_deal_party &&
      i.my_offer
  );

  if (!open.length && !deals.length && !completed.length && !lost.length) {
    box.innerHTML = `<p class="shell-side-empty">${t("js.no_incoming")}</p>`;
    dealSection.hidden = true;
    stopDealPoll();
    return;
  }

  box.innerHTML = "";

  if (deals.length) {
    const note = document.createElement("p");
    note.className = "request-section-label";
    note.textContent = t("js.active_deals");
    box.appendChild(note);
    deals.forEach((item) => {
      const card = document.createElement("article");
      card.className = "request-card is-deal";
      card.innerHTML = `
        <div class="request-head">
          <strong>${escapeHtml(item.user_name || t("js.client"))}</strong>
          <span>${t("js.chat")}</span>
        </div>
        <p class="request-meta">${t("js.client_chose_you", { price: escapeHtml(item.accepted_offer?.price || "") })} ?</p>
        <button type="button" class="btn btn--solid btn-open-deal" data-id="${escapeHtml(item.id)}">${t("js.open_chat")}</button>
      `;
      box.appendChild(card);
    });
  }

  if (completed.length) {
    const note = document.createElement("p");
    note.className = "request-section-label";
    note.textContent = t("js.completed_deals");
    box.appendChild(note);
    completed.forEach((item) => {
      const card = document.createElement("article");
      card.className = "request-card";
      const rateHint = item.can_rate
        ? t("js.rate_buyer_title")
        : item.my_rating
          ? t("js.your_score", { score: item.my_rating.score })
          : t("js.deal_done");
      card.innerHTML = `
        <div class="request-head">
          <strong>${escapeHtml(item.user_name || t("js.client"))}</strong>
          <span>${t("js.done")}</span>
        </div>
        <p class="request-meta">${escapeHtml(rateHint)}</p>
        <button type="button" class="btn btn--solid btn-open-deal" data-id="${escapeHtml(item.id)}">${t("js.open")}</button>
      `;
      box.appendChild(card);
    });
  }

  open.forEach((item) => {
    const offered = item.my_offer;
    const lines = item.for_you?.length
      ? item.for_you
      : item.items?.length
        ? item.items
        : null;
    const details = formatDetails(item.details, lines);
    const date = formatDate(item.created_at);
    const left = Number(item.seconds_left);
    const offerStatus = offered?.status || "active";
    let deadlineLabel =
      offered
        ? t("js.price_sent")
        : Number.isFinite(left)
          ? left > 0
            ? t("js.reply_in", { time: formatDeadline(left) })
            : t("js.expired")
          : t("js.deadline_h", { n: item.deadline_hours || 5 });
    if (offerStatus === "rejected") {
      deadlineLabel = `${t("js.rejected")}${offered.reject_reason ? `: ${offered.reject_reason}` : ""}`;
    } else if (offerStatus === "counter") {
      deadlineLabel = `${t("js.countered")}${
        offered.counter_price ? `: ${offered.counter_price} ₸` : ""
      }${offered.counter_message ? ` — ${offered.counter_message}` : ""}`;
    }
    const positionsHtml = lines
      ? `<ul class="request-positions">${lines
          .map((line) => `<li>${escapeHtml(formatItem(line))}</li>`)
          .join("")}</ul>`
      : `<p class="request-text">${escapeHtml(item.text || t("js.request"))}</p>`;

    const card = document.createElement("article");
    card.className = "request-card" + (!offered && left > 0 && left < 3600 ? " is-urgent" : "");
    card.innerHTML = `
      <div class="request-head">
        <strong>${escapeHtml(item.user_name || t("js.client"))}</strong>
        <span>${escapeHtml(date)}</span>
      </div>
      <p class="request-deadline${offered ? " is-done" : left > 0 && left < 3600 ? " is-urgent" : ""}">${escapeHtml(deadlineLabel)}</p>
      ${
        offered?.acted_by_name
          ? `<p class="request-meta">${escapeHtml(t("dash.acted_by", { name: offered.acted_by_name }))}</p>`
          : ""
      }
      ${positionsHtml}
      ${details ? `<p class="request-meta">${escapeHtml(details)}</p>` : ""}
      ${templatesBarHtml(item.id)}
      <form class="offer-form" data-id="${escapeHtml(item.id)}">
        <div class="offer-row">
          <label>
            ${t("js.price_tenge")}
            <input type="text" name="price" required value="${escapeHtml(offered?.price || "")}" placeholder="250000">
          </label>
          <label>
            ${t("js.term")}
            <input type="text" name="term" value="${escapeHtml(offered?.term || "")}" placeholder="${t('js.term_ph')}" maxlength="120">
          </label>
          <label>
            ${t("js.delivery")}
            <input type="text" name="delivery" value="${escapeHtml(offered?.delivery || "")}" placeholder="${t('js.delivery_ph')}" maxlength="120">
          </label>
          <label class="offer-comment">
            ${t("js.comment")}
            <input type="text" name="message" value="${escapeHtml(offered?.message || "")}" placeholder="${t('js.message_terms_ph')}">
          </label>
        </div>
        <div class="offer-form-actions">
          <button class="btn btn--solid" type="submit">${offered ? t("js.update_price") : t("js.send_price")}</button>
          <button class="btn btn--ghost btn--sm btn-save-tpl" type="button">${t("js.save_template")}</button>
        </div>
        <p class="form-success" hidden></p>
        <p class="form-error" hidden></p>
      </form>
    `;
    box.appendChild(card);
  });

  if (lost.length) {
    const note = document.createElement("p");
    note.className = "request-section-label";
    note.textContent = t("js.other_chosen");
    box.appendChild(note);
    lost.slice(0, 5).forEach((item) => {
      const card = document.createElement("article");
      card.className = "request-card is-lost";
      card.innerHTML = `
        <div class="request-head">
          <strong>${escapeHtml(item.user_name || t("js.client"))}</strong>
          <span>${t("js.not_selected_short")}</span>
        </div>
        <p class="request-meta">${t("js.client_chose_other")}</p>
      `;
      box.appendChild(card);
    });
  }

  box.querySelectorAll(".offer-tpl-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const bar = btn.closest(".offer-templates");
      const form = bar?.parentElement?.querySelector(".offer-form");
      const tpl = offerTemplates.find((t) => t.id === btn.dataset.id);
      applyTemplateToForm(form, tpl);
    });
  });

  box.querySelectorAll(".btn-save-tpl").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const form = btn.closest(".offer-form");
      if (!form) return;
      const name =
        prompt(t("js.template_name"), t("js.template_default")) || t("js.template");
      const res = await fetch("/api/my/offer-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          price: form.price.value.trim(),
          term: form.term?.value.trim() || "",
          delivery: form.delivery?.value.trim() || "",
          message: form.message.value.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error || t("js.err_template"));
        return;
      }
      offerTemplates = data.items || [];
      loadRequests();
    });
  });

  box.querySelectorAll(".offer-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = form.dataset.id;
      const success = form.querySelector(".form-success");
      const error = form.querySelector(".form-error");
      success.hidden = true;
      error.hidden = true;
      const payload = {
        price: form.price.value.trim(),
        term: form.term?.value.trim() || "",
        delivery: form.delivery?.value.trim() || "",
        message: form.message.value.trim(),
      };
      const res = await fetch(`/api/requests/${id}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        error.hidden = false;
        error.textContent = data.error || t("js.err_send");
        return;
      }
      success.hidden = false;
      success.textContent = t("js.price_sent_ok");
      loadRequests();
    });
  });

  const dealMap = Object.fromEntries(
    [...deals, ...completed].map((d) => [d.id, d])
  );
  box.querySelectorAll(".btn-open-deal").forEach((btn) => {
    btn.addEventListener("click", () => {
      const req = dealMap[btn.dataset.id];
      if (req) openDeal(req);
    });
  });

  if (deals.length) openDeal(deals[0]);
  else if (completed.some((c) => c.can_rate)) {
    openDeal(completed.find((c) => c.can_rate));
  } else if (activeDealId && dealMap[activeDealId]) {
    openDeal(dealMap[activeDealId]);
  } else {
    dealSection.hidden = true;
    stopDealPoll();
  }
}

dealAttach?.addEventListener("click", () => dealFile?.click());

async function sendSupplierDealMessage(text, attachmentId) {
  const res = await fetch(`/api/requests/${activeDealId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text || "", attachment_id: attachmentId || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    alert(data.error || t("js.err_send"));
    return false;
  }
  renderDealMessages(data.messages || [], data.request);
  dealThread.scrollTop = dealThread.scrollHeight;
  return true;
}

async function uploadSupplierDealFile(file) {
  if (file.size > 5 * 1024 * 1024) {
    alert(t("js.file_too_large"));
    return null;
  }
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/requests/${activeDealId}/attachments`, {
    method: "POST",
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    alert(data.error || t("js.file_type_bad"));
    return null;
  }
  return data.attachment?.id || null;
}

dealFile?.addEventListener("change", async () => {
  const file = dealFile.files?.[0];
  dealFile.value = "";
  if (!file || !activeDealId) return;
  const text = dealInput.value.trim();
  dealInput.value = "";
  if (typeof window.tbAutoGrowTextarea === "function") {
    window.tbAutoGrowTextarea(dealInput);
  }
  const attachmentId = await uploadSupplierDealFile(file);
  if (!attachmentId) return;
  await sendSupplierDealMessage(text, attachmentId);
});

dealForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeDealId) return;
  const text = dealInput.value.trim();
  if (!text) return;
  dealInput.value = "";
  if (typeof window.tbAutoGrowTextarea === "function") {
    window.tbAutoGrowTextarea(dealInput);
  }
  await sendSupplierDealMessage(text);
});

dealComplete?.addEventListener("click", async () => {
  if (!activeDealId) return;
  if (!confirm(t("js.confirm_deal"))) return;
  const res = await fetch(`/api/requests/${activeDealId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    alert(data.error || t("js.err_complete"));
    return;
  }
  stopDealPoll();
  renderDealMessages(data.request?.deal_messages || [], data.request);
  renderRateBlock(data.request);
  loadRequests();
});

rateSubmit?.addEventListener("click", async () => {
  if (!activeDealId) return;
  if (!pendingRateScore) {
    showRateError(t("js.pick_rating"));
    return;
  }
  const res = await fetch(`/api/requests/${activeDealId}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      score: pendingRateScore,
      comment: (rateComment?.value || "").trim(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    showRateError(data.error || t("js.err_rating"));
    return;
  }
  showRateError("");
  if (data.request) renderRateBlock(data.request);
});

async function loadRequests() {
  await loadOfferTemplates();
  const res = await fetch("/api/requests");
  const data = await res.json();
  if (!res.ok || !data.ok) {
    box.innerHTML = `<p class="shell-side-empty">${escapeHtml(t("js.err_load_requests"))}</p>`;
    return;
  }
  renderRequests(data.items || []);
}

/* ---------- Team (owner) ---------- */
async function loadTeamPanel() {
  if (!window.IS_SUPPLIER_OWNER) return;
  await Promise.all([loadTeamMembers(), loadTeamActivity()]);
}

async function loadTeamMembers() {
  const el = document.getElementById("team-members");
  if (!el) return;
  const res = await fetch("/api/team/members");
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    el.innerHTML = `<p class="shell-empty">${escapeHtml(data.error || t("js.err_send"))}</p>`;
    return;
  }
  const items = data.items || [];
  if (!items.length) {
    el.innerHTML = `<p class="shell-empty">${escapeHtml(t("dash.team_empty"))}</p>`;
    return;
  }
  el.innerHTML = items
    .map((m) => {
      const role =
        m.supplier_role === "owner" ? t("dash.role_owner") : t("dash.role_manager");
      const blocked = m.blocked ? ` · ${t("dash.team_blocked")}` : "";
      const actions =
        m.supplier_role === "manager"
          ? `<button type="button" class="btn btn--ghost btn--sm team-block-btn" data-id="${escapeHtml(
              m.id
            )}" data-blocked="${m.blocked ? "0" : "1"}">${
              m.blocked ? t("dash.team_unblock") : t("dash.team_block")
            }</button>`
          : "";
      return `<article class="request-card team-member-card">
        <div class="request-head">
          <strong>${escapeHtml(m.name || m.email || "")}</strong>
          <span>${escapeHtml(role)}${escapeHtml(blocked)}</span>
        </div>
        <p class="request-meta">${escapeHtml(m.email || "")}</p>
        ${presenceBadgeHtml(
          m.presence || "offline",
          m.presence === "in_process" && m.active_deals
            ? t("dash.presence_deals", { n: m.active_deals })
            : ""
        )}
        ${actions}
      </article>`;
    })
    .join("");

  el.querySelectorAll(".team-block-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const blocked = btn.dataset.blocked === "1";
      const res2 = await fetch(`/api/team/members/${id}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked }),
      });
      const d2 = await res2.json().catch(() => ({}));
      if (!res2.ok || !d2.ok) {
        alert(d2.error || t("js.err_send"));
        return;
      }
      loadTeamMembers();
    });
  });
}

async function loadTeamActivity() {
  const el = document.getElementById("team-activity");
  if (!el) return;
  const res = await fetch("/api/team/activity?limit=40");
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    el.innerHTML = `<p class="shell-empty">${escapeHtml(data.error || t("js.err_send"))}</p>`;
    return;
  }
  const items = data.items || [];
  if (!items.length) {
    el.innerHTML = `<p class="shell-empty">${escapeHtml(t("dash.team_activity_empty"))}</p>`;
    return;
  }
  el.innerHTML = items
    .map((ev) => {
      const who = ev.acted_by_name || "?";
      const when = formatDate(ev.created_at);
      const kind =
        ev.type === "offer"
          ? `${t("js.price_tenge")}: ${escapeHtml(ev.price || "")} ₸`
          : escapeHtml(ev.text || t("js.send"));
      return `<article class="request-card">
        <div class="request-head">
          <strong>${escapeHtml(who)}</strong>
          <span>${escapeHtml(when)}</span>
        </div>
        <p class="request-meta">${kind}</p>
        <p class="request-text">${escapeHtml(ev.request_text || "")}</p>
      </article>`;
    })
    .join("");
}

document.getElementById("team-invite-btn")?.addEventListener("click", async () => {
  const boxEl = document.getElementById("team-invite-box");
  const urlInput = document.getElementById("team-invite-url");
  const okEl = document.getElementById("team-invite-ok");
  const res = await fetch("/api/team/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    alert(data.error || t("js.err_send"));
    return;
  }
  if (boxEl) boxEl.hidden = false;
  if (urlInput) urlInput.value = data.invite_url || "";
  if (okEl) {
    okEl.hidden = false;
    okEl.textContent = data.message || t("dash.team_invite_created");
  }
});

document.getElementById("team-invite-copy")?.addEventListener("click", async () => {
  const urlInput = document.getElementById("team-invite-url");
  const text = urlInput?.value || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    urlInput.select();
    document.execCommand("copy");
  }
  const okEl = document.getElementById("team-invite-ok");
  if (okEl) {
    okEl.hidden = false;
    okEl.textContent = t("dash.team_copied");
  }
});

/* ---------- Oversee (owner: manager <-> client) ---------- */
const overseeState = {
  stage: "",
  managerId: "",
  selectedId: "",
  items: [],
  managers: [],
};

function presenceLabel(status) {
  if (status === "online") return t("dash.presence_online");
  if (status === "in_process") return t("dash.presence_in_process");
  return t("dash.presence_offline");
}

function presenceBadgeHtml(status, extra = "") {
  const st = status || "offline";
  return `<span class="presence-inline" data-presence="${escapeHtml(st)}"><span class="presence-inline__dot" aria-hidden="true"></span>${escapeHtml(
    presenceLabel(st)
  )}${extra ? ` · ${escapeHtml(extra)}` : ""}</span>`;
}

function overseeStageLabel(stage) {
  const map = {
    waiting: "dash.oversee_waiting",
    offered: "dash.oversee_offered",
    counter: "dash.oversee_counter",
    deal: "dash.oversee_deal",
    completed: "dash.oversee_completed",
    rejected: "js.rejected",
  };
  return t(map[stage] || "dash.oversee_all");
}

function overseeTimelineTitle(kind) {
  const map = {
    request: "dash.oversee_tl_request",
    offer: "dash.oversee_tl_offer",
    counter: "dash.oversee_tl_counter",
    rejected: "dash.oversee_tl_rejected",
    accepted: "dash.oversee_tl_accepted",
    message: "dash.oversee_tl_message",
    completed: "dash.oversee_tl_completed",
  };
  return t(map[kind] || "dash.oversee_tl_message");
}

function renderOverseeStats(stats) {
  const el = document.getElementById("oversee-stats");
  if (!el) return;
  const s = stats || {};
  const cards = [
    ["dash.oversee_stat_waiting", s.waiting || 0],
    ["dash.oversee_stat_offered", s.offered || 0],
    ["dash.oversee_stat_deal", s.deal || 0],
    ["dash.oversee_stat_done", s.completed || 0],
  ];
  el.innerHTML = cards
    .map(
      ([label, value]) => `
      <article class="oversee-stat">
        <span class="oversee-stat__label">${escapeHtml(t(label))}</span>
        <span class="oversee-stat__value">${escapeHtml(String(value))}</span>
      </article>`
    )
    .join("");
}

function renderPresenceBoard(managers) {
  const el = document.getElementById("presence-board");
  if (!el) return;
  const list = managers || [];
  if (!list.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <p class="oversee-kicker" style="grid-column:1/-1;margin:0 0 2px">${escapeHtml(
      t("dash.presence_board")
    )}</p>
    ${list
      .map((m) => {
        const st = m.presence || "offline";
        const deals =
          st === "in_process" && m.active_deals
            ? t("dash.presence_deals", { n: m.active_deals })
            : "";
        return `<article class="presence-chip" data-presence="${escapeHtml(st)}">
          <span class="presence-chip__dot" aria-hidden="true"></span>
          <span class="presence-chip__meta">
            <span class="presence-chip__name">${escapeHtml(m.name || "")}</span>
            <span class="presence-chip__status">${escapeHtml(presenceLabel(st))}${
          deals ? ` · ${escapeHtml(deals)}` : ""
        }</span>
          </span>
        </article>`;
      })
      .join("")}`;
}

function fillOverseeManagers(managers) {
  const sel = document.getElementById("oversee-manager");
  if (!sel) return;
  overseeState.managers = managers || [];
  const current = overseeState.managerId;
  const opts = [
    `<option value="">${escapeHtml(t("dash.oversee_all_managers"))}</option>`,
    ...((managers || []).map((m) => {
      const role =
        m.role === "owner" ? t("dash.role_owner") : t("dash.role_manager");
      const label = `${m.name || ""} · ${presenceLabel(m.presence)} · ${role}`;
      return `<option value="${escapeHtml(m.id)}"${m.id === current ? " selected" : ""}>${escapeHtml(
        label
      )}</option>`;
    }) || []),
  ];
  sel.innerHTML = opts.join("");
  if (current) sel.value = current;
}

function renderOverseeList(items) {
  const el = document.getElementById("oversee-list");
  const layout = document.querySelector(".oversee-layout");
  if (!el) return;
  overseeState.items = items || [];
  if (!items.length) {
    el.innerHTML = `<p class="shell-empty">${escapeHtml(t("dash.oversee_empty"))}</p>`;
    return;
  }
  el.innerHTML = items
    .map((c, idx) => {
      const handler = c.manager_name
        ? c.manager_name
        : t("dash.oversee_no_handler");
      const last = c.last_event || {};
      const lastText =
        last.type === "offer"
          ? `${last.text || ""} ₸`
          : last.text || "?";
      const msgs =
        c.messages_count > 0
          ? t("dash.oversee_msgs", { n: c.messages_count })
          : "";
      const presence = c.manager_name
        ? presenceBadgeHtml(c.manager_presence || "offline")
        : "";
      return `
      <button type="button" class="oversee-card${
        c.request_id === overseeState.selectedId ? " is-active" : ""
      }" data-stage="${escapeHtml(c.stage || "")}" data-id="${escapeHtml(
        c.request_id || ""
      )}" style="animation-delay:${Math.min(idx, 8) * 0.04}s">
        <span class="oversee-card__rail" aria-hidden="true"></span>
        <span class="oversee-card__body">
          <span class="oversee-card__top">
            <strong>${escapeHtml(c.client_name || t("dash.oversee_client"))}</strong>
            <span class="oversee-card__stage">${escapeHtml(overseeStageLabel(c.stage))}</span>
          </span>
          <p class="oversee-card__text">${escapeHtml(c.text || "")}</p>
          <span class="oversee-card__meta">
            <span>${escapeHtml(t("dash.oversee_handler"))}: <b>${escapeHtml(handler)}</b></span>
            ${presence}
            ${c.price ? `<span>${escapeHtml(t("js.price_tenge"))}: <b>${escapeHtml(c.price)} ₸</b></span>` : ""}
            ${msgs ? `<span>${escapeHtml(msgs)}</span>` : ""}
            <span>${escapeHtml(formatDate(c.updated_at))}</span>
          </span>
          <p class="oversee-card__last"><span>${escapeHtml(t("dash.oversee_last"))}:</span> ${escapeHtml(
            lastText
          )}</p>
        </span>
      </button>`;
    })
    .join("");

  el.querySelectorAll(".oversee-card").forEach((btn) => {
    btn.addEventListener("click", () => openOverseeDetail(btn.dataset.id));
  });
  if (layout) {
    layout.classList.toggle("has-detail", Boolean(overseeState.selectedId));
  }
}

async function openOverseeDetail(requestId) {
  if (!requestId) return;
  overseeState.selectedId = requestId;
  document.querySelectorAll(".oversee-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.id === requestId);
  });
  const detail = document.getElementById("oversee-detail");
  const layout = document.querySelector(".oversee-layout");
  const title = document.getElementById("oversee-detail-title");
  const stageEl = document.getElementById("oversee-detail-stage");
  const meta = document.getElementById("oversee-detail-meta");
  const timelineEl = document.getElementById("oversee-timeline");
  if (!detail || !timelineEl) return;
  detail.hidden = false;
  if (layout) layout.classList.add("has-detail");
  timelineEl.innerHTML = `<p class="shell-empty">${escapeHtml(t("js.loading"))}</p>`;

  const res = await fetch(`/api/team/oversee/${encodeURIComponent(requestId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    timelineEl.innerHTML = `<p class="shell-empty">${escapeHtml(data.error || t("js.err_send"))}</p>`;
    return;
  }
  const item = data.item || {};
  if (stageEl) stageEl.textContent = overseeStageLabel(item.stage);
  if (title) title.textContent = item.client_name || t("dash.oversee_client");
  if (meta) {
    const handler = item.manager_name || t("dash.oversee_no_handler");
    const price = item.price ? ` · ${item.price} ₸` : "";
    const presence = item.manager_name
      ? ` · ${presenceLabel(item.manager_presence || "offline")}`
      : "";
    meta.textContent = `${t("dash.oversee_handler")}: ${handler}${presence}${price}`;
  }

  const events = data.timeline || [];
  if (!events.length) {
    timelineEl.innerHTML = `<p class="shell-empty">${escapeHtml(t("dash.oversee_empty"))}</p>`;
    return;
  }
  timelineEl.innerHTML = events
    .map((ev, idx) => {
      const who = ev.name
        ? `${ev.name}${ev.role === "manager" ? ` · ${t("dash.role_manager")}` : ev.role === "owner" ? ` · ${t("dash.role_owner")}` : ""}`
        : "";
      let body = "";
      if (ev.kind === "offer" || ev.kind === "counter") {
        body = `<p class="oversee-tl-item__text"><b>${escapeHtml(ev.text || "")}${
          ev.text ? " ₸" : ""
        }</b></p>`;
        const msg = ev.meta && ev.meta.message;
        if (msg) body += `<div class="oversee-tl-item__bubble">${escapeHtml(msg)}</div>`;
      } else if (ev.kind === "message" || ev.text) {
        body = `<div class="oversee-tl-item__bubble">${escapeHtml(ev.text || "")}</div>`;
      }
      return `
      <article class="oversee-tl-item" data-side="${escapeHtml(ev.side || "")}" style="animation-delay:${Math.min(idx, 10) * 0.03}s">
        <div class="oversee-tl-item__when">${escapeHtml(formatDate(ev.at))}</div>
        <div class="oversee-tl-item__title">${escapeHtml(overseeTimelineTitle(ev.kind))}</div>
        ${who ? `<div class="oversee-tl-item__who">${escapeHtml(who)}</div>` : ""}
        ${body}
      </article>`;
    })
    .join("");
}

function closeOverseeDetail() {
  overseeState.selectedId = "";
  const detail = document.getElementById("oversee-detail");
  const layout = document.querySelector(".oversee-layout");
  if (detail) detail.hidden = true;
  if (layout) layout.classList.remove("has-detail");
  document.querySelectorAll(".oversee-card.is-active").forEach((c) => c.classList.remove("is-active"));
}

async function loadOversee(force) {
  if (!window.IS_SUPPLIER_OWNER) return;
  const list = document.getElementById("oversee-list");
  if (!list) return;
  if (force) list.innerHTML = `<p class="shell-empty">${escapeHtml(t("js.loading"))}</p>`;

  const params = new URLSearchParams();
  if (overseeState.stage) params.set("stage", overseeState.stage);
  if (overseeState.managerId) params.set("manager_id", overseeState.managerId);
  const res = await fetch(`/api/team/oversee?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    list.innerHTML = `<p class="shell-empty">${escapeHtml(data.error || t("js.err_send"))}</p>`;
    return;
  }
  renderOverseeStats(data.stats);
  renderPresenceBoard(data.managers);
  fillOverseeManagers(data.managers);
  renderOverseeList(data.items || []);
  if (overseeState.selectedId) {
    const still = (data.items || []).some((c) => c.request_id === overseeState.selectedId);
    if (still) openOverseeDetail(overseeState.selectedId);
    else closeOverseeDetail();
  }
}

document.getElementById("oversee-filters")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".oversee-filter");
  if (!btn) return;
  document.querySelectorAll(".oversee-filter").forEach((b) => b.classList.toggle("is-active", b === btn));
  overseeState.stage = btn.dataset.stage || "";
  loadOversee(true);
});

document.getElementById("oversee-manager")?.addEventListener("change", (e) => {
  overseeState.managerId = e.target.value || "";
  loadOversee(true);
});

document.getElementById("oversee-detail-close")?.addEventListener("click", () => closeOverseeDetail());

/* Heartbeat - keep supplier presence fresh */
async function sendPresenceHeartbeat() {
  try {
    await fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch (_) {
    /* ignore */
  }
}

sendPresenceHeartbeat();
setInterval(sendPresenceHeartbeat, 45000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") sendPresenceHeartbeat();
});
