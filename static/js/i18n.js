(() => {
  const bundle = window.I18N_BUNDLE || {};
  const lang = window.I18N_LANG || "ru";
  const mode = window.I18N_MODE || "catalog";

  function t(key, vars) {
    let text = bundle[key];
    if (text == null) text = key;
    if (vars && typeof vars === "object") {
      Object.keys(vars).forEach((k) => {
        text = String(text).replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]);
      });
    }
    return text;
  }

  /**
   * Free-form text (chat bubbles, notification bodies, user content).
   * Catalog mode: returns text unchanged.
   * When I18N_MODE === "api", POSTs to /api/i18n/translate.
   */
  async function translateDynamic(text, opts) {
    if (!text || mode !== "api") return text;
    const target = (opts && opts.target) || lang;
    const source = opts && opts.source;
    try {
      const res = await fetch("/api/i18n/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.text != null) return data.text;
    } catch (_) {
      /* keep original */
    }
    return text;
  }

  window.t = t;
  window.translateDynamic = translateDynamic;
  window.I18N_LANG = lang;
  window.I18N = { mode, lang, t, translateDynamic };
  document.documentElement.lang = lang === "kk" ? "kk" : lang;
})();
