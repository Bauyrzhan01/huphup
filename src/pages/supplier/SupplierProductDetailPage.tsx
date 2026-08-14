import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi, productsApi } from '../../api';
import { resolveMediaUrl } from '../../api/client';
import { ProductImagesEditor } from '../../components/ProductImagesEditor';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { Product, ProductReview } from '../../types';

const emptyForm = {
  name: '',
  description: '',
  unit: '',
  city: '',
};

export function SupplierProductDetailPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [activeImage, setActiveImage] = useState(0);

  async function loadProduct(productId: string) {
    const [item, list] = await Promise.all([
      productsApi.get(productId),
      productsApi.reviews(productId).catch(() => [] as ProductReview[]),
    ]);
    setProduct(item);
    setReviews(list);
    setForm({
      name: item.name,
      description: item.description ?? '',
      unit: item.unit ?? '',
      city: item.city ?? '',
    });
    setActiveImage(0);
  }

  useEffect(() => {
    if (isNew) {
      void companiesApi.me().catch(() => {
        setError(t('products.noCompany'));
      });
      return;
    }
    if (!id) return;

    setLoading(true);
    setError('');
    void loadProduct(id)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [id, isNew, t]);

  async function refresh() {
    if (!product?.id) return;
    await loadProduct(product.id);
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
      if (isNew) {
        const created = await productsApi.create(payload);
        setMsg(t('products.created'));
        navigate(`/supplier/products/${created.id}`, { replace: true });
        return;
      }
      if (!id) return;
      const updated = await productsApi.update(id, payload);
      setProduct(updated);
      setMsg(t('products.updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!product) return;
    setError('');
    try {
      const updated = await productsApi.update(product.id, { isActive: !product.isActive });
      setProduct(updated);
      setMsg(updated.isActive ? t('products.shown') : t('products.hiddenMsg'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function removeProduct() {
    if (!product || !window.confirm(t('products.deleteConfirm'))) return;
    setError('');
    try {
      await productsApi.remove(product.id);
      navigate('/supplier/products', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const images = product?.images ?? [];
  const cover = images[activeImage] ?? images[0];
  const title = isNew ? t('products.addTitle') : product?.name ?? t('common.loading');

  return (
    <SupplierLayout crumb={isNew ? t('products.addTitle') : t('products.detailCrumb')}>
      <div className="page product-detail-page">
        <Link className="product-detail-back" to="/supplier/products">
          ← {t('products.backToCatalog')}
        </Link>

        {error ? <p className="notice product-detail-notice is-error">{error}</p> : null}
        {msg ? <p className="notice product-detail-notice">{msg}</p> : null}

        {loading ? (
          <p className="assist-note">{t('common.loading')}</p>
        ) : (
          <div className="product-detail-shell">
            <div className="product-detail-top">
              <div className="product-detail-title-wrap">
                <h1>{title}</h1>
                {product ? (
                  <div className="product-detail-badges">
                    <span className={`badge ${product.isActive ? 'green' : 'amber'}`}>
                      {product.isActive ? t('products.active') : t('products.hidden')}
                    </span>
                    {product.avgRating != null && product.reviewCount ? (
                      <span className="badge">
                        ★ {product.avgRating.toFixed(1)} · {product.reviewCount}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {product ? (
                <div className="product-detail-top-actions">
                  <button type="button" className="ghost" onClick={() => void toggleActive()}>
                    {product.isActive ? t('products.hide') : t('products.show')}
                  </button>
                  <button type="button" className="ghost" onClick={() => void removeProduct()}>
                    {t('products.delete')}
                  </button>
                </div>
              ) : null}
            </div>

            <form className="product-detail-card" onSubmit={onSubmit}>
              <div className={`product-detail-body${isNew ? ' is-solo' : ''}`}>
                {!isNew && product ? (
                  <div className="product-detail-media">
                    {cover ? (
                      <div className="product-detail-cover">
                        <img src={resolveMediaUrl(cover.url)} alt={product.name} />
                      </div>
                    ) : (
                      <div className="product-detail-cover product-detail-cover-empty">
                        <span aria-hidden>📦</span>
                        <span>{t('products.noPhoto')}</span>
                      </div>
                    )}
                    {images.length > 1 ? (
                      <div className="product-detail-thumbs">
                        {images.map((img, index) => (
                          <button
                            key={img.id}
                            type="button"
                            className={`product-detail-thumb${index === activeImage ? ' is-active' : ''}`}
                            onClick={() => setActiveImage(index)}
                          >
                            <img src={resolveMediaUrl(img.url)} alt="" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="product-detail-fields">
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
                      rows={4}
                    />
                  </div>
                  <div className="product-detail-inline-fields">
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
                  <p className="meta product-detail-price-note">{t('products.priceOnContact')}</p>
                  {!isNew && product ? (
                    <ProductImagesEditor
                      productId={product.id}
                      images={product.images ?? []}
                      onChange={() => void refresh()}
                    />
                  ) : (
                    <div className="supplier-product-photo-hint">
                      <span aria-hidden>🖼</span>
                      <p>{t('products.imagesAfterSave')}</p>
                    </div>
                  )}
                </div>

                {!isNew && product ? (
                  <aside className="product-detail-aside">
                    <div className="product-detail-aside-block">
                      <h4>{t('products.infoSection')}</h4>
                      <div className="product-detail-kv">
                        <span>{t('products.statusLabel')}</span>
                        <b>{product.isActive ? t('products.active') : t('products.hidden')}</b>
                      </div>
                      <div className="product-detail-kv">
                        <span>{t('products.unit')}</span>
                        <b>{product.unit || t('common.empty')}</b>
                      </div>
                      <div className="product-detail-kv">
                        <span>{t('products.city')}</span>
                        <b>{product.city || t('common.empty')}</b>
                      </div>
                      <div className="product-detail-kv">
                        <span>{t('products.createdAt')}</span>
                        <b>{formatDateTime(product.createdAt)}</b>
                      </div>
                      <div className="product-detail-kv">
                        <span>{t('products.updatedAt')}</span>
                        <b>{formatDateTime(product.updatedAt)}</b>
                      </div>
                    </div>

                    <div className="product-detail-aside-block">
                      <h4>{t('products.reviewsSection')}</h4>
                      {reviews.length === 0 ? (
                        <p className="meta">{t('products.noReviews')}</p>
                      ) : (
                        <ul className="product-review-list">
                          {reviews.map((review) => (
                            <li key={review.id} className="product-review-item">
                              <div className="product-review-top">
                                <b>{review.user.fullName}</b>
                                <span>★ {review.rating}</span>
                              </div>
                              {review.comment ? <p>{review.comment}</p> : null}
                              <small>{formatDateTime(review.createdAt)}</small>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </aside>
                ) : null}
              </div>

              <div className="product-detail-footer">
                <button type="submit" className="primary" disabled={saving}>
                  {saving
                    ? t('common.loading')
                    : isNew
                      ? t('products.addBtn')
                      : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </SupplierLayout>
  );
}
