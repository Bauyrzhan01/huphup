/**
 * Auth canvas — same match-flow as landing hero, buyer / supplier modes.
 */
(function () {
  "use strict";

  const canvas = document.getElementById("authFlowCanvas");
  if (!canvas) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let start = performance.now();
  let mode = canvas.dataset.mode === "supplier" ? "supplier" : "user";
  let playing = false;
  let playResolve = null;
  let playStart = 0;
  const PLAY_SEC = 2.2;

  const SCENES = {
    user: {
      labels: ["ЗАПРОС", "МАТЧИНГ", "ОФЕРТЫ"],
      status: "3 запроса · 6 поставщиков · цены получены",
      queries: [
        { text: "10 т бетона М300 → Астана", x: 0.06, y: 0.12 },
        { text: "МФУ A3 · Алматы", x: 0.08, y: 0.42 },
        { text: "Разработка CRM", x: 0.05, y: 0.68 },
      ],
      hubs: [
        { label: "Стройматериалы", x: 0.38, y: 0.16 },
        { label: "Астана", x: 0.48, y: 0.28 },
        { label: "Доставка", x: 0.36, y: 0.36 },
        { label: "Офисная техника", x: 0.4, y: 0.48 },
        { label: "IT и ПО", x: 0.42, y: 0.66 },
        { label: "Алматы", x: 0.5, y: 0.56 },
      ],
      suppliers: [
        { label: "СтройБетон KZ", price: "2,45 млн ₸", x: 0.72, y: 0.12, hub: 0 },
        { label: "Astana Mix", price: "2,38 млн ₸", x: 0.78, y: 0.24, hub: 1 },
        { label: "ЦементПлюс", price: "2,51 млн ₸", x: 0.7, y: 0.36, hub: 2 },
        { label: "Office Pro", price: "890 000 ₸", x: 0.76, y: 0.48, hub: 3 },
        { label: "TechStack KZ", price: "от 1,2 млн ₸", x: 0.74, y: 0.62, hub: 4 },
        { label: "PrintHouse", price: "745 000 ₸", x: 0.8, y: 0.74, hub: 5 },
      ],
      floatChips: [
        { text: "Брус 150×150", x: 0.22, y: 0.08 },
        { text: "Фура 20 т", x: 0.58, y: 0.08 },
        { text: "Картриджи", x: 0.62, y: 0.78 },
        { text: "1С поддержка", x: 0.28, y: 0.78 },
      ],
    },
    supplier: {
      labels: ["ЗАЯВКИ", "МАТЧИНГ", "КАБИНЕТ"],
      status: "6 заявок · ваша категория · ответьте в чате",
      queries: [
        { text: "Бетон М300 · 12 м³", x: 0.06, y: 0.14 },
        { text: "Доставка Астана", x: 0.08, y: 0.38 },
        { text: "Цемент М400", x: 0.05, y: 0.62 },
      ],
      hubs: [
        { label: "Стройматериалы", x: 0.38, y: 0.16 },
        { label: "Астана", x: 0.46, y: 0.3 },
        { label: "Срок 3 дня", x: 0.36, y: 0.44 },
        { label: "Объём 12 м³", x: 0.42, y: 0.58 },
        { label: "Доставка", x: 0.44, y: 0.72 },
      ],
      suppliers: [
        { label: "Ваша компания", price: "новая заявка", x: 0.72, y: 0.14, hub: 0 },
        { label: "Релевантно", price: "2,38 млн ₸", x: 0.78, y: 0.3, hub: 1 },
        { label: "Ответить", price: "в чате", x: 0.74, y: 0.46, hub: 2 },
        { label: "Смета", price: "готова", x: 0.8, y: 0.62, hub: 3 },
        { label: "Сделка", price: "в работе", x: 0.76, y: 0.78, hub: 4 },
      ],
      floatChips: [
        { text: "Щебень 20 т", x: 0.24, y: 0.1 },
        { text: "Арматура", x: 0.56, y: 0.12 },
        { text: "Фура", x: 0.64, y: 0.82 },
      ],
    },
  };

  function scene() {
    return SCENES[mode === "supplier" ? "supplier" : "user"];
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = "rgba(0, 11, 34, 0.1)";
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0, 11, 34, 0.16)";
    for (let x = step; x < w; x += step * 2) {
      for (let y = step; y < h * 0.75; y += step * 2) {
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    ctx.restore();
  }

  function roundRect(x, y, bw, bh, r) {
    const rr = Math.min(r, bw / 2, bh / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + bw, y, x + bw, y + bh, rr);
    ctx.arcTo(x + bw, y + bh, x, y + bh, rr);
    ctx.arcTo(x, y + bh, x, y, rr);
    ctx.arcTo(x, y, x + bw, y, rr);
    ctx.closePath();
  }

  function drawQueryBox(x, y, text, alpha, solid) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "600 13px Manrope, system-ui, sans-serif";
    const tw = ctx.measureText(text).width;
    const padX = 14;
    const padY = 11;
    const bw = tw + padX * 2;
    const bh = 36;
    if (solid) {
      ctx.fillStyle = "#000b22";
      roundRect(x, y, bw, bh, 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
    } else {
      ctx.fillStyle = "#ffffff";
      roundRect(x, y, bw, bh, 2);
      ctx.fill();
      ctx.strokeStyle = "#000b22";
      ctx.lineWidth = 1.35;
      roundRect(x, y, bw, bh, 2);
      ctx.stroke();
      ctx.fillStyle = "#000b22";
    }
    ctx.fillText(text, x + padX, y + padY + 11);
    ctx.restore();
    return { cx: x + bw, cy: y + bh / 2 };
  }

  function drawChip(x, y, text, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "600 11px Manrope, system-ui, sans-serif";
    const tw = ctx.measureText(text).width;
    const padX = 10;
    const bw = tw + padX * 2;
    const bh = 26;
    ctx.fillStyle = "#ffffff";
    roundRect(x, y, bw, bh, 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 11, 34, 0.42)";
    ctx.lineWidth = 1;
    roundRect(x, y, bw, bh, 2);
    ctx.stroke();
    ctx.fillStyle = "#000b22";
    ctx.fillText(text, x + padX, y + 17);
    ctx.restore();
  }

  function drawHub(x, y, label, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#000b22";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 11, 34, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = "600 12px Manrope, system-ui, sans-serif";
    ctx.fillStyle = "#000b22";
    ctx.fillText(label, x + 16, y + 4);
    ctx.restore();
  }

  function drawSupplier(x, y, label, price, alpha, priceAlpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#000b22";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = "600 12px Manrope, system-ui, sans-serif";
    ctx.fillStyle = "#000b22";
    ctx.fillText(label, x + 14, y + 4);
    ctx.restore();

    if (priceAlpha > 0.05) {
      ctx.save();
      ctx.globalAlpha = priceAlpha;
      ctx.font = "700 12px Manrope, system-ui, sans-serif";
      const tw = ctx.measureText(price).width;
      const padX = 10;
      const bw = tw + padX * 2;
      const bh = 24;
      const bx = x + 14;
      const by = y + 12;
      ctx.fillStyle = "#000b22";
      roundRect(bx, by, bw, bh, 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(price, bx + padX, by + 16);
      ctx.restore();
    }
  }

  function drawCurve(x0, y0, x1, y1, progress, alpha, solid) {
    const mx = (x0 + x1) / 2;
    const c1x = mx;
    const c1y = y0;
    const c2x = mx;
    const c2y = y1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = solid ? "rgba(0, 11, 34, 0.68)" : "rgba(0, 11, 34, 0.48)";
    ctx.lineWidth = solid ? 1.5 : 1.15;
    if (!solid) {
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -progress * 48;
    }

    const steps = 28;
    const end = Math.max(1, Math.floor(steps * progress));
    ctx.beginPath();
    for (let i = 0; i <= end; i++) {
      const tt = i / steps;
      const px =
        Math.pow(1 - tt, 3) * x0 +
        3 * Math.pow(1 - tt, 2) * tt * c1x +
        3 * (1 - tt) * tt * tt * c2x +
        tt * tt * tt * x1;
      const py =
        Math.pow(1 - tt, 3) * y0 +
        3 * Math.pow(1 - tt, 2) * tt * c1y +
        3 * (1 - tt) * tt * tt * c2y +
        tt * tt * tt * y1;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    if (progress > 0.08) {
      const tt = progress;
      const px =
        Math.pow(1 - tt, 3) * x0 +
        3 * Math.pow(1 - tt, 2) * tt * c1x +
        3 * (1 - tt) * tt * tt * c2x +
        tt * tt * tt * x1;
      const py =
        Math.pow(1 - tt, 3) * y0 +
        3 * Math.pow(1 - tt, 2) * tt * c1y +
        3 * (1 - tt) * tt * tt * c2y +
        tt * tt * tt * y1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#000b22";
      ctx.fill();
    }
    ctx.restore();
  }

  function drawColumnLabels(alpha, labels) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.72;
    ctx.font = "700 10px Manrope, system-ui, sans-serif";
    ctx.fillStyle = "#3d4a5c";
    const xs = [0.08, 0.38, 0.72];
    labels.forEach((t, i) => {
      ctx.fillText(t, w * xs[i], h * 0.055);
    });
    ctx.restore();
  }

  function layoutY(base, mobile) {
    return mobile ? Math.min(base, 0.55) : base;
  }

  function paint(now) {
    if (!w || !h) resize();
    const data = scene();
    const elapsed = playing ? (now - playStart) / 1000 : (now - start) / 1000;
    const t = playing ? Math.min(elapsed, PLAY_SEC) : elapsed % 9.5;
    const mobile = w < 720;

    ctx.clearRect(0, 0, w, h);
    drawGrid();

    const labelA = easeInOut(clamp01(t / 0.6));
    if (!mobile) drawColumnLabels(labelA, data.labels);

    data.floatChips.forEach((c, i) => {
      const a = easeInOut(clamp01((t - 0.4 - i * 0.15) / 0.5)) * (mobile ? 0.45 : 0.92);
      const bob = Math.sin(elapsed * 1.1 + i) * 3;
      drawChip(w * c.x, h * layoutY(c.y, mobile) + bob, c.text, a);
    });

    const qBoxes = data.queries.map((q, i) => {
      const a = easeInOut(clamp01((t - i * 0.35) / 0.7));
      const y = h * layoutY(q.y, mobile);
      return drawQueryBox(w * q.x, y, q.text, a, i === 0);
    });

    data.hubs.forEach((hub, i) => {
      const appear = easeInOut(clamp01((t - 1.1 - i * 0.12) / 0.5));
      const hx = w * (mobile ? 0.28 + (i % 2) * 0.08 : hub.x);
      const hy = h * layoutY(hub.y, mobile);
      const q = qBoxes[i < 3 ? 0 : i < 5 ? 1 : 2];
      if (q && appear > 0) {
        drawCurve(q.cx, q.cy, hx, hy, appear, appear * 0.95, false);
      }
      drawHub(hx, hy, hub.label, appear);
    });

    data.suppliers.forEach((s, i) => {
      const appear = easeInOut(clamp01((t - 2.4 - i * 0.14) / 0.5));
      const sx = w * (mobile ? 0.62 : s.x);
      const sy = h * layoutY(s.y, mobile);
      const hub = data.hubs[s.hub];
      if (!hub) return;
      const hx = w * (mobile ? 0.28 + (s.hub % 2) * 0.08 : hub.x);
      const hy = h * layoutY(hub.y, mobile);
      drawCurve(hx, hy, sx, sy, appear, appear * 0.9, true);
      const priceA = appear * easeInOut(clamp01((t - 4.0 - i * 0.1) / 0.45));
      drawSupplier(sx, sy, s.label, s.price, appear, priceA);
    });

    if (!mobile) {
      const statusA = easeInOut(clamp01((t - 5.2) / 0.5));
      ctx.save();
      ctx.globalAlpha = statusA * 0.85;
      ctx.font = "600 12px Manrope, system-ui, sans-serif";
      ctx.fillStyle = "#3d4a5c";
      ctx.fillText(data.status, w * 0.58, h * 0.92);
      ctx.restore();
    }

    if (!playing && t > 8.6) {
      const fade = easeInOut((t - 8.6) / 0.9);
      ctx.fillStyle = `rgba(243, 247, 252,${fade * 0.1})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function loop(now) {
    paint(now);
    if (playing && (now - playStart) / 1000 >= PLAY_SEC) {
      playing = false;
      canvas.classList.add("is-idle");
      canvas.classList.remove("is-playing");
      start = performance.now();
      if (playResolve) {
        const r = playResolve;
        playResolve = null;
        r(true);
      }
    }
    raf = requestAnimationFrame(loop);
  }

  function syncQuote() {
    const title = document.getElementById("auth-quote-title");
    const text = document.getElementById("auth-quote-text");
    if (!title || !text || typeof t !== "function") return;
    if (mode === "supplier") {
      title.textContent = t("auth.quote_supplier_title");
      text.textContent = t("auth.quote_supplier_text");
    } else {
      title.textContent = t("auth.quote_user_title");
      text.textContent = t("auth.quote_user_text");
    }
  }

  function setMode(next) {
    mode = next === "supplier" ? "supplier" : "user";
    canvas.dataset.mode = mode;
    syncQuote();
    start = performance.now();
    if (!playing) paint(performance.now());
  }

  function play() {
    if (reduceMotion) {
      paint(performance.now());
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      playResolve = resolve;
      playing = true;
      playStart = performance.now();
      canvas.classList.remove("is-idle");
      canvas.classList.add("is-playing");
    });
  }

  window.AuthFlow = { setMode, getMode: () => mode, play, isPlaying: () => playing };

  resize();
  window.addEventListener("resize", () => {
    resize();
    paint(performance.now());
  });

  if (location.hash === "#supplier") setMode("supplier");
  else setMode(mode);

  syncQuote();

  if (reduceMotion) {
    paint(performance.now());
  } else {
    raf = requestAnimationFrame(loop);
  }
})();
