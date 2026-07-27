(() => {
  const root = document.getElementById("notify");
  if (!root) return;

  const btn = document.getElementById("notify-btn");
  const badge = document.getElementById("notify-badge");
  const panel = document.getElementById("notify-panel");
  const list = document.getElementById("notify-list");
  const readAllBtn = document.getElementById("notify-read-all");

  let open = false;
  let items = [];
  let lastUnread = 0;

  function timeAgo(iso) {
    if (!iso) return "";
    const t = Date.parse(iso);
    if (!t) return "";
    const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (sec < 60) return t("js.just_now");
    if (sec < 3600) return t("js.min_ago", { n: Math.floor(sec / 60) });
    if (sec < 86400) return t("js.h_ago", { n: Math.floor(sec / 3600) });
    return t("js.d_ago", { n: Math.floor(sec / 86400) });
  }

  const escapeHtml = window.tbEscapeHtml;

  function setBadge(n) {
    if (!badge || !btn) return;
    const count = Math.max(0, Number(n) || 0);
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.classList.add("is-on");
      btn.classList.add("has-live");
      if (count > lastUnread) {
        badge.classList.remove("is-pop");
        void badge.offsetWidth;
        badge.classList.add("is-pop");
        btn.classList.remove("has-unread");
        void btn.offsetWidth;
        btn.classList.add("has-unread");
        window.setTimeout(() => btn.classList.remove("has-unread"), 900);
      }
    } else {
      badge.classList.remove("is-on", "is-pop");
      btn.classList.remove("has-unread", "has-live");
      badge.textContent = "0";
      window.setTimeout(() => {
        if (!badge.classList.contains("is-on")) badge.hidden = true;
      }, 220);
    }
    lastUnread = count;
  }

  function render(opts = {}) {
    if (!list) return;
    const animate = opts.animate !== false;
    if (!items.length) {
      list.innerHTML = `<p class="notify__empty">${t("notify.empty")}</p>`;
      return;
    }
    list.innerHTML = items
      .map(
        (n) => `
      <button type="button" class="notify__item${n.read ? "" : " is-unread"}" data-id="${n.id}" data-request="${n.request_id || ""}">
        <span class="notify__item-title">${escapeHtml(n.title || "")}</span>
        <span class="notify__item-body">${escapeHtml(n.body || "")}</span>
        <span class="notify__item-time">${timeAgo(n.created_at)}</span>
      </button>`
      )
      .join("");

    const rows = [...list.querySelectorAll(".notify__item")];
    if (!animate) {
      rows.forEach((el) => el.classList.add("is-in"));
      return;
    }
    // cascade: each card unfolds from above
    rows.forEach((el) => el.classList.remove("is-in"));
    requestAnimationFrame(() => {
      rows.forEach((el, i) => {
        el.style.transitionDelay = `${0.06 + i * 0.07}s`;
        requestAnimationFrame(() => el.classList.add("is-in"));
      });
    });
  }

  async function fetchNotes() {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      if (!data.ok) return;
      items = data.items || [];
      setBadge(data.unread || 0);
      if (open) render({ animate: false });
    } catch (_) {
      /* ignore */
    }
  }

  async function markRead(id, all) {
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { id }),
      });
      const data = await res.json();
      if (!data.ok) return;
      if (all) {
        items = items.map((n) => ({ ...n, read: true }));
      } else {
        items = items.map((n) => (n.id === id ? { ...n, read: true } : n));
      }
      setBadge(data.unread || 0);
      if (open) render({ animate: false });
    } catch (_) {
      /* ignore */
    }
  }

  let closeTimer = null;

  function toggle(force) {
    const next = typeof force === "boolean" ? force : !open;
    if (!panel || !btn) return;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    if (next) {
      open = true;
      panel.classList.remove("is-closing", "is-open");
      panel.hidden = false;
      // restart bloom animation every open
      void panel.offsetWidth;
      panel.classList.add("is-open");
      btn.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
      render({ animate: true });
      return;
    }

    if (!open) return;
    open = false;
    panel.classList.add("is-closing");
    panel.classList.remove("is-open");
    btn.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    closeTimer = window.setTimeout(() => {
      panel.classList.remove("is-closing");
      closeTimer = null;
    }, 420);
  }

  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });

  readAllBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    markRead(null, true);
  });

  list?.addEventListener("click", (e) => {
    const item = e.target.closest(".notify__item");
    if (!item) return;
    const id = item.dataset.id;
    if (id && item.classList.contains("is-unread")) {
      markRead(id, false);
    }
    toggle(false);
  });

  document.addEventListener("click", (e) => {
    if (!open) return;
    if (root.contains(e.target)) return;
    toggle(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) toggle(false);
  });

  // start closed: icon only
  if (panel) {
    panel.hidden = false;
    panel.classList.remove("is-open");
  }
  if (badge) {
    badge.hidden = true;
    badge.classList.remove("is-on");
  }

  fetchNotes();
  setInterval(fetchNotes, 10000);
})();
