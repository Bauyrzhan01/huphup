import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi, productsApi } from '../../api';
import { resolveMediaUrl } from '../../api/client';
import { ProductImagesEditor } from '../../components/ProductImagesEditor';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { Product } from '../../types';

const emptyForm = {
  name: '',
  description: '',
  unit: '',
  priceFrom: '',
  city: '',
};

export function SupplierProductsPage() {
  const { t } = useTranslation();
  const { formatMoney } = useAppLocale();
  const [products, setProducts] = useState<Product[]>([]);
  const [hasCompany, setHasCompany] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      await companiesApi.me();
      setHasCompany(true);
      const list = await productsApi.mine();
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
      priceFrom: product.priceFrom != null ? String(product.priceFrom) : '',
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
      priceFrom: form.priceFrom ? Number(form.priceFrom) : undefined,
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
          priceFrom: created.priceFrom != null ? String(created.priceFrom) : '',
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

  return (
    <SupplierLayout
      crumb={t('products.crumb')}
      actions={
        selectedId ? (
          <button type="button" className="ghost" onClick={resetForm}>
            {t('products.addNew')}
          </button>
        ) : null
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
              <p className="notice" style={{ color: '#b45309', marginBottom: 14 }}>
                {error}
              </p>
            ) : null}
            {msg ? (
              <p className="notice" style={{ marginBottom: 14 }}>
                {msg}
              </p>
            ) : null}

            <div className="detail-grid">
              <div className="card request-list">
                {products.length === 0 && !loading ? (
                  <div className="request-item">
                    <div className="request-title">{t('products.empty')}</div>
                    <div className="meta">{t('products.emptyHint')}</div>
                  </div>
                ) : (
                  products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="request-item product-list-item"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: selectedId === product.id ? '#fafafa' : '#fff',
                        opacity: product.isActive ? 1 : 0.65,
                      }}
                      onClick={() => startEdit(product)}
                    >
                      {product.images?.[0] ? (
                        <img
                          className="product-list-thumb"
                          src={resolveMediaUrl(product.images[0].url)}
                          alt=""
                        />
                      ) : (
                        <div className="product-list-thumb product-list-thumb-empty">
                          {product.name.slice(0, 1)}
                        </div>
                      )}
                      <div>
                        <div className="request-title">{product.name}</div>
                        <div className="meta">
                          {product.priceFrom != null
                            ? `${formatMoney(product.priceFrom)}${product.unit ? ` / ${product.unit}` : ''}`
                            : t('products.priceOnRequest')}
                          {product.city ? ` · ${product.city}` : ''}
                        </div>
                      </div>
                      <span className={`badge ${product.isActive ? 'green' : 'blue'}`}>
                        {product.isActive ? t('products.active') : t('products.hidden')}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div className="panel">
                <h3 className="section-title">
                  {selectedId ? t('products.editTitle') : t('products.addTitle')}
                </h3>
                <form onSubmit={onSubmit}>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
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
                      <label>{t('products.priceFrom')}</label>
                      <input
                        value={form.priceFrom}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, priceFrom: e.target.value }))
                        }
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="850"
                      />
                    </div>
                    <div className="field">
                      <label>{t('products.city')}</label>
                      <input
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                        placeholder="Алматы"
                      />
                    </div>
                    {selectedId ? (
                      <ProductImagesEditor
                        productId={selectedId}
                        images={products.find((p) => p.id === selectedId)?.images ?? []}
                        onChange={() => void load()}
                      />
                    ) : (
                      <p className="meta">{t('products.imagesAfterSave')}</p>
                    )}
                  </div>
                  <div className="actions">
                    {selectedId ? (
                      <>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const p = products.find((x) => x.id === selectedId);
                            if (p) void toggleActive(p);
                          }}
                        >
                          {products.find((x) => x.id === selectedId)?.isActive
                            ? t('products.hide')
                            : t('products.show')}
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
              </div>
            </div>
          </>
        )}
      </div>
    </SupplierLayout>
  );
}
