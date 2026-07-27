async function postJson(url, body) {
  const headers = { "Content-Type": "application/json" };
  const token =
    (typeof window.tbCsrfToken === "function" && window.tbCsrfToken()) ||
    (document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) || [])[1];
  if (token) headers["X-CSRF-Token"] = decodeURIComponent(token);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function showError(message) {
  const el = document.getElementById("form-error");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

// Показываем экран загрузки на время перехода после входа/регистрации,
// чтобы вместо «замершего» экрана была анимация загрузки. Оверлей рисуется
// на текущей странице и держится за счёт paint-holding браузера, пока
// не отрисуется новая страница — так не видно белого «застывшего» экрана.
function navWithLoader(url) {
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
  el.classList.remove("is-hidden");

  let navigated = false;
  const go = () => {
    if (navigated) return;
    navigated = true;
    window.location.href = url;
  };
  // Даём браузеру отрисовать оверлей (2 кадра), потом уходим на новую страницу.
  requestAnimationFrame(() => requestAnimationFrame(go));
  // Страховка на случай, если кадры не пришли (вкладка в фоне и т.п.).
  setTimeout(go, 120);
}

function showSuccess(message) {
  const el = document.getElementById("form-success");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function formToObject(form) {
  const raw = new FormData(form);
  const data = {};
  for (const [key, value] of raw.entries()) {
    const val = typeof value === "string" ? value.trim() : value;
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (!Array.isArray(data[key])) data[key] = [data[key]];
      data[key].push(val);
    } else {
      data[key] = val;
    }
  }
  // multi-select / checkbox categories: always array when present
  const catChecks = form.querySelectorAll('input[name="categories"][type="checkbox"]');
  if (catChecks.length) {
    data.categories = [...catChecks]
      .filter((el) => el.checked)
      .map((el) => el.value)
      .filter(Boolean);
  } else {
    const catSelect = form.querySelector('select[name="categories"]');
    if (catSelect) {
      data.categories = [...catSelect.selectedOptions].map((o) => o.value).filter(Boolean);
    }
  }
  const prefSelect = form.querySelector('select[name="preferred_categories"]');
  if (prefSelect) {
    data.preferred_categories = [...prefSelect.selectedOptions]
      .map((o) => o.value)
      .filter(Boolean);
  }
  return data;
}

const authForm = document.getElementById("auth-form");
if (authForm) {
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const mode =
      authForm.dataset.submitMode ||
      document.getElementById("mode-input")?.value ||
      "login";
    const payload = formToObject(authForm);
    const roleInput = document.getElementById("role-input");
    if (roleInput) payload.role = roleInput.value;

    const submitBtn = authForm.querySelector(".wiz__screen.is-active .wiz-next:not([hidden])");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add("is-busy");
    }

    try {
      if (mode === "register") {
        const { res, data } = await postJson("/api/register", payload);
        if (!res.ok || !data.ok) {
          showError(data.error || "Не удалось зарегистрироваться");
          return;
        }
        if (window.AuthWizard?.playExit) await window.AuthWizard.playExit();
        navWithLoader(data.redirect || "/dashboard");
        return;
      }

      const { res, data } = await postJson("/api/login", payload);
      if (!res.ok || !data.ok) {
        showError(data.error || "Не удалось войти");
        return;
      }
      if (window.AuthWizard?.playExit) await window.AuthWizard.playExit();
      navWithLoader(data.redirect || "/dashboard");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("is-busy");
      }
    }
  });
}

const loginForm = document.getElementById("login-form");
if (loginForm && !authForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const btn = loginForm.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-busy");
    }
    let ok = false;
    try {
      const payload = formToObject(loginForm);
      const { res, data } = await postJson("/api/login", payload);
      if (!res.ok || !data.ok) {
        showError(data.error || "Не удалось войти");
        return;
      }
      ok = true;
      navWithLoader(data.redirect || "/dashboard");
    } finally {
      if (btn && !ok) {
        btn.disabled = false;
        btn.classList.remove("is-busy");
      }
    }
  });
}

const registerForm = document.getElementById("register-form");
if (registerForm && !authForm) {
  const roleInput = document.getElementById("role-input");
  const inviteInput = document.getElementById("invite-input");
  const supplierFields = document.getElementById("supplier-fields");
  const roleBtns = registerForm.querySelectorAll("[data-role]");
  const roleField = document.getElementById("role-field");
  const inviteBanner = document.getElementById("invite-banner");
  const stepForm = document.getElementById("register-step-form");
  const stepVerify = document.getElementById("register-step-verify");
  const verifyEmailDisplay = document.getElementById("verify-email-display");
  const verifyCodeInput = document.getElementById("verify-code");
  const verifyError = document.getElementById("verify-error");
  const verifyHint = document.getElementById("verify-hint");
  let pendingEmail = "";
  let inviteToken = "";

  function tKey(key, fallback) {
    return typeof t === "function" ? t(key) : fallback;
  }

  async function setupInviteMode() {
    const params = new URLSearchParams(location.search);
    inviteToken = (params.get("invite") || "").trim();
    if (!inviteToken) return;
    if (inviteInput) inviteInput.value = inviteToken;
    if (roleInput) roleInput.value = "supplier";
    if (roleField) roleField.hidden = true;
    if (supplierFields) {
      supplierFields.hidden = true;
      supplierFields.querySelectorAll("input, select").forEach((el) => {
        el.required = false;
      });
    }
    try {
      const res = await fetch(`/api/team/invite/${encodeURIComponent(inviteToken)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showError(data.error || tKey("auth.invite_invalid", "Ссылка приглашения недействительна"));
        return;
      }
      const company = data.company_name || "";
      const title = document.getElementById("register-title");
      if (title) title.textContent = tKey("auth.invite_title", "Регистрация менеджера");
      if (inviteBanner) {
        inviteBanner.hidden = false;
        inviteBanner.textContent =
          tKey("auth.invite_banner", "Вы присоединяетесь к команде") +
          (company ? `: ${company}` : "");
      }
    } catch (_) {
      showError(tKey("auth.invite_invalid", "Ссылка приглашения недействительна"));
    }
  }

  function showVerifyError(message) {
    if (!verifyError) return;
    verifyError.hidden = !message;
    verifyError.textContent = message || "";
  }

  function showVerifyHint(message) {
    if (!verifyHint) return;
    verifyHint.hidden = !message;
    verifyHint.textContent = message || "";
  }

  function showVerifyStep(email, message) {
    pendingEmail = email;
    if (verifyEmailDisplay) verifyEmailDisplay.textContent = email;
    if (stepForm) stepForm.hidden = true;
    if (stepVerify) stepVerify.hidden = false;
    showError("");
    showVerifyError("");
    showVerifyHint(message || "");
    if (verifyCodeInput) {
      verifyCodeInput.value = "";
      verifyCodeInput.focus();
    }
  }

  function showFormStep() {
    pendingEmail = "";
    if (stepVerify) stepVerify.hidden = true;
    if (stepForm) stepForm.hidden = false;
    showVerifyError("");
    showVerifyHint("");
  }

  function setRole(role) {
    if (inviteToken) return;
    const next = role === "supplier" ? "supplier" : "user";
    if (roleInput) roleInput.value = next;
    roleBtns.forEach((btn) => {
      const active = btn.dataset.role === next;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (supplierFields) {
      const show = next === "supplier";
      if (show) {
        supplierFields.hidden = false;
        supplierFields.classList.remove("is-closing");
      } else {
        supplierFields.classList.add("is-closing");
        window.setTimeout(() => {
          if (roleInput?.value !== "supplier") supplierFields.hidden = true;
          supplierFields.classList.remove("is-closing");
        }, 180);
      }
      supplierFields.querySelectorAll("input, select").forEach((el) => {
        el.required =
          show &&
          (el.name === "company_name" || el.name === "bin" || el.name === "phone" || el.name === "categories");
        if (!show) {
          if (el.tagName === "SELECT") [...el.options].forEach((o) => (o.selected = false));
          else el.value = "";
        }
      });
    }
    const quote = document.querySelector(".auth__quote");
    if (quote) {
      quote.classList.add("is-switching");
      window.setTimeout(() => quote.classList.remove("is-switching"), 320);
    }
    if (window.AuthFlow?.setMode) window.AuthFlow.setMode(next);
  }

  roleBtns.forEach((btn) => {
    btn.addEventListener("click", () => setRole(btn.dataset.role));
  });
  setRole(roleInput?.value || "user");

  if (location.hash === "#supplier") setRole("supplier");
  setupInviteMode();

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (stepVerify && !stepVerify.hidden) {
      document.getElementById("verify-submit")?.click();
      return;
    }
    showError("");
    const btn = document.getElementById("register-submit") || registerForm.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-busy");
    }
    try {
      const payload = formToObject(registerForm);
      if (roleInput) payload.role = roleInput.value;
      if (inviteToken) {
        payload.invite = inviteToken;
        payload.role = "supplier";
      }
      const { res, data } = await postJson("/api/register", payload);
      if (!res.ok || !data.ok) {
        showError(data.error || tKey("js.err_register", "Не удалось зарегистрироваться"));
        return;
      }
      if (data.needs_verification) {
        showVerifyStep(data.email || payload.email, data.message || "");
        if (data.dev_code && verifyCodeInput) verifyCodeInput.value = data.dev_code;
        return;
      }
      navWithLoader(data.redirect || "/dashboard");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("is-busy");
      }
    }
  });

  document.getElementById("verify-submit")?.addEventListener("click", async () => {
    showVerifyError("");
    const btn = document.getElementById("verify-submit");
    const code = (verifyCodeInput?.value || "").replace(/\D/g, "");
    if (code.length !== 6) {
      showVerifyError(tKey("auth.verify_code_invalid", "Введите 6-значный код из письма"));
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-busy");
    }
    let ok = false;
    try {
      const { res, data } = await postJson("/api/register/verify", {
        email: pendingEmail,
        code,
      });
      if (!res.ok || !data.ok) {
        showVerifyError(data.error || tKey("auth.verify_failed", "Неверный код"));
        return;
      }
      ok = true;
      navWithLoader(data.redirect || "/dashboard");
    } finally {
      if (btn && !ok) {
        btn.disabled = false;
        btn.classList.remove("is-busy");
      }
    }
  });

  document.getElementById("verify-resend")?.addEventListener("click", async () => {
    showVerifyError("");
    const btn = document.getElementById("verify-resend");
    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-busy");
    }
    try {
      const { res, data } = await postJson("/api/register/resend", { email: pendingEmail });
      if (!res.ok || !data.ok) {
        showVerifyError(data.error || tKey("auth.verify_resend_fail", "Не удалось отправить код"));
        return;
      }
      showVerifyHint(data.message || tKey("auth.verify_resent", "Новый код отправлен"));
      if (data.dev_code && verifyCodeInput) verifyCodeInput.value = data.dev_code;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("is-busy");
      }
    }
  });

  document.getElementById("verify-back")?.addEventListener("click", () => {
    showFormStep();
  });

  verifyCodeInput?.addEventListener("input", () => {
    verifyCodeInput.value = verifyCodeInput.value.replace(/\D/g, "").slice(0, 6);
  });
}

const profileForm = document.getElementById("profile-form");
if (profileForm) {
  const profileError = document.getElementById("profile-error");
  const profileSuccess = document.getElementById("profile-success");

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (profileError) {
      profileError.hidden = true;
      profileError.textContent = "";
    }
    if (profileSuccess) {
      profileSuccess.hidden = true;
      profileSuccess.textContent = "";
    }
    if (typeof syncInterestSelect === "function") syncInterestSelect();
    const payload = formToObject(profileForm);
    const { res, data } = await postJson("/api/profile", payload);
    if (!res.ok || !data.ok) {
      if (profileError) {
        profileError.hidden = false;
        profileError.textContent =
          data.error ||
          (typeof t === "function" ? t("js.err_send") : "Не удалось сохранить профиль");
      }
      return;
    }
    if (profileSuccess) {
      profileSuccess.hidden = false;
      profileSuccess.textContent =
        data.message ||
        (typeof t === "function" ? t("home.profile_saved_toast") : "Профиль сохранён");
    }
    const name = data.user?.name || payload.name;
    if (name) {
      const sideName = document.getElementById("open-profile");
      if (sideName) sideName.textContent = name;
      const sidePlain = document.querySelector(".sidebar__user-name:not(.sidebar__user-name--btn)");
      if (sidePlain) {
        const company =
          data.user?.supplier?.company_name || payload.company_name || null;
        sidePlain.textContent = company || name;
      }
      const greet = document.querySelector(".chat-empty__greet");
      if (greet && typeof t === "function") {
        const first = String(name).trim().split(/\s+/)[0] || name;
        greet.textContent = t("home.greet", { name: first });
      }
      if (typeof tbInitials === "function") {
        const ini = tbInitials(name);
        const tone = typeof tbAvatarTone === "function" ? tbAvatarTone(name) : 0;
        document.querySelectorAll("#user-avatar, .chat-empty__avatar, #profile-hero-avatar").forEach((el) => {
          el.textContent = ini;
          el.className = el.className.replace(/avatar--t\d/g, "") + ` avatar--t${tone}`;
        });
      }
      const heroName = document.getElementById("profile-hero-name");
      if (heroName) {
        const company =
          data.user?.supplier?.company_name ||
          payload.company_name ||
          payload.company;
        heroName.textContent =
          document.querySelector(".profile-view--supplier") && company
            ? company
            : name;
      }
    }
    if (typeof updateProfileCompleteness === "function") updateProfileCompleteness();
    const statsGrid = document.getElementById("profile-stats-grid");
    if (statsGrid) delete statsGrid.dataset.loaded;
    if (typeof loadBuyerProfile === "function") loadBuyerProfile(true);
    const cats =
      data.user?.supplier?.categories ||
      payload.categories ||
      null;
    if (Array.isArray(cats)) {
      window.SUPPLIER_CATEGORIES = cats;
      if (cats[0]) window.SUPPLIER_CATEGORY = cats[0];
    }
  });
}
