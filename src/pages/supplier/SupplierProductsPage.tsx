import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi, productsApi } from '../../api';
import { resolveMediaUrl } from '../../api/client';
import { ProductImagesEditor } from '../../components/ProductImagesEditor';
import { SupplierProductCard } from '../../components/SupplierProductCard';
import { SupplierLayout } from '../../layouts/AppLayouts';
import type { Product } from '../../types';

const emptyForm = {
  name: '',
  description: '',
  unit: '',
  city: '',
};

export function SupplierProductsPage() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [hasCompany, setHasCompany] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedId) ?? null,
    [products, selectedId],
  );

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [, list] = await Promise.all([
        companiesApi.me().catch(() => {
          throw new Error('no-company');
        }),
        productsApi.mine(),
      ]);
      setHasCompany(true);
      setProducts(list);
    } catch {
      setHasCompany(false);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setSelectedId(null);
    setForm(emptyForm);
    setMsg('');
    setError('');
  }

  function startEdit(product: Product) {
    setSelectedId(product.id);
    setForm({
      name: product.name,
      description: product.description ?? '',
      unit: product.unit ?? '',
      city: product.city ?? '',
    });
    setMsg('');
    setError('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      unit: form.unit.trim() || undefined,
      city: form.city.trim() || undefined,
    };
    try {
      if (selectedId) {
        await productsApi.update(selectedId, payload);
        setMsg(t('products.updated'));
        await load();
      } else {
        const created = await productsApi.create(payload);
        setSelectedId(created.id);
        setForm({
          name: created.name,
          description: created.description ?? '',
          unit: created.unit ?? '',
          city: created.city ?? '',
        });
        setMsg(t('products.created'));
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    setError('');
    try {
      await productsApi.update(product.id, { isActive: !product.isActive });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function removeProduct(id: string) {
    if (!window.confirm(t('products.deleteConfirm'))) return;
    setError('');
    try {
      await productsApi.remove(id);
      if (selectedId === id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const cover = selectedProduct?.images?.[0];

  return (
    <SupplierLayout
      crumb={t('products.crumb')}
      actions={
        <button type="button" className="primary" onClick={resetForm}>
          {t('products.addNew')}
        </button>
      }
    >
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t('products.title')}</h1>
            <p>
              {loading
                ? t('common.loadingFromDb')
                : t('products.subtitle', { count: products.length })}
            </p>
          </div>
        </div>

        {!hasCompany && !loading ? (
          <div className="notice">
            {t('products.noCompany')}{' '}
            <Link to="/supplier/company">{t('products.createCompany')}</Link>
          </div>
        ) : (
          <>
            {error ? (
              <p className="notice supplier-products-notice is-error">{error}</p>
            ) : null}
            {msg ? <p className="notice supplier-products-notice">{msg}</p> : null}

            <div className="supplier-products-layout">
              <section className="supplier-products-main">
                {loading ? (
                  <p className="assist-note">{t('common.loading')}</p>
                ) : products.length === 0 ? (
                  <div className="supplier-products-empty card">
                    <div className="supplier-products-empty-icon" aria-hidden>
                      📦
                    </div>
                    <b>{t('products.empty')}</b>
                    <p>{t('products.emptyHint')}</p>
                  </div>
                ) : (
                  <div className="supplier-products-grid">
                    {products.map((product) => (
                      <SupplierProductCard
                        key={product.id}
                        product={product}
                        selected={selectedId === product.id}
                        onSelect={() => startEdit(product)}
                      />
                    ))}
                  </div>
                )}
              </section>

              <aside className="panel supplier-products-form">
                {selectedProduct && cover ? (
                  <div className="supplier-product-form-cover">
                    <img src={resolveMediaUrl(cover.url)} alt={selectedProduct.name} />
                  </div>
                ) : null}
                <h3 className="section-title">
                  {selectedId ? t('products.editTitle') : t('products.addTitle')}
                </h3>
                {selectedProduct ? (
                  <p className="meta supplier-product-form-meta">
                    {[selectedProduct.unit, selectedProduct.city].filter(Boolean).join(' · ') ||
                      t('products.priceOnContact')}
                  </p>
                ) : null}
                <form onSubmit={onSubmit}>
                  <div className="form-grid supplier-product-fields">
                    <div className="field">
                      <label>{t('products.name')}</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder={t('products.namePlaceholder')}
                        required
                        minLength={2}
                      />
                    </div>
                    <div className="field">
                      <label>{t('products.description')}</label>
                      <textarea
                        value={form.description}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, description: e.target.value }))
                        }
                        placeholder={t('products.descriptionPlaceholder')}
                      />
                    </div>
                    <div className="field-row">
                      <div className="field">
                        <label>{t('products.unit')}</label>
                        <input
                          value={form.unit}
                          onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                          placeholder={t('products.unitPlaceholder')}
                          list="product-units"
                        />
                        <datalist id="product-units">
                          <option value="шт" />
                          <option value="м²" />
                          <option value="м" />
                          <option value="кг" />
                          <option value="т" />
                          <option value="компл." />
                        </datalist>
                      </div>
                      <div className="field">
                        <label>{t('products.city')}</label>
                        <input
                          value={form.city}
                          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                          placeholder="Алматы"
                        />
                      </div>
                    </div>
                    <p className="meta supplier-product-price-note">{t('products.priceOnContact')}</p>
                    {selectedId ? (
                      <ProductImagesEditor
                        productId={selectedId}
                        images={selectedProduct?.images ?? []}
                        onChange={() => void load()}
                      />
                    ) : (
                      <div className="supplier-product-photo-hint">
                        <span aria-hidden>🖼</span>
                        <p>{t('products.imagesAfterSave')}</p>
                      </div>
                    )}
                  </div>
                  <div className="actions supplier-product-actions">
                    {selectedId ? (
                      <>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            if (selectedProduct) void toggleActive(selectedProduct);
                          }}
                        >
                          {selectedProduct?.isActive ? t('products.hide') : t('products.show')}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void removeProduct(selectedId)}
                        >
                          {t('products.delete')}
                        </button>
                      </>
                    ) : null}
                    <button type="submit" className="primary" disabled={saving}>
                      {saving
                        ? t('common.loading')
                        : selectedId
                          ? t('common.save')
                          : t('products.addBtn')}
                    </button>
                  </div>
                </form>
              </aside>
            </div>
          </>
        )}
      </div>
    </SupplierLayout>
  );
}
