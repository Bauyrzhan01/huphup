const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const results = document.getElementById("results");
const chatTitle = document.getElementById("chat-title");
const chatSummary = document.getElementById("chat-summary");
const chatItems = document.getElementById("chat-items");
const chatThread = document.getElementById("chat-thread");
const searchError = document.getElementById("search-error");
const historyList = document.getElementById("history-list");
const offersBlock = document.getElementById("offers-block");
const offersList = document.getElementById("offers-list");
const offersEmpty = document.getElementById("offers-empty");
const dealBlock = document.getElementById("deal-block");
const dealTitle = document.getElementById("deal-title");
const dealPartner = document.getElementById("deal-partner");
const dealThread = document.getElementById("deal-thread");
const dealForm = document.getElementById("deal-form");
const dealInput = document.getElementById("deal-input");
const dealFile = document.getElementById("deal-file");
const dealAttach = document.getElementById("deal-attach");
const dealComplete = document.getElementById("deal-complete");
const dealActions = document.getElementById("deal-actions");
const rateBlock = document.getElementById("rate-block");
const rateTitle = document.getElementById("rate-title");
const rateStars = document.getElementById("rate-stars");
const rateComment = document.getElementById("rate-comment");
const rateSubmit = document.getElementById("rate-submit");
const rateDone = document.getElementById("rate-done");
const rateError = document.getElementById("rate-error");
const dealNext = document.getElementById("deal-next");
const dealNextContacts = document.getElementById("deal-next-contacts");
const dealRepeat = document.getElementById("deal-repeat");

let pendingText = "";
let pendingAnswers = {};
let pendingSupplierId = null;
let lastCompletedReq = null;
let questionQueue = [];
let questionIndex = 0;
let activeDealId = null;
let dealPollTimer = null;
let selectedRequestId = null;
let pendingRateScore = 0;

function escapeHtml(value) {
  return window.tbEscapeHtml(value);
}

function showError(message) {
  if (!searchError) return;
  searchError.hidden = !message;
  searchError.textContent = message || "";
}

function resizeChatInput(el) {
  if (typeof window.tbAutoGrowTextarea === "function") window.tbAutoGrowTextarea(el);
}

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
          await refreshLists();
        }
      }
    } catch {
      /* ignore poll errors */
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
      const mine = role === "user";
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
  if (atBottom) {
    dealThread.scrollTop = dealThread.scrollHeight;
  }

  const open = req?.status === "deal";
  dealForm.hidden = !open;
  dealActions.hidden = !open;
  if (dealInput) dealInput.disabled = !open;
  syncDealCompleteButton(req);
}

function formatRating(avg, count) {
  if (!count || avg == null) return "";
  return `<span class="rating-badge" title="${t('js.avg_rating')}"><strong>${Number(avg).toFixed(1)}</strong> · ${count}</span>`;
}

function showRateError(msg) {
  if (!rateError) return;
  rateError.hidden = !msg;
  rateError.textContent = msg || "";
}

function syncDealCompleteButton(req) {
  if (!dealComplete) return;
  const open = req?.status === "deal";
  const confirmedByMe = !!req?.deal_confirmed_by_me;
  dealComplete.hidden = !open;
  dealComplete.disabled = !open || confirmedByMe;
  dealComplete.textContent = confirmedByMe
    ? t("js.awaiting_other_confirmation")
    : t("home.deal_complete");
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
    .map((n) => `<button type="button" class="rate-star" data-score="${n}" aria-label="${n}">★</button>`)
    .join("");
  rateStars.addEventListener("click", (e) => {
    const btn = e.target.closest(".rate-star");
    if (!btn) return;
    pendingRateScore = Number(btn.dataset.score);
    paintRateStars(pendingRateScore);
    showRateError("");
  });
}

function renderDealNext(req) {
  if (!dealNext) return;
  const completed = req?.status === "completed" && req?.is_deal_party;
  if (!completed) {
    dealNext.hidden = true;
    lastCompletedReq = null;
    return;
  }
  lastCompletedReq = req;
  dealNext.hidden = false;
  const name = req.deal_partner_name || t("js.supplier");
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
  const name = req.rate_target_name || t("js.rate_partner");
  if (req.my_rating) {
    if (rateTitle) rateTitle.textContent = t("js.your_rating");
    if (rateStars) rateStars.hidden = true;
    if (rateComment) rateComment.hidden = true;
    if (rateSubmit) rateSubmit.hidden = true;
    if (rateDone) {
      rateDone.hidden = false;
      const c = req.my_rating.comment ? ` — ${req.my_rating.comment}` : "";
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

function showDealChat(req) {
  dealBlock.hidden = false;
  activeDealId = req.id;
  const partner =
    req.deal_partner_name ||
    req.accepted_supplier?.company_name ||
    t("js.supplier");
  const price = req.accepted_offer?.price;
  dealTitle.textContent = req.status === "completed" ? t("js.deal_done") : t("home.deal_title");
  dealPartner.textContent = price ? `${partner} · ${price} ₸` : partner;
  renderDealMessages(req.deal_messages || [], req);
  renderRateBlock(req);
  if (req.status === "deal") {
    startDealPoll(req.id);
  } else {
    stopDealPoll();
  }
  dealBlock.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideDealChat() {
  dealBlock.hidden = true;
  if (rateBlock) rateBlock.hidden = true;
  if (dealNext) dealNext.hidden = true;
  lastCompletedReq = null;
  stopDealPoll();
  activeDealId = null;
}

dealRepeat?.addEventListener("click", () => {
  const req = lastCompletedReq;
  if (!req) return;
  const text = req.text || "";
  const sid =
    req.accepted_supplier_id ||
    req.accepted_supplier?.id ||
    req.direct_supplier_id ||
    null;
  if (sid) startDirectRequest(text, sid);
  else if (searchInput) {
    showView("home");
    searchInput.value = text;
    resizeChatInput(searchInput);
    searchInput.focus();
  }
});

function parseOfferPrice(value) {
  const n = Number(String(value ?? "").replace(/[^\d.,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : Infinity;
}

function renderOffers(offers, req) {
  const inDeal = req?.status === "deal" || req?.status === "completed";
  offersBlock.hidden = false;
  offersList.innerHTML = "";
  const lead = document.getElementById("offers-lead");
  const reqStatus = req?.status || "sent";
  const has = (offers || []).length > 0;
  offersEmpty.hidden = has;
  if (lead) lead.hidden = !has;
  if (!has) {
    if (reqStatus === "cancelled") {
      offersEmpty.hidden = true;
      offersList.innerHTML = `
        <div class="offers-toolbar">
          <span class="offer-chip offer-chip--muted status-pill is-cancel">${escapeHtml(t("js.cancelled"))}</span>
        </div>
        <p class="shell-empty">${escapeHtml(t("js.request_cancelled_note"))}</p>`;
      return;
    }
    offersEmpty.textContent = t("js.offers_empty_long");
    return;
  }

  const sorted = [...offers].sort(
    (a, b) => parseOfferPrice(a.price) - parseOfferPrice(b.price)
  );
  const bestPrice = parseOfferPrice(sorted[0]?.price);
  let bestRating = -1;
  sorted.forEach((o) => {
    if (o.rating_count > 0 && Number(o.rating_avg) > bestRating) {
      bestRating = Number(o.rating_avg);
    }
  });

  const acceptedId = req?.accepted_offer_id;
  const canAct = !inDeal && (req?.status || "sent") === "sent";
  const rows = sorted
    .map((offer) => {
      const isAccepted = acceptedId && offer.id === acceptedId;
      const priceNum = parseOfferPrice(offer.price);
      const isBestPrice = priceNum === bestPrice && Number.isFinite(bestPrice);
      const isBestRating =
        offer.rating_count > 0 && Number(offer.rating_avg) === bestRating && bestRating >= 0;
      const st = offer.status || "active";
      let action = "";
      if (inDeal) {
        action = isAccepted
          ? `<span class="offer-accepted">${req.status === "completed" ? t("js.deal_done") : t("js.selected")}</span>`
          : `<span class="offer-skipped">—</span>`;
      } else if (st === "rejected") {
        action = `<span class="offer-chip offer-chip--muted">${t("js.rejected")}${
          offer.reject_reason ? `: ${escapeHtml(offer.reject_reason)}` : ""
        }</span>`;
      } else if (canAct) {
        action = `
          <div class="offer-actions">
            <button type="button" class="btn btn--solid btn--sm btn-accept" data-offer="${escapeHtml(offer.id)}">${t("js.select")}</button>
            <button type="button" class="btn btn--ghost btn--sm btn-counter" data-offer="${escapeHtml(offer.id)}">${t("js.counter")}</button>
            <button type="button" class="btn btn--ghost btn--sm btn-reject" data-offer="${escapeHtml(offer.id)}">${t("js.reject")}</button>
          </div>`;
      } else if (st === "counter") {
        action = `<span class="offer-chip">${t("js.countered")}</span>`;
      }
      const rating =
        offer.rating_count > 0 && offer.rating_avg != null
          ? `<strong>${Number(offer.rating_avg).toFixed(1)}</strong> <span class="offer-table__muted">(${offer.rating_count})</span>`
          : `<span class="offer-table__muted">${t("js.no_ratings")}</span>`;
      const counterNote =
        st === "counter" && (offer.counter_price || offer.counter_message)
          ? `<span class="offer-table__note">${t("js.countered")}${
              offer.counter_price ? `: ${escapeHtml(offer.counter_price)} ₸` : ""
            }${offer.counter_message ? ` — ${escapeHtml(offer.counter_message)}` : ""}</span>`
          : "";
      return `
      <tr class="offer-table__row${isAccepted ? " is-selected" : ""}${isBestPrice ? " is-best-price" : ""}${
        st === "rejected" ? " is-rejected" : ""
      }">
        <td class="offer-table__company">
          <div class="offer-company">
            ${typeof tbAvatarHtml === "function" ? tbAvatarHtml(offer.company_name || t("js.supplier"), "sm") : ""}
            <div>
              <strong>${escapeHtml(offer.company_name || t("js.supplier"))}</strong>
              ${offer.message ? `<span class="offer-table__note">${escapeHtml(offer.message)}</span>` : ""}
              ${counterNote}
            </div>
          </div>
        </td>
        <td class="offer-table__price" data-label="${t("js.price")}">
          ${escapeHtml(offer.price)} ₸
          ${isBestPrice ? `<span class="offer-chip">${t("js.best_price")}</span>` : ""}
        </td>
        <td data-label="${t("js.term")}">${escapeHtml(offer.term || "—")}</td>
        <td data-label="${t("js.delivery")}">${escapeHtml(offer.delivery || "—")}</td>
        <td data-label="${t("js.rating")}" class="${isBestRating ? "is-best-rating" : ""}">
          ${rating}
          ${isBestRating ? `<span class="offer-chip">${t("js.best_rating")}</span>` : ""}
        </td>
        <td class="offer-table__action">${action}</td>
      </tr>`;
    })
    .join("");

  const cancelBtn =
    canAct
      ? `<button type="button" class="btn btn--ghost btn--sm" id="btn-cancel-request">${t("js.cancel_request")}</button>`
      : req?.status === "cancelled"
        ? `<span class="offer-chip offer-chip--muted">${t("js.cancelled")}</span>`
        : "";

  offersList.innerHTML = `
    <div class="offers-toolbar">${cancelBtn}</div>
    <div class="offer-table-wrap">
      <table class="offer-table">
        <thead>
          <tr>
            <th>${t("js.supplier")}</th>
            <th>${t("js.price")}</th>
            <th>${t("js.term")}</th>
            <th>${t("js.delivery")}</th>
            <th>${t("js.rating")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="offer-panel" id="offer-action-panel" hidden></div>
  `;

  document.getElementById("btn-cancel-request")?.addEventListener("click", async () => {
    if (!confirm(t("js.confirm_cancel"))) return;
    const res = await fetch(`/api/requests/${req.id}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showError(data.error || t("js.err_cancel"));
      return;
    }
    showError("");
    await refreshLists();
    showRequest(data.request, data.message);
  });

  offersList.querySelectorAll(".btn-accept").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const offerId = btn.dataset.offer;
      const res = await fetch(`/api/requests/${req.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer_id: offerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showError(data.error || t("js.err_select"));
        return;
      }
      showError("");
      await refreshLists();
      showRequest(data.request, data.message);
    });
  });

  const panel = document.getElementById("offer-action-panel");

  offersList.querySelectorAll(".btn-reject").forEach((btn) => {
    btn.addEventListener("click", () => {
      const offerId = btn.dataset.offer;
      if (!panel) return;
      panel.hidden = false;
      panel.innerHTML = `
        <p class="offer-panel__title">${t("js.reject")}</p>
        <div class="offer-panel__reasons">
          <button type="button" class="btn btn--ghost btn--sm" data-code="expensive">${t("js.reject_reason_expensive")}</button>
          <button type="button" class="btn btn--ghost btn--sm" data-code="terms">${t("js.reject_reason_terms")}</button>
          <button type="button" class="btn btn--ghost btn--sm" data-code="other">${t("js.reject_reason_other")}</button>
        </div>
        <input type="text" id="reject-other" class="offer-panel__input" placeholder="${t("js.reject_reason_other")}" maxlength="200" hidden />
        <div class="offer-panel__row">
          <button type="button" class="btn btn--solid btn--sm" id="reject-submit">${t("js.reject")}</button>
          <button type="button" class="btn btn--ghost btn--sm" id="reject-close">${t("js.cancel")}</button>
        </div>
      `;
      let code = "expensive";
      panel.querySelectorAll("[data-code]").forEach((b) => {
        b.addEventListener("click", () => {
          code = b.dataset.code;
          panel.querySelectorAll("[data-code]").forEach((x) => x.classList.toggle("is-active", x === b));
          const other = document.getElementById("reject-other");
          if (other) other.hidden = code !== "other";
        });
      });
      panel.querySelector("[data-code='expensive']")?.classList.add("is-active");
      document.getElementById("reject-close")?.addEventListener("click", () => {
        panel.hidden = true;
        panel.innerHTML = "";
      });
      document.getElementById("reject-submit")?.addEventListener("click", async () => {
        const other = document.getElementById("reject-other");
        const reason = other && !other.hidden ? other.value.trim() : "";
        const res = await fetch(`/api/requests/${req.id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offer_id: offerId, reason_code: code, reason }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          showError(data.error || t("js.err_reject"));
          return;
        }
        showError("");
        await refreshLists();
        showRequest(data.request, data.message);
      });
    });
  });

  offersList.querySelectorAll(".btn-counter").forEach((btn) => {
    btn.addEventListener("click", () => {
      const offerId = btn.dataset.offer;
      if (!panel) return;
      panel.hidden = false;
      panel.innerHTML = `
        <p class="offer-panel__title">${t("js.counter")}</p>
        <input type="text" id="counter-price" class="offer-panel__input" placeholder="${t("js.counter_price_ph")}" maxlength="80" />
        <input type="text" id="counter-msg" class="offer-panel__input" placeholder="${t("js.counter_msg_ph")}" maxlength="500" />
        <div class="offer-panel__row">
          <button type="button" class="btn btn--solid btn--sm" id="counter-submit">${t("js.send_counter")}</button>
          <button type="button" class="btn btn--ghost btn--sm" id="counter-close">${t("js.cancel")}</button>
        </div>
      `;
      document.getElementById("counter-close")?.addEventListener("click", () => {
        panel.hidden = true;
        panel.innerHTML = "";
      });
      document.getElementById("counter-submit")?.addEventListener("click", async () => {
        const price = document.getElementById("counter-price")?.value.trim() || "";
        const message = document.getElementById("counter-msg")?.value.trim() || "";
        const res = await fetch(`/api/requests/${req.id}/counter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offer_id: offerId, price, message }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          showError(data.error || t("js.err_counter"));
          return;
        }
        showError("");
        await refreshLists();
        showRequest(data.request, data.message);
      });
    });
  });
}

function showRequest(req, message) {
  results.hidden = false;
  document.getElementById("chat-empty-state")?.setAttribute("hidden", "");
  chatTitle.hidden = true;
  chatThread.hidden = true;
  selectedRequestId = req?.id || null;

  const offers = req.offers || [];
  chatSummary.textContent = req.summary || "";
  renderAnalysisItems(req.items || []);

  renderOffers(offers, req);

  if (req.status === "deal" || req.status === "completed") {
    showDealChat(req);
  } else {
    hideDealChat();
  }

  historyList.querySelectorAll(".shell-side-item").forEach((el) => {
    el.classList.toggle("is-selected", el.dataset.id === selectedRequestId);
  });

  if (req.status !== "deal" && req.status !== "completed" && offers.length) {
    offersBlock.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function historyMeta(item) {
  const status = item.status || "sent";
  if (status === "cancelled") return t("js.cancelled");
  if (status === "completed") {
    const accepted = (item.offers || []).find((o) => o.id === item.accepted_offer_id);
    return accepted ? `${accepted.price} ₸` : t("js.done_short");
  }
  if (status === "deal") {
    const partner = item.deal_partner_name || item.accepted_supplier?.company_name || t("js.supplier");
    return t("js.chat_with", { name: partner });
  }
  const offers = item.offers || [];
  if (offers.length) return t("js.prices_n", { n: offers.length });
  return t("js.awaiting_prices");
}

function appendHistoryItem(item, { live = false } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  const status = item.status || "sent";
  let statusCls = "is-wait";
  if (status === "deal") statusCls = "is-deal";
  else if (status === "completed") statusCls = "is-done";
  else if (status === "cancelled") statusCls = "is-cancel";
  btn.className =
    "shell-side-item" +
    (live ? " is-live" : "") +
    (status === "deal" ? " is-deal-item" : "") +
    (status === "cancelled" ? " is-cancel-item" : "");
  btn.dataset.id = item.id;
  const meta = historyMeta(item);
  btn.innerHTML = `
    <span class="hist-row">
      <span class="hist-text">${escapeHtml(item.text)}</span>
      <span class="status-pill ${statusCls}">${escapeHtml(meta)}</span>
    </span>
  `;
  btn.addEventListener("click", () => showRequest(item));
  historyList.appendChild(btn);
}

function renderSidebarHistory({ active = [], deals = [], history = [] } = {}) {
  historyList.innerHTML = "";
  const live = [...(deals || []), ...(active || [])];
  const done = history || [];
  if (!live.length && !done.length) {
    historyList.innerHTML = `<p class="shell-side-empty">${t("js.no_orders")}</p>`;
    return;
  }
  live.forEach((item) => appendHistoryItem(item, { live: true }));
  done.forEach((item) => appendHistoryItem(item, { live: false }));
  if (selectedRequestId) {
    historyList.querySelectorAll(".shell-side-item").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.id === selectedRequestId);
    });
  }
}

async function refreshLists() {
  const [histRes, activeRes, dealRes, cancelRes] = await Promise.all([
    fetch("/api/requests?status=completed"),
    fetch("/api/requests?status=sent"),
    fetch("/api/requests?status=deal"),
    fetch("/api/requests?status=cancelled"),
  ]);
  const histData = await histRes.json().catch(() => ({}));
  const activeData = await activeRes.json().catch(() => ({}));
  const dealData = await dealRes.json().catch(() => ({}));
  const cancelData = await cancelRes.json().catch(() => ({}));
  const history = [
    ...(histRes.ok && histData.ok ? histData.items || [] : []),
    ...(cancelRes.ok && cancelData.ok ? cancelData.items || [] : []),
  ];
  const active = activeRes.ok && activeData.ok ? activeData.items || [] : [];
  const deals = dealRes.ok && dealData.ok ? dealData.items || [] : [];
  renderSidebarHistory({ active, deals, history });
  if (typeof setHistoryCache === "function") {
    setHistoryCache([...deals, ...active, ...history]);
  }
  return { history, active, deals };
}

async function loadHistory() {
  const { active, deals } = await refreshLists();
  if (deals.length) {
    showRequest(deals[0]);
    return;
  }
  const withOffers = active.find((i) => (i.offers || []).length > 0);
  if (withOffers) {
    showRequest(withOffers);
  }
}

function renderAnalysisItems(items) {
  if (!items?.length) {
    chatItems.hidden = true;
    chatItems.innerHTML = "";
    return;
  }
  chatItems.hidden = false;
  chatItems.innerHTML = items
    .map((item) => {
      const qty = item.qty ? `${escapeHtml(item.qty)} ${escapeHtml(item.unit)} ` : "";
      const size = item.size ? ` · ${escapeHtml(item.size)}` : "";
      const cat = item.category ? escapeHtml(item.category) : t("js.unclear");
      return `<li><strong>${qty}${escapeHtml(item.name)}</strong>${size}<span>${cat}</span></li>`;
    })
    .join("");
}

function scrollChatPanel() {
  const panel = document.getElementById("chat-panel");
  if (panel) panel.scrollTop = panel.scrollHeight;
  if (chatThread) chatThread.scrollTop = chatThread.scrollHeight;
}

function addBotMessage(text) {
  const row = document.createElement("div");
  row.className = "chat-msg bot";
  row.innerHTML = `<div class="chat-msg-bubble">${escapeHtml(text)}</div>`;
  chatThread.appendChild(row);
  scrollChatPanel();
}

function addUserMessage(text) {
  const row = document.createElement("div");
  row.className = "chat-msg user";
  row.innerHTML = `<div class="chat-msg-bubble">${escapeHtml(text)}</div>`;
  chatThread.appendChild(row);
  scrollChatPanel();
}

function showCurrentQuestion() {
  const existing = chatThread.querySelector(".chat-options");
  if (existing) existing.remove();

  if (questionIndex >= questionQueue.length) {
    addBotMessage(t("js.thanks_sending"));
    finishClarification(true);
    return;
  }

  const q = questionQueue[questionIndex];
  addBotMessage(q.text);

  const options = document.createElement("div");
  options.className = "chat-options";
  (q.options || []).forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-option-btn";
    btn.textContent = opt;
    btn.addEventListener("click", () => onOptionClick(q.id, opt));
    options.appendChild(btn);
  });
  chatThread.appendChild(options);
  scrollChatPanel();
}

function onOptionClick(questionId, value) {
  pendingAnswers[questionId] = value;
  addUserMessage(value);
  questionIndex += 1;
  showCurrentQuestion();
}

function showClarification(analysis) {
  results.hidden = false;
  document.getElementById("chat-empty-state")?.setAttribute("hidden", "");
  offersBlock.hidden = true;
  hideDealChat();

  chatTitle.hidden = false;
  chatThread.hidden = false;
  chatThread.innerHTML = "";

  chatSummary.textContent = analysis.summary || t("js.parsed_request");
  renderAnalysisItems(analysis.items || []);

  pendingAnswers = { ...(analysis.answers || {}) };
  questionQueue = analysis.questions || [];
  questionIndex = 0;

  if (!questionQueue.length) {
    addBotMessage(t("js.sending"));
    finishClarification(true);
    return;
  }
  showCurrentQuestion();
}

async function submitRequest({
  text,
  answers = {},
  confirm = false,
  supplier_id = null,
  product_id = null,
} = {}) {
  const payload = { text, answers, confirm };
  const sid = supplier_id || pendingSupplierId;
  if (sid) payload.supplier_id = sid;
  if (product_id) payload.product_id = product_id;
  const res = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

window.submitRequest = submitRequest;

async function startDirectRequest(text, supplierId) {
  showError("");
  const errEl = document.getElementById("supplier-direct-error");
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = "";
  }
  pendingText = text;
  pendingAnswers = {};
  pendingSupplierId = supplierId;
  showView("home");
  const { res, data } = await submitRequest({ text, supplier_id: supplierId });
  if (!res.ok || !data.ok) {
    const msg = data.error || t("js.err_create");
    showError(msg);
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = msg;
    }
    if (typeof openSupplierProfile === "function") {
      openSupplierProfile(supplierId, "home");
    }
    return;
  }
  if (data.needs_clarification) {
    showClarification(data.analysis);
    return;
  }
  pendingSupplierId = null;
  showRequest(data.request, data.message);
  searchInput.value = "";
  resizeChatInput(searchInput);
  pendingText = "";
  loadHistory();
}

window.startDirectRequest = startDirectRequest;

async function finishClarification(confirm = true) {
  showError("");
  const { res, data } = await submitRequest({
    text: pendingText,
    answers: pendingAnswers,
    confirm,
    supplier_id: pendingSupplierId,
  });
  if (!res.ok || !data.ok) {
    showError(data.error || t("js.err_send"));
    return;
  }
  pendingSupplierId = null;
  showRequest(data.request, data.message);
  searchInput.value = "";
  resizeChatInput(searchInput);
  pendingText = "";
  pendingAnswers = {};
  questionQueue = [];
  loadHistory();
}

dealAttach?.addEventListener("click", () => dealFile?.click());

async function sendDealMessage(text, attachmentId) {
  const res = await fetch(`/api/requests/${activeDealId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text || "", attachment_id: attachmentId || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    showError(data.error || t("js.err_message"));
    return false;
  }
  showError("");
  renderDealMessages(data.messages || [], data.request);
  dealThread.scrollTop = dealThread.scrollHeight;
  return true;
}

async function uploadDealFile(file) {
  if (file.size > 5 * 1024 * 1024) {
    showError(t("js.file_too_large"));
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
    showError(data.error || t("js.file_type_bad"));
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
  resizeChatInput(dealInput);
  const attachmentId = await uploadDealFile(file);
  if (!attachmentId) return;
  await sendDealMessage(text, attachmentId);
});

dealForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeDealId) return;
  const text = dealInput.value.trim();
  if (!text) return;
  dealInput.value = "";
  resizeChatInput(dealInput);
  await sendDealMessage(text);
});

dealComplete?.addEventListener("click", async () => {
  if (!activeDealId) return;
  if (!confirm(t("js.confirm_deal"))) return;
  dealComplete.disabled = true;
  const prevText = dealComplete.textContent;
  dealComplete.textContent = t("js.loading");
  const res = await fetch(`/api/requests/${activeDealId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    showError(data.error || t("js.err_complete"));
    dealComplete.disabled = false;
    dealComplete.textContent = prevText || t("home.deal_complete");
    return;
  }
  showError("");
  if (data.request?.status === "completed") stopDealPoll();
  await refreshLists();
  showRequest(data.request, data.message);
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
  if (data.request) {
    showDealChat(data.request);
  }
});

searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const text = searchInput.value.trim();
  if (text.length < 3) {
    showError(t("js.need_describe"));
    return;
  }

  pendingText = text;
  pendingAnswers = {};
  pendingSupplierId = null;
  const { res, data } = await submitRequest({ text });
  if (!res.ok || !data.ok) {
    showError(data.error || t("js.err_create"));
    return;
  }

  if (data.needs_clarification) {
    showClarification(data.analysis);
    return;
  }

  showRequest(data.request, data.message);
  searchInput.value = "";
  resizeChatInput(searchInput);
  pendingText = "";
  loadHistory();
});

document.getElementById("nav-home")?.addEventListener("click", (e) => {
  e.preventDefault();
  if (typeof showView === "function") showView("home");
  searchInput?.focus();
});

window.showRequest = showRequest;
window.refreshLists = refreshLists;

// Прячем экран загрузки, когда первичные данные подгрузились
Promise.resolve(loadHistory()).finally(() => window.tbHidePageLoader?.());
