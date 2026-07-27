const viewHome = document.getElementById("view-home");
const viewCatalog = document.getElementById("view-catalog");
const navHome = document.getElementById("nav-home");
const navCatalog = document.getElementById("nav-catalog");
const catalogCategories = document.getElementById("catalog-categories");
const catalogSubcategories = document.getElementById("catalog-subcategories");
const catalogProducts = document.getElementById("catalog-products");
const catalogEmpty = document.getElementById("catalog-empty");
const catalogBreadcrumb = document.getElementById("catalog-breadcrumb");
const catalogTitle = document.querySelector(".catalog-title");

let catalogData = [];
let currentCategory = null;
let currentSubcategory = null;
const catalogFilters = document.getElementById("catalog-filters");
const PLACEHOLDER_IMG = "/static/img/catalog-placeholder.svg";

function productImageUrl(p) {
  const urls = Array.isArray(p?.image_urls) ? p.image_urls.filter(Boolean) : [];
  return urls[0] || p?.image_url || PLACEHOLDER_IMG;
}

function catalogFilterParams() {
  const params = {};
  const city = document.getElementById("catalog-filter-city")?.value?.trim();
  const stock = document.getElementById("catalog-filter-stock")?.value?.trim();
  const pmin = document.getElementById("catalog-filter-price-min")?.value?.trim();
  const pmax = document.getElementById("catalog-filter-price-max")?.value?.trim();
  if (city) params.city = city;
  if (stock) params.stock_status = stock;
  if (pmin) params.price_min = pmin;
  if (pmax) params.price_max = pmax;
  return params;
}

function escapeHtml(value) {
  return window.tbEscapeHtml(value);
}

function showCatalogView() {
  if (typeof showView === "function") {
    showView("catalog");
  } else {
    viewHome.hidden = true;
    viewCatalog.hidden = false;
  }
  if (!catalogData.length) loadCatalog();
}

function renderBreadcrumb() {
  const parts = [
    `<button type="button" class="crumb" data-level="root">${t("js.all_categories")}</button>`,
  ];
  if (currentCategory) {
    parts.push(`<span class="crumb-sep">/</span>`);
    parts.push(
      `<button type="button" class="crumb" data-level="category">${escapeHtml(currentCategory.name)}</button>`
    );
  }
  if (currentSubcategory) {
    parts.push(`<span class="crumb-sep">/</span>`);
    parts.push(
      `<span class="crumb current">${escapeHtml(currentSubcategory.name)}</span>`
    );
  }
  catalogBreadcrumb.innerHTML = parts.join("");
  catalogBreadcrumb.querySelectorAll(".crumb[data-level]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.level === "root") {
        openCategories();
      } else if (btn.dataset.level === "category") {
        openSubcategories(currentCategory);
      }
    });
  });
}

function openCategories() {
  currentCategory = null;
  currentSubcategory = null;
  if (catalogFilters) catalogFilters.hidden = true;
  if (catalogTitle) catalogTitle.textContent = t("home.catalog_title");
  catalogCategories.hidden = false;
  catalogSubcategories.hidden = true;
  catalogProducts.hidden = true;
  catalogEmpty.hidden = true;
  catalogCategories.innerHTML = catalogData
    .map(
      (cat) => `
      <button type="button" class="cat-card" data-id="${escapeHtml(cat.id)}">
        <strong>${escapeHtml(cat.name)}</strong>
        <span>${t("js.subcats_n", { n: (cat.subcategories || []).length })}</span>
      </button>`
    )
    .join("");
  catalogCategories.querySelectorAll(".cat-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = catalogData.find((c) => c.id === btn.dataset.id);
      if (cat) openSubcategories(cat);
    });
  });
  renderBreadcrumb();
}

function openSubcategories(category) {
  currentCategory = category;
  currentSubcategory = null;
  if (catalogFilters) catalogFilters.hidden = true;
  if (catalogTitle) catalogTitle.textContent = category.name;
  catalogCategories.hidden = true;
  catalogSubcategories.hidden = false;
  catalogProducts.hidden = true;
  catalogEmpty.hidden = true;
  catalogSubcategories.innerHTML = (category.subcategories || [])
    .map(
      (sub) => `
      <button type="button" class="cat-card sub" data-id="${escapeHtml(sub.id)}">
        <strong>${escapeHtml(sub.name)}</strong>
        <span>${t("js.open_products")}</span>
      </button>`
    )
    .join("");
  catalogSubcategories.querySelectorAll(".cat-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sub = (category.subcategories || []).find((s) => s.id === btn.dataset.id);
      if (sub) openProducts(category, sub);
    });
  });
  renderBreadcrumb();
}

async function openProducts(category, subcategory) {
  currentCategory = category;
  currentSubcategory = subcategory;
  if (catalogTitle) catalogTitle.textContent = subcategory.name;
  if (catalogFilters) catalogFilters.hidden = false;
  catalogCategories.hidden = true;
  catalogSubcategories.hidden = true;
  catalogProducts.hidden = false;
  renderBreadcrumb();

  const params = new URLSearchParams({
    category: category.name,
    subcategory: subcategory.id,
    ...catalogFilterParams(),
  });
  const res = await fetch(`/api/products?${params}`);
  const data = await res.json();
  const items = data.items || [];
  if (!items.length) {
    catalogProducts.innerHTML = "";
    catalogEmpty.hidden = false;
    return;
  }
  catalogEmpty.hidden = true;
  const heart = typeof favHeartHtml === "function" ? favHeartHtml : () => "";
  catalogProducts.innerHTML = items
    .map((p) => {
      const unit = p.unit ? escapeHtml(p.unit) : "";
      const priceLabel =
        p.price != null && p.price !== ""
          ? `${Number(p.price).toLocaleString("ru-RU")} ₸`
          : unit
            ? unit
            : t("js.on_request");
      const stock =
        p.stock_status === "on_order" || p.stock_label === "Под заказ"
          ? `<span class="stock-badge stock-badge--order">${t("js.on_order")}</span>`
          : `<span class="stock-badge stock-badge--in">${t("js.in_stock")}</span>`;
      return `
      <article class="product-card">
        <img class="product-card__img" src="${escapeHtml(productImageUrl(p))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'" />
        <div class="product-card-top">
          <span class="product-sub">${escapeHtml(p.subcategory || "")}</span>
          <div class="product-card-actions">
            <strong class="product-price">${escapeHtml(String(priceLabel))}</strong>
            ${heart("product", p.id)}
          </div>
        </div>
        <h3>${escapeHtml(p.name)}</h3>
        ${stock}
        <p>${escapeHtml(p.description || "")}</p>
        <div class="product-card-foot">
          <button type="button" class="product-supplier-link" data-supplier="${escapeHtml(p.supplier_id || "")}">${escapeHtml(p.supplier_name || t("js.supplier"))}</button>
          <button type="button" class="btn btn--solid btn--sm btn-order" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" data-supplier="${escapeHtml(p.supplier_id || "")}">${t("js.request_price")}</button>
        </div>
      </article>`;
    })
    .join("");

  catalogProducts.querySelectorAll(".btn-order").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const productId = btn.dataset.id;
      const name = btn.dataset.name;
      const supplierId = btn.dataset.supplier;
      const text = t("js.need_prefix", { name });
      if (productId && typeof submitRequest === "function") {
        showView("home");
        const { res, data } = await submitRequest({
          text,
          product_id: productId,
          supplier_id: supplierId || undefined,
          confirm: true,
        });
        if (res.ok && data.ok && data.request && typeof showRequest === "function") {
          showRequest(data.request, data.message);
          if (typeof loadHistory === "function") loadHistory();
          return;
        }
      }
      if (supplierId && typeof startDirectRequest === "function") {
        startDirectRequest(text, supplierId);
      } else if (typeof goToChatWith === "function") {
        goToChatWith(text);
      }
    });
  });
  catalogProducts.querySelectorAll(".product-supplier-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sid = btn.dataset.supplier;
      if (sid && typeof openSupplierProfile === "function") {
        openSupplierProfile(sid, "catalog");
      }
    });
  });
  if (typeof bindFavButtons === "function") bindFavButtons(catalogProducts);
}

catalogFilters?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (currentCategory && currentSubcategory) {
    openProducts(currentCategory, currentSubcategory);
  }
});

document.getElementById("catalog-filter-reset")?.addEventListener("click", () => {
  catalogFilters?.reset();
  if (currentCategory && currentSubcategory) {
    openProducts(currentCategory, currentSubcategory);
  }
});

async function loadCatalog() {
  const res = await fetch("/api/catalog");
  const data = await res.json();
  if (!res.ok || !data.ok) return;
  catalogData = data.categories || [];
  openCategories();
}

window.loadCatalog = loadCatalog;

navHome?.addEventListener("click", (e) => {
  e.preventDefault();
  showView("home");
});

navCatalog?.addEventListener("click", (e) => {
  e.preventDefault();
  showCatalogView();
});

// Hook catalog load into shared showView
const _prevShowView = window.showView;
window.showView = function (view) {
  if (typeof _prevShowView === "function") _prevShowView(view);
  if (view === "catalog" && !catalogData.length) loadCatalog();
};
