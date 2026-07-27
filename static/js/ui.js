/* Small shared UI helpers */
(() => {
  function initials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function avatarTone(name) {
    let h = 0;
    const s = String(name || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 5;
  }

  function avatarHtml(name, size) {
    const cls = size ? `avatar avatar--${size}` : "avatar";
    return `<span class="${cls} avatar--t${avatarTone(name)}" aria-hidden="true">${initials(name)}</span>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setSidebarOpen(open) {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (!sidebar) return;
    sidebar.classList.toggle("is-open", open);
    document.body.classList.toggle("is-sidebar-open", open);
    if (backdrop) backdrop.hidden = !open;
  }

  function initMobileSidebar() {
    const menuOpen = document.getElementById("menuOpen");
    const backdrop = document.getElementById("sidebar-backdrop");
    const sidebar = document.getElementById("sidebar");
    if (!menuOpen || !sidebar) return;

    menuOpen.addEventListener("click", () => {
      setSidebarOpen(!sidebar.classList.contains("is-open"));
    });

    backdrop?.addEventListener("click", () => setSidebarOpen(false));

    sidebar.querySelectorAll("a, button").forEach((el) => {
      el.addEventListener("click", () => {
        if (window.matchMedia("(max-width: 780px)").matches) setSidebarOpen(false);
      });
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 780) setSidebarOpen(false);
    });
  }

  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const opts = init ? { ...init } : {};
    const method = String(opts.method || "GET").toUpperCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const headers = new Headers(opts.headers || {});
      const token = csrfToken();
      if (token && !headers.has("X-CSRF-Token")) {
        headers.set("X-CSRF-Token", token);
      }
      opts.headers = headers;
    }
    return _fetch(input, opts);
  };

  function dealAttachmentHtml(att) {
    if (!att || !att.url) return "";
    const name = escapeHtml(att.name || "file");
    const url = escapeHtml(att.url);
    const mime = String(att.mime || "");
    if (mime.startsWith("image/")) {
      return `<a class="deal-attachment deal-attachment--img" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${name}" loading="lazy" /></a>`;
    }
    return `<a class="deal-attachment deal-attachment--file" href="${url}" target="_blank" rel="noopener">${name}</a>`;
  }

  // --- Экран загрузки: прячем как только страница/данные готовы ---
  let loaderHidden = false;
  function hidePageLoader() {
    if (loaderHidden) return;
    loaderHidden = true;
    const el = document.getElementById("page-loader");
    if (!el) return;
    el.classList.add("is-hidden");
    setTimeout(() => el.remove(), 450);
  }
  function showPageLoader() {
    let el = document.getElementById("page-loader");
    if (!el) {
      el = document.createElement("div");
      el.className = "page-loader";
      el.id = "page-loader";
      el.setAttribute("role", "status");
      el.innerHTML =
        '<div class="page-loader__box"><span class="page-loader__spinner"></span></div>';
      document.body.appendChild(el);
    }
    loaderHidden = false;
    el.classList.remove("is-hidden");
  }
  // Лоадер прячет сама страница, когда подгрузила первичные данные
  // (home.js / supplier_products.js / admin.js). Здесь только страховка,
  // чтобы экран не завис навсегда, если запрос упал или подвис.
  setTimeout(hidePageLoader, 8000);

  window.tbHidePageLoader = hidePageLoader;
  window.tbShowPageLoader = showPageLoader;
  window.tbInitials = initials;
  window.tbAvatarTone = avatarTone;
  window.tbAvatarHtml = avatarHtml;
  window.tbEscapeHtml = escapeHtml;
  window.tbDealAttachmentHtml = dealAttachmentHtml;
  window.tbSetSidebarOpen = setSidebarOpen;
  window.tbCsrfToken = csrfToken;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileSidebar);
  } else {
    initMobileSidebar();
  }
})();
