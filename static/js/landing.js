/**
 * HupHup landing — nav, reveal, how-path, chat preview
 */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasIO = "IntersectionObserver" in window;

  function rafThrottle(fn) {
    let ticking = false;
    return function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        fn();
      });
    };
  }

  /* ——— Nav ——— */
  const nav = document.getElementById("nav");
  const menuToggle = document.getElementById("menuToggle");

  if (nav) {
    const onScroll = rafThrottle(() => {
      nav.classList.toggle("is-scrolled", window.scrollY > 8);
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  if (menuToggle && nav) {
    menuToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      menuToggle.setAttribute("aria-expanded", String(open));
    });

    nav.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        nav.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ——— Scroll reveal ——— */
  const revealEls = document.querySelectorAll("[data-reveal]");

  function revealAll(els) {
    els.forEach((el) => el.classList.add("is-visible"));
  }

  if (reduceMotion || !hasIO) {
    revealAll(revealEls);
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  /* ——— How path ——— */
  const SPINE_TOP = 120;
  const SPINE_BOTTOM = 24;
  const howPath = document.querySelector("[data-how-path]");
  const howLanes = howPath ? [...howPath.querySelectorAll("[data-how-lane]")] : [];
  const howPills = howPath ? [...howPath.querySelectorAll("[data-how-pill]")] : [];
  const howSpine = howPath?.querySelector(".how-path__spine");
  const howSpineFlow = howPath?.querySelector(".how-path__spine-flow");
  const howNodes = howLanes.map((lane) => lane.querySelector(".how-lane__node"));
  const lastLane = howLanes.length - 1;

  let howSpineLen = 0;
  let howActive = -1;
  let howPillTimer = 0;

  function syncHowSpineMetrics() {
    if (!howPath || !howSpine || !howSpineFlow) return 0;
    const h = Math.max(240, howPath.offsetHeight - SPINE_TOP - SPINE_BOTTOM);
    if (howSpine.clientHeight !== h) {
      howSpine.style.height = `${h}px`;
    }
    if (!howSpineLen) {
      howSpineLen = howSpineFlow.getTotalLength();
      howSpineFlow.style.strokeDasharray = String(howSpineLen);
    }
    return howSpineLen;
  }

  function spineOffsetForLane(index) {
    const len = howSpineLen || syncHowSpineMetrics();
    if (!len || !howSpineFlow || !howSpine) return 0;
    if (index >= lastLane) return 0;

    const node = howNodes[index];
    if (!node) return Math.max(0, len * (1 - (index + 1) / howLanes.length));

    const sb = howSpine.getBoundingClientRect();
    const nb = node.getBoundingClientRect();
    const nodeY = nb.top + nb.height / 2;
    const vbH = howSpine.viewBox.baseVal.height || 1000;
    const past = (nb.height * 0.55 * vbH) / Math.max(1, sb.height);

    const yAt = (dist) => {
      const pt = howSpineFlow.getPointAtLength(dist);
      return sb.top + (pt.y / vbH) * sb.height;
    };

    let lo = 0;
    let hi = len;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) * 0.5;
      if (yAt(mid) < nodeY) lo = mid;
      else hi = mid;
    }

    return Math.max(0, len - Math.min(len, hi + past));
  }

  function setHowPill(index) {
    if (index < 0 || index > lastLane) return;
    if (index === howActive && howSpineLen) {
      howSpineFlow.style.strokeDashoffset = String(spineOffsetForLane(index));
      return;
    }
    howActive = index;

    howPills.forEach((pill, i) => {
      const active = i === index;
      pill.classList.toggle("is-active", active);
      pill.setAttribute("aria-selected", String(active));
    });

    if (!howSpineFlow) return;
    syncHowSpineMetrics();
    howSpineFlow.style.strokeDashoffset = String(spineOffsetForLane(index));
  }

  function nearestHowLaneIndex() {
    const mid = window.innerHeight * 0.45;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < howLanes.length; i++) {
      const r = howLanes[i].getBoundingClientRect();
      const dist = Math.abs(r.top + r.height * 0.5 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  if (howPath && howLanes.length) {
    syncHowSpineMetrics();

    window.addEventListener(
      "resize",
      rafThrottle(() => {
        howSpineLen = 0;
        syncHowSpineMetrics();
        setHowPill(howActive >= 0 ? howActive : nearestHowLaneIndex());
      }),
      { passive: true }
    );

    if (reduceMotion) {
      howLanes.forEach((lane) => lane.classList.add("is-live"));
      syncHowSpineMetrics();
      if (howSpineFlow) howSpineFlow.style.strokeDashoffset = "0";
      setHowPill(lastLane);
    } else if (hasIO) {
      const laneIo = new IntersectionObserver(
        (entries) => {
          let touched = false;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-live");
            touched = true;
          }
          if (touched) setHowPill(nearestHowLaneIndex());
        },
        { threshold: [0.22, 0.4], rootMargin: "0px 0px -12% 0px" }
      );
      howLanes.forEach((lane) => laneIo.observe(lane));
    } else {
      howLanes.forEach((lane) => lane.classList.add("is-live"));
      setHowPill(lastLane);
    }

    howPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const idx = Number(pill.dataset.howPill);
        const target = howLanes[idx];
        if (!target || Number.isNaN(idx)) return;
        target.classList.add("is-live");
        target.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "center",
        });
        window.clearTimeout(howPillTimer);
        howPillTimer = window.setTimeout(
          () => setHowPill(idx),
          reduceMotion ? 0 : 380
        );
      });
    });

    setHowPill(0);
  }

  function observeOnce(el, onVisible, opts) {
    if (!el) return;
    if (reduceMotion || !hasIO) {
      el.classList.add("is-visible", "is-live");
      onVisible?.();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          el.classList.add("is-visible");
          onVisible?.();
          io.unobserve(el);
          break;
        }
      },
      opts || { threshold: 0.22, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
  }

  const audienceStage = document.querySelector(".audience-stage");
  observeOnce(audienceStage, () => audienceStage?.classList.add("is-visible"));

  /* ——— Chat demo ——— */
  const chat = document.getElementById("demoChat");
  const chips = [...document.querySelectorAll("[data-chip]")];
  const offers = document.getElementById("chatOffers");
  const chipsWrap = document.getElementById("chatChips");
  const msgUser = document.querySelector('[data-chat-msg="user"]');
  const msgTyping = document.querySelector('[data-chat-msg="typing"]');
  const msgBot = document.querySelector('[data-chat-msg="bot"]');
  const offerItems = offers ? [...offers.querySelectorAll("li")] : [];

  let demoTimers = [];

  function clearDemoTimers() {
    for (const id of demoTimers) clearTimeout(id);
    demoTimers = [];
  }

  function later(fn, ms) {
    const id = window.setTimeout(fn, ms);
    demoTimers.push(id);
    return id;
  }

  function showEl(el) {
    if (!el) return;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("is-shown"));
  }

  function hideEl(el) {
    if (!el) return;
    el.classList.remove("is-shown");
    el.hidden = true;
  }

  function revealOffers(stagger) {
    showEl(offers);
    offerItems.forEach((li, i) => {
      li.classList.remove("is-shown");
      later(() => li.classList.add("is-shown"), stagger * i);
    });
  }

  function resetDemo() {
    clearDemoTimers();
    chips.forEach((c) => c.classList.remove("is-active"));
    hideEl(msgTyping);
    hideEl(msgBot);
    if (chipsWrap) {
      chipsWrap.classList.remove("is-shown");
      chipsWrap.hidden = true;
    }
    hideEl(offers);
    offerItems.forEach((li) => li.classList.remove("is-shown"));
    if (msgUser) {
      msgUser.hidden = false;
      msgUser.classList.remove("is-shown");
      requestAnimationFrame(() => msgUser.classList.add("is-shown"));
    }
  }

  function runDemoLoop() {
    if (!chat) return;
    resetDemo();

    later(() => showEl(msgTyping), 1000);
    later(() => {
      hideEl(msgTyping);
      showEl(msgBot);
    }, 2400);
    later(() => {
      if (!chipsWrap) return;
      chipsWrap.hidden = false;
      requestAnimationFrame(() => chipsWrap.classList.add("is-shown"));
    }, 3200);
    later(() => {
      const first = chips[0];
      if (!first) return;
      chips.forEach((c) => c.classList.remove("is-active"));
      first.classList.add("is-active");
      revealOffers(140);
    }, 4500);
    later(runDemoLoop, 9500);
  }

  if (chat) {
    if (reduceMotion) {
      chat.classList.add("is-live");
      chat.querySelectorAll(".chat__msg, .chat__chips, .chat__offers li").forEach((el) => {
        el.hidden = false;
        el.classList.add("is-shown");
      });
      if (chipsWrap) chipsWrap.hidden = false;
      if (offers) offers.hidden = false;
    } else {
      observeOnce(chat.closest(".product__stage"), () => {
        chat.classList.add("is-live");
        runDemoLoop();
      });
    }
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      clearDemoTimers();
      chips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      revealOffers(80);
      later(runDemoLoop, 6500);
    });
  });
})();
