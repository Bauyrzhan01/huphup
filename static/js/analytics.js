/* Site-wide presence + page_view beacon for admin live dashboard */
(() => {
  const KEY = "hh_vid";

  function visitorId() {
    try {
      let id = localStorage.getItem(KEY);
      if (!id) {
        id =
          (crypto.randomUUID && crypto.randomUUID()) ||
          `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch {
      return `v_${Date.now().toString(36)}`;
    }
  }

  function send(kind) {
    const vid = visitorId();
    const path = `${location.pathname}${location.search || ""}`.slice(0, 240);
    const qs = new URLSearchParams({
      kind: kind || "pulse",
      path,
      vid,
    });
    const url = `/api/analytics/pulse?${qs}`;
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
        return;
      }
    } catch {
      /* fall through */
    }
    fetch(url, { method: "GET", credentials: "same-origin", keepalive: true }).catch(
      () => {}
    );
  }

  function start() {
    send("page_view");
    setInterval(() => send("pulse"), 45000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") send("pulse");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
