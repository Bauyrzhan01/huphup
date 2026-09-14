import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi } from '../api';
import { ProductImageGallery } from './ProductImageGallery';
import { RatingStar } from './RatingIcons';
import { UserAvatar } from './UserAvatar';
import type { PublicProduct } from '../types';
import { mapApiError } from '../utils/apiErrors';

type Props = {
  companyId: string;
  companyName: string;
  city?: string | null;
  avatarUrl?: string | null;
  score?: number;
  reason?: string | null;
  highlightProductId?: string | null;
};

export function MatchedSupplierCard({
  companyId,
  companyName,
  city,
  avatarUrl,
  score,
  reason,
  highlightProductId,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void companiesApi
      .products(companyId, { page: 1, limit: 12 })
      .then((res) => {
        if (cancelled) return;
        const items = [...res.items];
        if (highlightProductId) {
          items.sort((a, b) => {
            if (a.id === highlightProductId) return -1;
            if (b.id === highlightProductId) return 1;
            return 0;
          });
        }
        setProducts(items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(mapApiError(err, t));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, companyId, highlightProductId, t]);

  return (
    <div className={`matched-supplier-card${open ? ' is-open' : ''}`}>
      <div className="matched-supplier-head">
        <div className="matched-supplier-info">
          <UserAvatar
            name={companyName}
            avatarUrl={avatarUrl}
            className="matched-supplier-logo"
          />
          <div>
            <b>{companyName}</b>
            {city ? <div className="meta">{city}</div> : null}
            {reason ? <p className="matched-reason">{reason}</p> : null}
          </div>
        </div>
        <div className="matched-supplier-actions">
          {score != null ? (
            <span className="match-score-pill">{Math.round(score)}%</span>
          ) : null}
          <button
            type="button"
            className="ghost matched-products-btn"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? t('requests.hideProducts') : t('requests.viewProducts')}
          </button>
          <Link className="ghost" to={`/suppliers/${companyId}`}>
            {t('requests.openCatalog')}
          </Link>
        </div>
      </div>

      {open ? (
        <div className="matched-products-panel">
          {loading ? <p className="meta">{t('common.loading')}</p> : null}
          {error ? (
            <p className="notice" style={{ color: '#b45309' }}>
              {error}
            </p>
          ) : null}
          {!loading && !error && products.length === 0 ? (
            <p className="meta">{t('suppliers.noProducts')}</p>
          ) : null}
          {products.length > 0 ? (
            <>
              <div className="matched-products-grid">
                {products.map((p) => {
                  const isMatch = highlightProductId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`matched-product-tile${isMatch ? ' is-match' : ''}`}
                    >
                      <div className="matched-product-media">
                        <ProductImageGallery
                          images={p.images}
                          alt={p.name}
                          placeholder={p.name.slice(0, 1)}
                        />
                        {isMatch ? (
                          <span className="matched-product-badge">
                            {t('requests.matchedProduct')}
                          </span>
                        ) : null}
                      </div>
                      <div className="matched-product-body">
                        <b>{p.name}</b>
                        {p.description ? (
                          <p>{p.description}</p>
                        ) : null}
                        <span className="meta">
                          {[p.unit, p.city].filter(Boolean).join(' · ')}
                        </span>
                        {p.avgRating != null && p.reviewCount ? (
                          <span className="meta inline-rating">
                            <RatingStar size={13} /> {p.avgRating.toFixed(1)} ({p.reviewCount})
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              {total > products.length ? (
                <Link className="matched-more-link" to={`/suppliers/${companyId}`}>
                  {t('requests.moreProducts', { count: total - products.length })}
                </Link>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
