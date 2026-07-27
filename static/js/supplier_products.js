/* Supplier product CRUD — pick from catalog templates only */

const PRODUCT_PLACEHOLDER = "/static/img/catalog-placeholder.svg";
const MAX_PRODUCT_IMAGES = 8;

function escapeHtml(value) {
  return window.tbEscapeHtml(value);
}

let PRODUCT_TEMPLATES = Array.isArray(window.PRODUCT_TEMPLATES) ? window.PRODUCT_TEMPLATES : [];
let pendingProductImages = [];

function productImageList(item) {
  if (!item) return [];
  const urls = Array.isArray(item.image_urls) ? item.image_urls : [];
  const cleaned = urls.map((u) => String(u || "").trim()).filter(Boolean);
  if (cleaned.length) return cleaned.slice(0, MAX_PRODUCT_IMAGES);
  const single = String(item.image_url || "").trim();
  if (single && single !== PRODUCT_PLACEHOLDER) return [single];
  return [];
}

function productImageSrc(item) {
  const urls = productImageList(item);
  return urls[0] || PRODUCT_PLACEHOLDER;
}

function renderProductPhotoGallery() {
  const box = document.getElementById("product-photo-gallery");
  if (!box) return;
  const urls = pendingProductImages.filter(Boolean);
  if (!urls.length) {
    box.innerHTML = `<span class="product-photo-empty">${t("js.product_photo_empty")}</span>`;
    return;
  }
  box.innerHTML = urls
    .map(
      (url, index) => `
      <div class="product-photo-thumb">
        <img src="${escapeHtml(url)}" alt="" />
        <button type="button" class="product-photo-thumb__remove" data-index="${index}" aria-label="${t("js.delete")}">×</button>
      </div>`
    )
    .join("");
  box.querySelectorAll(".product-photo-thumb__remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.index);
      if (Number.isNaN(i)) return;
      pendingProductImages.splice(i, 1);
      renderProductPhotoGallery();
    });
  });
  box.querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", () => {
      img.src = PRODUCT_PLACEHOLDER;
    });
  });
}

function setProductPhotos(urls) {
  const list = (Array.isArray(urls) ? urls : [])
    .map((u) => String(u || "").trim())
    .filter((u) => u && u !== PRODUCT_PLACEHOLDER);
  pendingProductImages = [...new Set(list)].slice(0, MAX_PRODUCT_IMAGES);
  renderProductPhotoGallery();
}

async function uploadProductPhoto(file) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/my/products/image", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || !data.url) {
    throw new Error(data.error || t("js.err_product_photo"));
  }
  return data.url;
}

document.getElementById("product-photo-input")?.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  showProductError("");
  for (const file of files) {
    if (pendingProductImages.length >= MAX_PRODUCT_IMAGES) {
      showProductError(t("js.product_photo_max"));
      break;
    }
    if (file.size > 5 * 1024 * 1024) {
      showProductError(t("js.file_too_large"));
      continue;
    }
    try {
      const url = await uploadProductPhoto(file);
      if (!pendingProductImages.includes(url)) {
        pendingProductImages.push(url);
      }
      renderProductPhotoGallery();
    } catch (err) {
      showProductError(err.message || t("js.err_product_photo"));
      break;
    }
  }
  e.target.value = "";
});

document.getElementById("product-photo-clear")?.addEventListener("click", () => {
  const input = document.getElementById("product-photo-input");
  if (input) input.value = "";
  setProductPhotos([]);
});

async function ensureCatalogLoaded() {
  if (CATALOG_CATEGORIES.length && PRODUCT_TEMPLATES.length) {
    return { categories: CATALOG_CATEGORIES, templates: PRODUCT_TEMPLATES };
  }
  try {
    const res = await fetch("/api/catalog");
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      if (Array.isArray(data.categories)) {
        CATALOG_CATEGORIES = data.categories;
        window.CATALOG_CATEGORIES = CATALOG_CATEGORIES;
      }
      if (Array.isArray(data.templates)) {
        PRODUCT_TEMPLATES = data.templates;
        window.PRODUCT_TEMPLATES = PRODUCT_TEMPLATES;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return { categories: CATALOG_CATEGORIES, templates: PRODUCT_TEMPLATES };
}

function allowedCategoryNames() {
  const names = [];
  const seen = new Set();
  const push = (name) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };
  // Все категории каталога — можно добавлять товары из нескольких направлений
  CATEGORY_OPTIONS.forEach(push);
  CATALOG_CATEGORIES.forEach((c) => push(c && c.name));
  // Плюс уже выбранные в профиле (на случай старых имён)
  if (Array.isArray(window.SUPPLIER_CATEGORIES)) {
    window.SUPPLIER_CATEGORIES.forEach(push);
  }
  if (SUPPLIER_CATEGORY) push(SUPPLIER_CATEGORY);
  return names;
}

function fillCategories(selected) {
  if (!productCategory) return;
  const preferred = selected || SUPPLIER_CATEGORY;
  const names = allowedCategoryNames();
  productCategory.innerHTML = `<option value="">${t("js.choose_category")}</option>`;
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === preferred) opt.selected = true;
    productCategory.appendChild(opt);
  });
  if (!productCategory.value && preferred && names.includes(preferred)) {
    productCategory.value = preferred;
  }
  fillSubcategories(productCategory.value || "", null);
}

function fillSubcategories(categoryName, selectedId) {
  if (!productSubcategory) return;
  productSubcategory.innerHTML = "";
  const cat = CATALOG_CATEGORIES.find((c) => c.name === categoryName);
  const subs = (cat && cat.subcategories) || [];
  if (!categoryName) {
    productSubcategory.innerHTML = `<option value="">${t("js.choose_cat_first")}</option>`;
    fillTemplates("", "", null);
    return;
  }
  if (!subs.length) {
    productSubcategory.innerHTML = `<option value="general" selected>${t("js.general")}</option>`;
    fillTemplates(categoryName, "general", null);
    return;
  }
  productSubcategory.innerHTML = `<option value="">${t("js.choose_subcategory")}</option>`;
  subs.forEach((sub) => {
    const opt = document.createElement("option");
    opt.value = sub.id;
    opt.textContent = sub.name;
    if (sub.id === selectedId || sub.name === selectedId) opt.selected = true;
    productSubcategory.appendChild(opt);
  });
  if (!productSubcategory.value && subs[0]) productSubcategory.value = subs[0].id;
  fillTemplates(categoryName, productSubcategory.value, null);
}

function fillTemplates(categoryName, subcategoryId, selectedTemplateId) {
  const sel = document.getElementById("product-template");
  if (!sel) return;
  const list = (PRODUCT_TEMPLATES || []).filter((tpl) => {
    if (categoryName && tpl.category !== categoryName) return false;
    if (subcategoryId && tpl.subcategory_id !== subcategoryId) return false;
    return true;
  });
  sel.innerHTML = `<option value="">${t("js.choose_product")}</option>`;
  list.forEach((tpl) => {
    const opt = document.createElement("option");
    opt.value = tpl.id;
    opt.textContent = tpl.name;
    if (tpl.id === selectedTemplateId) opt.selected = true;
    sel.appendChild(opt);
  });
  if (!sel.value && selectedTemplateId) {
    // editing legacy product without template — show name as disabled option
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = selectedTemplateId;
    opt.disabled = true;
    sel.appendChild(opt);
  }
  applyTemplatePreview(sel.value);
}

function applyTemplatePreview(templateId) {
  const tpl = (PRODUCT_TEMPLATES || []).find((x) => x.id === templateId);
  const unitEl = document.getElementById("product-unit");
  const descEl = document.getElementById("product-description");
  if (unitEl) unitEl.value = tpl?.unit || "";
  if (descEl) descEl.value = tpl?.description || "";
  // Don't overwrite photos the supplier already picked in this form session
  if (!pendingProductImages.length && !editingProductId) {
    setProductPhotos(productImageList(tpl));
  }
}

productCategory?.addEventListener("change", () => {
  fillSubcategories(productCategory.value, null);
});

productSubcategory?.addEventListener("change", () => {
  fillTemplates(productCategory?.value || "", productSubcategory.value, null);
});

document.getElementById("product-template")?.addEventListener("change", (e) => {
  pendingProductImages = [];
  applyTemplatePreview(e.target.value);
});

function showProductError(msg) {
  const el = document.getElementById("product-error");
  const ok = document.getElementById("product-success");
  if (ok) ok.hidden = true;
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}

function showProductSuccess(msg) {
  const el = document.getElementById("product-success");
  const err = document.getElementById("product-error");
  if (err) err.hidden = true;
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}

async function openProductForm(product = null) {
  await ensureCatalogLoaded();
  if (!productForm) return;
  productForm.hidden = false;
  editingProductId = product?.id || null;
  const isEdit = Boolean(product);
  document.getElementById("product-form-title").textContent = isEdit
    ? t("js.edit_product")
    : t("js.new_product");
  document.getElementById("product-save-btn").textContent = isEdit
    ? t("js.save_changes")
    : t("js.add_product_btn");
  document.getElementById("product-id").value = product?.id || "";
  const stockEl = document.getElementById("product-stock");
  if (stockEl) stockEl.value = product?.stock_status || "in_stock";
  const photoInput = document.getElementById("product-photo-input");
  if (photoInput) photoInput.value = "";
  setProductPhotos(productImageList(product));

  const catSel = document.getElementById("product-category");
  const subSel = document.getElementById("product-subcategory");
  const tplSel = document.getElementById("product-template");
  if (isEdit) {
    // При редактировании меняем только статус и фото
    if (catSel) {
      catSel.disabled = true;
      fillCategories(product.category);
      catSel.value = product.category || "";
    }
    if (subSel) {
      subSel.disabled = true;
      fillSubcategories(product.category || "", product.subcategory_id || product.subcategory);
    }
    if (tplSel) {
      tplSel.disabled = true;
      fillTemplates(
        product.category || "",
        product.subcategory_id || "",
        product.template_id || null
      );
      if (product.template_id) tplSel.value = product.template_id;
      else {
        tplSel.innerHTML = `<option value="">${escapeHtml(product.name || "")}</option>`;
      }
      const unitEl = document.getElementById("product-unit");
      const descEl = document.getElementById("product-description");
      if (unitEl) unitEl.value = product.unit || "";
      if (descEl) descEl.value = product.description || "";
    }
    setProductPhotos(productImageList(product));
  } else {
    if (catSel) catSel.disabled = false;
    if (subSel) subSel.disabled = false;
    if (tplSel) tplSel.disabled = false;
    fillCategories(SUPPLIER_CATEGORY);
  }

  showProductError("");
  showProductSuccess("");
  productForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeProductForm() {
  if (!productForm) return;
  productForm.hidden = true;
  editingProductId = null;
  productForm.reset();
  pendingProductImages = [];
  setProductPhotos([]);
  const photoInput = document.getElementById("product-photo-input");
  if (photoInput) photoInput.value = "";
  ["product-category", "product-subcategory", "product-template"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
  showProductError("");
  showProductSuccess("");
}

document.getElementById("btn-new-product")?.addEventListener("click", () => openProductForm());
document.getElementById("product-cancel-btn")?.addEventListener("click", () => closeProductForm());

productForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showProductError("");
  const isEdit = Boolean(editingProductId);
  const payload = {
    stock_status: document.getElementById("product-stock")?.value || "in_stock",
    image_urls: pendingProductImages.slice(0, MAX_PRODUCT_IMAGES),
  };
  if (!isEdit) {
    payload.template_id = document.getElementById("product-template")?.value || "";
    if (!payload.template_id) return showProductError(t("js.err_choose_product"));
  }

  const url = isEdit ? `/api/my/products/${editingProductId}` : "/api/my/products";
  const method = isEdit ? "PUT" : "POST";
  let res;
  let data = {};
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    showProductError("Нет связи с сервером. Перезапустите python app.py");
    return;
  }
  if (!res.ok || !data.ok) {
    const detail =
      data.error ||
      (res.status === 404
        ? "API не найден — перезапустите сервер (python app.py)"
        : res.status >= 500
          ? "Ошибка сервера при сохранении"
          : "Не удалось сохранить");
    showProductError(detail);
    return;
  }
  showProductSuccess(data.message || t("js.saved"));
  if (Array.isArray(data.categories) && data.categories.length) {
    window.SUPPLIER_CATEGORIES = data.categories;
    if (data.categories[0]) window.SUPPLIER_CATEGORY = data.categories[0];
  }
  editingProductId = null;
  productForm.hidden = true;
  productForm.reset();
  pendingProductImages = [];
  setProductPhotos([]);
  loadProducts();
});

function renderProducts(items) {
  if (!productsBox) return;
  if (!items.length) {
    productsBox.classList.remove("product-manage-grid");
    productsBox.innerHTML = `<p class="shell-side-empty">${t("js.no_products_hint")}</p>`;
    return;
  }
  productsBox.classList.add("product-manage-grid");
  productsBox.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "product-manage-card";
    const img = escapeHtml(productImageSrc(item));
    const photoCount = productImageList(item).length;
    const stock =
      item.stock_label ||
      (item.stock_status === "on_order"
        ? typeof t === "function"
          ? t("js.on_order")
          : "Под заказ"
        : typeof t === "function"
          ? t("js.in_stock")
          : "В наличии");
    card.innerHTML = `
      <div class="product-manage-card__media-wrap">
        <img class="product-manage-card__media" src="${img}" alt="" loading="lazy" />
        ${photoCount > 1 ? `<span class="product-manage-card__count">${photoCount}</span>` : ""}
      </div>
      <div class="product-manage-card__body">
        <div class="product-manage-top">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <div class="product-manage-meta">
              ${escapeHtml(item.category || "")}
              ${item.subcategory ? " · " + escapeHtml(item.subcategory) : ""}
              · ${escapeHtml(stock)}
            </div>
          </div>
          <div class="product-manage-price"><span>${escapeHtml(item.unit || "шт")}</span></div>
        </div>
        <p>${escapeHtml(item.description || t("js.no_desc_short"))}</p>
        <div class="product-manage-actions">
          <button type="button" class="btn btn--ghost btn--sm btn-edit-product" data-id="${escapeHtml(item.id)}">${t("js.edit")}</button>
          <button type="button" class="btn btn--ghost btn--sm btn-del-product" data-id="${escapeHtml(item.id)}">${t("js.delete")}</button>
        </div>
      </div>
    `;
    const media = card.querySelector(".product-manage-card__media");
    if (media) {
      media.addEventListener("error", () => {
        media.src = PRODUCT_PLACEHOLDER;
      });
    }
    // Click cover to cycle through photos when multiple
    if (photoCount > 1 && media) {
      const urls = productImageList(item);
      let idx = 0;
      media.style.cursor = "pointer";
      media.title = `${photoCount}`;
      media.addEventListener("click", () => {
        idx = (idx + 1) % urls.length;
        media.src = urls[idx] || PRODUCT_PLACEHOLDER;
      });
    }
    productsBox.appendChild(card);
  });

  const map = Object.fromEntries(items.map((i) => [i.id, i]));
  productsBox.querySelectorAll(".btn-edit-product").forEach((btn) => {
    btn.addEventListener("click", () => openProductForm(map[btn.dataset.id]));
  });
  productsBox.querySelectorAll(".btn-del-product").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(t("js.confirm_delete_product"))) return;
      const res = await fetch(`/api/my/products/${btn.dataset.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error || t("js.err_delete"));
        return;
      }
      loadProducts();
    });
  });
}

async function loadProducts() {
  if (!productsBox) return;
  await ensureCatalogLoaded();
  const res = await fetch("/api/my/products");
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    productsBox.classList.remove("product-manage-grid");
    productsBox.innerHTML = `<p class="shell-side-empty">${t("js.err_load_products")}</p>`;
    return;
  }
  if (Array.isArray(data.templates) && data.templates.length) {
    PRODUCT_TEMPLATES = data.templates;
    window.PRODUCT_TEMPLATES = PRODUCT_TEMPLATES;
  }
  renderProducts(data.items || []);
}

/* ---------- Boot ---------- */
const initial = (location.hash || "").replace("#", "");
if (
  initial === "products" ||
  initial === "profile" ||
  initial === "history" ||
  initial === "analytics" ||
  initial === "team" ||
  initial === "oversee"
) {
  showTab(initial);
} else {
  showTab("requests");
}

Promise.resolve(loadRequests()).finally(() => window.tbHidePageLoader?.());
setInterval(() => {
  const active = document.querySelector(".dash-tab.is-active")?.dataset.tab;
  if (active === "requests") loadRequests();
  if (active === "oversee") loadOversee(false);
}, 15000);
