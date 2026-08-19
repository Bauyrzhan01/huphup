import { Star } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { productsApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useAppLocale } from '../i18n/useAppLocale';
import type { ProductReview } from '../types';
import { AppIcon } from './AppIcon';

export function ProductStars({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={`product-stars product-stars-${size}`} aria-label={`${value}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? 'is-on' : ''}>
          <AppIcon icon={Star} size={size === 'sm' ? 14 : 16} fill={n <= rounded ? 'currentColor' : 'none'} />
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
          <AppIcon icon={Star} size={20} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </span>
  );
}

export function ProductReviews({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    void productsApi
      .reviews(productId)
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [productId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const created = await productsApi.addReview(productId, {
        rating,
        comment: comment.trim() || undefined,
      });
      setReviews((prev) => {
        const rest = prev.filter((r) => r.userId !== created.userId);
        return [created, ...rest];
      });
      setComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel product-page-reviews">
      <h2 className="section-title">{t('products.reviewsSection')}</h2>
      {loading ? (
        <p className="meta">{t('common.loading')}</p>
      ) : reviews.length === 0 ? (
        <p className="meta">{t('products.noReviewsYet')}</p>
      ) : (
        <ul className="product-reviews-list">
          {reviews.map((r) => (
            <li key={r.id}>
              <div className="product-review-head">
                <b>{r.user.fullName}</b>
                <ProductStars value={r.rating} size="sm" />
                <small>{formatDateTime(r.createdAt)}</small>
              </div>
              {r.comment ? <p>{r.comment}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {user?.role === 'BUYER' || user?.role === 'ADMIN' ? (
        <form className="product-review-form" onSubmit={onSubmit}>
          <label>{t('products.yourRating')}</label>
          <StarPicker value={rating} onChange={setRating} />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('products.reviewPlaceholder')}
            rows={3}
          />
          {error ? (
            <p className="notice" style={{ color: '#b45309' }}>
              {error}
            </p>
          ) : null}
          <button type="submit" className="primary" disabled={saving}>
            {saving ? t('common.loading') : t('products.submitReview')}
          </button>
        </form>
      ) : (
        <p className="meta">{t('products.reviewBuyerOnly')}</p>
      )}
    </section>
  );
}
