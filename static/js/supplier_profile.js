/* Supplier public profile + direct request */

const viewSupplier = document.getElementById("view-supplier");
const supplierBack = document.getElementById("supplier-back");
const supplierNameEl = document.getElementById("supplier-profile-name");
const supplierMetaEl = document.getElementById("supplier-profile-meta");
const supplierDescEl = document.getElementById("supplier-profile-desc");
const supplierContactsEl = document.getElementById("supplier-profile-contacts");
const supplierFavEl = document.getElementById("supplier-profile-fav");
const supplierProductsEl = document.getElementById("supplier-profile-products");
const supplierProductsEmpty = document.getElementById("supplier-profile-products-empty");
const supplierDirectForm = document.getElementById("supplier-direct-form");
const supplierDirectInput = document.getElementById("supplier-direct-input");
const supplierDirectError = document.getElementById("supplier-direct-error");

let activeSupplierId = null;
let supplierBackView = "favorites";

function spEscape(value) {
  return window.tbEscapeHtml(value);
}

function showSupplierDirectError(msg) {
  if (!supplierDirectError) return;
  supplierDirectError.hidden = !msg;
  supplierDirectError.textContent = msg || "";
}

async function openSupplierProfile(supplierId, backView = "favorites") {
  if (!supplierId) return;
  activeSupplierId = supplierId;
  supplierBackView = backView || "home";
  showView("supplier");
  showSupplierDirectError("");
  if (supplierDirectInput) supplierDirectInput.value = "";

  supplierNameEl.textContent = t("js.loading");
  supplierMetaEl.textContent = "";
  supplierDescEl.textContent = "";
  supplierContactsEl.innerHTML = "";
  supplierFavEl.innerHTML = "";
  supplierProductsEl.innerHTML = "";
  if (supplierProductsEmpty) supplierProductsEmpty.hidden = true;

  const res = await fetch(`/api/suppliers/${encodeURIComponent(supplierId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    supplierNameEl.textContent = t("js.supplier_missing");
    return;
  }

  const s = data.supplier || {};
  const city = s.city ? ` · ${s.city}` : "";
  const years = s.years_on_market ? t("js.years_market", { n: s.years_on_market }) : "";
  supplierNameEl.textContent = s.company_name || s.name || t("js.supplier");
  const rating =
    s.rating_count > 0 && s.rating_avg != null
      ? ` · ★ ${Number(s.rating_avg).toFixed(1)} (${s.rating_count})`
      : "";
  const cats = (s.categories && s.categories.length ? s.categories : [s.category])
    .filter(Boolean)
    .join(", ");
  supplierMetaEl.textContent = `${cats || t("js.no_category")}${city}${years}${rating}`;
  supplierDescEl.textContent = s.description || t("js.no_desc");

  const bits = [];
  if (s.phone) bits.push(`<span>Тел: ${spEscape(s.phone)}</span>`);
  if (s.website) {
    bits.push(
      `<a href="${spEscape(s.website)}" target="_blank" rel="noopener">${spEscape(s.website)}</a>`
    );
  }
  if (s.name) bits.push(`<span>${t("js.contact", { name: spEscape(s.name) })}</span>`);
  supplierContactsEl.innerHTML = bits.join("");

  if (typeof favHeartHtml === "function") {
    supplierFavEl.innerHTML = favHeartHtml("supplier", s.id);
    if (typeof bindFavButtons === "function") bindFavButtons(supplierFavEl);
  }

  const products = data.products || [];
  if (!products.length) {
    supplierProductsEl.innerHTML = "";
    if (supplierProductsEmpty) supplierProductsEmpty.hidden = false;
  } else {
    if (supplierProductsEmpty) supplierProductsEmpty.hidden = true;
    const heart = typeof favHeartHtml === "function" ? favHeartHtml : () => "";
    supplierProductsEl.innerHTML = products
      .map((p) => {
        const unit = p.unit ? spEscape(p.unit) : t("js.on_request");
        return `
        <article class="product-card">
          <div class="product-card-top">
            <span class="product-sub">${spEscape(p.subcategory || p.category || "")}</span>
            <div class="product-card-actions">
              <strong class="product-price">${unit}</strong>
              ${heart("product", p.id)}
            </div>
          </div>
          <h3>${spEscape(p.name)}</h3>
          <p>${spEscape(p.description || "")}</p>
          <div class="product-card-foot">
            <span></span>
            <button type="button" class="btn btn--solid btn--sm btn-fill-direct"
              data-name="${spEscape(p.name)}">${t("js.to_request")}</button>
          </div>
        </article>`;
      })
      .join("");
    supplierProductsEl.querySelectorAll(".btn-fill-direct").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (supplierDirectInput) {
          supplierDirectInput.value = t("js.need_prefix", { name: btn.dataset.name });
          supplierDirectInput.focus();
        }
      });
    });
    if (typeof bindFavButtons === "function") bindFavButtons(supplierProductsEl);
  }
}

supplierBack?.addEventListener("click", () => {
  showView(supplierBackView === "supplier" ? "home" : supplierBackView || "home");
});

supplierDirectForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showSupplierDirectError("");
  const text = (supplierDirectInput?.value || "").trim();
  if (text.length < 3) {
    showSupplierDirectError(t("js.need_describe"));
    return;
  }
  if (!activeSupplierId) {
    showSupplierDirectError(t("js.supplier_none"));
    return;
  }

  if (typeof startDirectRequest === "function") {
    await startDirectRequest(text, activeSupplierId);
  } else {
    showSupplierDirectError(t("js.chat_not_ready"));
  }
});

window.openSupplierProfile = openSupplierProfile;
