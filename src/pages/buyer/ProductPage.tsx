import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { productsApi } from '../../api';
import { ProductImageGallery } from '../../components/ProductImageGallery';
import { ProductReviews, ProductStars } from '../../components/ProductReviews';
import { RatingStar, VerifiedMark } from '../../components/RatingIcons';
import { UserAvatar } from '../../components/UserAvatar';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { Product } from '../../types';

export function ProductPage() {
  const { t } = useTranslation();
  const { formatDate } = useAppLocale();
  const { id = '' } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void productsApi
      .get(id)
      .then(setProduct)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [id, t]);

  const company = product?.company;
  const rating = company ? Number(company.rating) : 0;

  return (
    <BuyerLayout crumb={t('products.detailCrumb')}>
      <div className="page product-page">
        {error ? (
          <p className="notice" style={{ color: '#b45309' }}>
            {error}
          </p>
        ) : null}
        {loading ? <p className="assist-note">{t('common.loading')}</p> : null}

        {product ? (
          <>
            <div className="product-page-nav">
              {company ? (
                <Link className="ghost" to={`/suppliers/${company.id}`}>
                  {t('products.backToSupplier')}
                </Link>
              ) : (
                <Link className="ghost" to="/suppliers">
                  {t('nav.suppliers')}
                </Link>
              )}
            </div>

            <div className="product-page-layout">
              <section className="product-page-hero">
                <ProductImageGallery
                  images={product.images}
                  alt={product.name}
                  className="product-page-gallery"
                />
                <div className="product-page-info">
                  {company?.verified ? (
                    <span className="supplier-profile-verified">
                      <VerifiedMark size={14} /> {t('suppliers.verified')}
                    </span>
                  ) : null}
                  <h1>{product.name}</h1>
                  <p className="product-page-desc">
                    {product.description || t('common.empty')}
                  </p>
                  <p className="meta">
                    {[product.unit, product.city ? `г. ${product.city}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="meta product-price-contact">{t('products.priceOnContact')}</p>
                  <div className="product-card-rating">
                    {product.reviewCount && product.avgRating != null ? (
                      <>
                        <ProductStars value={product.avgRating} size="md" />
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
                  <div className="product-page-actions">
                    <Link className="primary" to="/app">
                      {t('suppliers.createRequest')}
                    </Link>
                    {company ? (
                      <Link className="ghost" to={`/suppliers/${company.id}`}>
                        {company.name}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </section>

              {company ? (
                <aside className="panel product-page-requisites">
                  <h2 className="section-title">{t('suppliers.details')}</h2>
                  {company.logoUrl || company.owner?.avatarUrl ? (
                    <div className="product-page-company">
                      <UserAvatar
                        name={company.name}
                        avatarUrl={company.logoUrl || company.owner?.avatarUrl}
                        className="supplier-directory-avatar"
                      />
                      <div>
                        <b>{company.name}</b>
                        {company.verified ? (
                          <span className="supplier-profile-verified">
                            <VerifiedMark size={12} /> {t('suppliers.verified')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p>
                      <b>{company.name}</b>
                    </p>
                  )}
                  <dl className="supplier-profile-dl">
                    <div>
                      <dt>{t('suppliers.statCity')}</dt>
                      <dd>{company.city || t('common.empty')}</dd>
                    </div>
                    <div>
                      <dt>{t('suppliers.statRating')}</dt>
                      <dd className="inline-rating">
                        <RatingStar size={14} /> {rating.toFixed(1)}
                      </dd>
                    </div>
                    {company.owner?.fullName ? (
                      <div>
                        <dt>{t('suppliers.owner')}</dt>
                        <dd>{company.owner.fullName}</dd>
                      </div>
                    ) : null}
                    {company.createdAt ? (
                      <div>
                        <dt>{t('suppliers.onPlatform')}</dt>
                        <dd>{formatDate(company.createdAt)}</dd>
                      </div>
                    ) : null}
                  </dl>
                </aside>
              ) : null}
            </div>

            <ProductReviews productId={product.id} />
          </>
        ) : null}
      </div>
    </BuyerLayout>
  );
}
