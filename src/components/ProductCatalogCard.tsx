import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { productsApi } from '../api';
import { ProductImageGallery } from './ProductImageGallery';
import { useAuth } from '../auth/AuthContext';
import { useAppLocale } from '../i18n/useAppLocale';
import type { PublicProduct, ProductReview } from '../types';

function Stars({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={`product-stars product-stars-${size}`} aria-label={`${value}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? 'is-on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="product-stars product-stars-pick">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? 'is-on' : ''}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

export function ProductCatalogCard({ product }: { product: PublicProduct }) {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoadingReviews(true);
    void productsApi
      .reviews(product.id)
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoadingReviews(false));
  }, [open, product.id]);

  async function onSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setReviewError('');
    try {
      const created = await productsApi.addReview(product.id, {
        rating,
        comment: comment.trim() || undefined,
      });
      setReviews((prev) => {
        const rest = prev.filter((r) => r.userId !== created.userId);
        return [created, ...rest];
      });
      setComment('');
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="supplier-card product-catalog-card">
      <ProductImageGallery images={product.images} alt={product.name} className="product-card-gallery" />
      <div className="product-card-body">
        <h3>{product.name}</h3>
        <p>{product.description || t('common.empty')}</p>
        <div className="meta">
          {[product.unit, product.city].filter(Boolean).join(' · ')}
        </div>
        <p className="meta product-price-contact">{t('products.priceOnContact')}</p>
        <div className="product-card-rating">
          {product.reviewCount && product.avgRating != null ? (
            <>
              <Stars value={product.avgRating} size="sm" />
              <span className="meta">
                {t('products.ratingSummary', {
                  rating: product.avgRating.toFixed(1),
                  count: product.reviewCount,
                })}
              </span>
            </>
          ) : (
            <span className="meta">{t('products.noReviews')}</span>
          )}
        </div>
        <button type="button" className="ghost product-reviews-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? t('products.hideReviews') : t('products.showReviews')}
        </button>
        {open ? (
          <div className="product-reviews-panel">
            {loadingReviews ? (
              <p className="meta">{t('common.loading')}</p>
            ) : reviews.length === 0 ? (
              <p className="meta">{t('products.noReviewsYet')}</p>
            ) : (
              <ul className="product-reviews-list">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <div className="product-review-head">
                      <b>{r.user.fullName}</b>
                      <Stars value={r.rating} size="sm" />
                      <small>{formatDateTime(r.createdAt)}</small>
                    </div>
                    {r.comment ? <p>{r.comment}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            {user?.role === 'BUYER' || user?.role === 'ADMIN' ? (
              <form className="product-review-form" onSubmit={onSubmitReview}>
                <label>{t('products.yourRating')}</label>
                <StarPicker value={rating} onChange={setRating} />
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t('products.reviewPlaceholder')}
                  rows={3}
                />
                {reviewError ? (
                  <p className="notice" style={{ color: '#b45309' }}>
                    {reviewError}
                  </p>
                ) : null}
                <button type="submit" className="primary" disabled={saving}>
                  {saving ? t('common.loading') : t('products.submitReview')}
                </button>
              </form>
            ) : (
              <p className="meta">{t('products.reviewBuyerOnly')}</p>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
