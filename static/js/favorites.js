/* Buyer favorites — products + suppliers */

const viewFavorites = document.getElementById("view-favorites");
const favProductsBox = document.getElementById("fav-products");
const favSuppliersBox = document.getElementById("fav-suppliers");
const favProductsEmpty = document.getElementById("fav-products-empty");
const favSuppliersEmpty = document.getElementById("fav-suppliers-empty");
const navFavorites = document.getElementById("nav-favorites");

const favState = {
  productIds: new Set(),
  supplierIds: new Set(),
  products: [],
  suppliers: [],
  loaded: false,
};

function favEscape(value) {
  return window.tbEscapeHtml(value);
}

function isFavorited(type, id) {
  if (!id) return false;
  return type === "product"
    ? favState.productIds.has(id)
    : favState.supplierIds.has(id);
}

function favHeartHtml(type, id) {
  const on = isFavorited(type, id);
  return `
    <button type="button"
      class="fav-btn${on ? " is-on" : ""}"
      data-fav-type="${favEscape(type)}"
      data-fav-id="${favEscape(id)}"
      aria-label="${on ? t("js.fav_remove") : t("js.fav_add")}"
      title="${on ? t("js.fav_remove") : t("js.fav_add")}">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 20s-7-4.35-7-9.2A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7 3.7C19 15.65 12 20 12 20z"
          fill="${on ? "currentColor" : "none"}"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linejoin="round"/>
      </svg>
    </button>`;
}

function applyFavState(data) {
  favState.productIds = new Set(data.product_ids || []);
  favState.supplierIds = new Set(data.supplier_ids || []);
  favState.products = data.products || [];
  favState.suppliers = data.suppliers || [];
  favState.loaded = true;
}

async function loadFavorites() {
  const res = await fetch("/api/favorites");
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return favState;
  applyFavState(data);
  return favState;
}

async function toggleFavorite(type, id) {
  const on = isFavorited(type, id);
  const res = await fetch("/api/favorites", {
    method: on ? "DELETE" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    alert(data.error || t("js.err_fav"));
    return null;
  }
  applyFavState(data);
  document.querySelectorAll(`[data-fav-type="${type}"]`).forEach((btn) => {
    if (btn.dataset.favId !== id) return;
    const nowOn = isFavorited(type, id);
    btn.classList.toggle("is-on", nowOn);
    btn.setAttribute("aria-label", nowOn ? t("js.fav_remove") : t("js.fav_add"));
    btn.title = nowOn ? t("js.fav_remove") : t("js.fav_add");
    const path = btn.querySelector("path");
    if (path) path.setAttribute("fill", nowOn ? "currentColor" : "none");
  });
  if (!viewFavorites?.hidden) renderFavoritesView();
  return data;
}

function bindFavButtons(root) {
  (root || document).querySelectorAll(".fav-btn").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const type = btn.dataset.favType;
      const id = btn.dataset.favId;
      if (type && id) toggleFavorite(type, id);
    });
  });
}

function goToChatWith(text) {
  showView("home");
  const input = document.getElementById("search-input");
  if (input) {
    input.value = text;
    input.focus();
  }
}

function renderFavoritesView() {
  if (!favProductsBox || !favSuppliersBox) return;

  const products = favState.products || [];
  const suppliers = favState.suppliers || [];

  if (!products.length) {
    favProductsBox.innerHTML = "";
    if (favProductsEmpty) favProductsEmpty.hidden = false;
  } else {
    if (favProductsEmpty) favProductsEmpty.hidden = true;
    favProductsBox.innerHTML = products
      .map((p) => {
        const unit = p.unit ? favEscape(p.unit) : t("js.on_request");
        return `
        <article class="product-card">
          <div class="product-card-top">
            <span class="product-sub">${favEscape(p.subcategory || p.category || "")}</span>
            <div class="product-card-actions">
              <strong class="product-price">${unit}</strong>
              ${favHeartHtml("product", p.id)}
            </div>
          </div>
          <h3>${favEscape(p.name)}</h3>
          <p>${favEscape(p.description || "")}</p>
          <div class="product-card-foot">
            <span>${favEscape(p.supplier_name || t("js.supplier"))}</span>
            <button type="button" class="btn btn--solid btn--sm btn-order" data-name="${favEscape(p.name)}">${t("js.request_price")}</button>
          </div>
        </article>`;
      })
      .join("");
    favProductsBox.querySelectorAll(".btn-order").forEach((btn) => {
      btn.addEventListener("click", () => goToChatWith(t("js.need_prefix", { name: btn.dataset.name })));
    });
    bindFavButtons(favProductsBox);
  }

  if (!suppliers.length) {
    favSuppliersBox.innerHTML = "";
    if (favSuppliersEmpty) favSuppliersEmpty.hidden = false;
  } else {
    if (favSuppliersEmpty) favSuppliersEmpty.hidden = true;
    favSuppliersBox.innerHTML = suppliers
      .map((s) => {
        const city = s.city ? ` · ${favEscape(s.city)}` : "";
        const rating =
          s.rating_count > 0 && s.rating_avg != null
            ? `<span class="rating-badge"><strong>${Number(s.rating_avg).toFixed(1)}</strong> · ${s.rating_count}</span>`
            : "";
        return `
        <article class="supplier-card fav-supplier-card" data-open-supplier="${favEscape(s.id)}">
          <div class="fav-supplier-top">
            <h3 class="supplier-open-link">${favEscape(s.company_name || t("js.no_name"))}</h3>
            ${favHeartHtml("supplier", s.id)}
          </div>
          <div class="meta">${favEscape(s.category || "")}${city} ${rating}</div>
          <p>${favEscape(s.description || t("js.no_desc"))}</p>
          <div class="product-card-foot">
            <span>${favEscape(s.phone || "")}</span>
            <button type="button" class="btn btn--solid btn--sm btn-open-supplier"
              data-id="${favEscape(s.id)}">${t("js.profile")}</button>
          </div>
        </article>`;
      })
      .join("");
    favSuppliersBox.querySelectorAll(".btn-open-supplier, .supplier-open-link").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id =
          el.dataset.id ||
          el.closest("[data-open-supplier]")?.dataset.openSupplier;
        if (id && typeof openSupplierProfile === "function") {
          openSupplierProfile(id, "favorites");
        }
      });
    });
    bindFavButtons(favSuppliersBox);
  }
}

function setActiveNav(view) {
  document.querySelectorAll(".sidebar__link[data-view]").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.view === view);
  });
}

function showView(view) {
  const home = document.getElementById("view-home");
  const favorites = document.getElementById("view-favorites");
  const supplier = document.getElementById("view-supplier");
  const history = document.getElementById("view-history");
  const profile = document.getElementById("view-profile");
  if (home) home.hidden = view !== "home";
  if (favorites) favorites.hidden = view !== "favorites";
  if (supplier) supplier.hidden = view !== "supplier";
  if (history) history.hidden = view !== "history";
  if (profile) profile.hidden = view !== "profile";
  setActiveNav(view === "supplier" ? "" : view);
  document
    .querySelector(".main")
    ?.classList.toggle(
      "catalog-mode",
      view === "favorites" ||
        view === "supplier" ||
        view === "history" ||
        view === "profile"
    );
  if (view === "favorites") {
    loadFavorites().then(() => renderFavoritesView());
  }
  if (view === "profile" && typeof loadBuyerProfile === "function") {
    loadBuyerProfile(false);
  }
}

navFavorites?.addEventListener("click", (e) => {
  e.preventDefault();
  showView("favorites");
});

document.getElementById("nav-profile")?.addEventListener("click", (e) => {
  e.preventDefault();
  showView("profile");
});

document.getElementById("open-profile")?.addEventListener("click", () => {
  showView("profile");
});

if (location.hash === "#profile") {
  showView("profile");
}

// Preload ids so hearts render correctly in catalog / suppliers
loadFavorites();

window.favState = favState;
window.isFavorited = isFavorited;
window.favHeartHtml = favHeartHtml;
window.toggleFavorite = toggleFavorite;
window.bindFavButtons = bindFavButtons;
window.loadFavorites = loadFavorites;
window.renderFavoritesView = renderFavoritesView;
window.showView = showView;
window.setActiveNav = setActiveNav;
window.goToChatWith = goToChatWith;
