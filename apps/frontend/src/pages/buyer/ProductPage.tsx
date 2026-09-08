import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Lock, Package, Send } from 'lucide-react';
import { productsApi, requestsApi } from '../../api';
import { AppIcon } from '../../components/AppIcon';
import { ProductImageGallery } from '../../components/ProductImageGallery';
import { ProductReviews, ProductStars } from '../../components/ProductReviews';
import { RatingStar, VerifiedMark } from '../../components/RatingIcons';
import { UserAvatar } from '../../components/UserAvatar';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { useAppLocale } from '../../i18n/useAppLocale';
import { mapApiError } from '../../utils/apiErrors';
import { formatProductPrice } from '../../utils/productPrice';
import type { Product } from '../../types';

export function ProductPage() {
  const { t } = useTranslation();
  const { formatDate } = useAppLocale();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState('');
  const [deadline, setDeadline] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');

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

  async function onDirectRequest(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    setSending(true);
    setFormError('');
    try {
      const res = await requestsApi.createDirect({
        productId: product.id,
        quantity: quantity.trim(),
        deadline: deadline.trim(),
      });
      navigate(`/requests/${res.request.id}`);
    } catch (err) {
      setFormError(mapApiError(err, t));
    } finally {
      setSending(false);
    }
  }

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
                    {[product.unit, product.city || company?.city]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="meta product-price-contact">
                    {formatProductPrice(product.priceFrom, product.currency) ??
                      t('products.priceOnContact')}
                  </p>
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
                  <form className="product-direct-form" onSubmit={(e) => void onDirectRequest(e)}>
                    <div className="product-direct-head">
                      <span className="product-direct-mark">
                        <AppIcon icon={Lock} size={16} />
                      </span>
                      <div>
                        <h2>{t('products.directTitle')}</h2>
                        <p>{t('products.directHint')}</p>
                      </div>
                    </div>
                    <div className="product-direct-locks">
                      <span>
                        <AppIcon icon={Package} size={14} />
                        {product.name}
                      </span>
                      {company ? (
                        <Link to={`/suppliers/${company.id}`}>
                          {company.name}
                        </Link>
                      ) : null}
                    </div>
                    <div className="product-direct-fields">
                      <label>
                        {t('requests.quantity')}
                        <span className="product-direct-input">
                          <AppIcon icon={Package} size={16} />
                          <input
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            placeholder={product.unit || t('products.quantityPlaceholder')}
                            required
                          />
                        </span>
                      </label>
                      <label>
                        {t('requests.deadline')}
                        <span className="product-direct-input">
                          <AppIcon icon={CalendarClock} size={16} />
                          <input
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                            placeholder={t('products.deadlinePlaceholder')}
                            required
                          />
                        </span>
                      </label>
                    </div>
                    {formError ? (
                      <p className="notice" style={{ color: '#b45309' }}>
                        {formError}
                      </p>
                    ) : null}
                    <button className="primary product-direct-send" type="submit" disabled={sending}>
                      {sending ? t('common.loading') : t('products.sendDirect')}
                      <AppIcon icon={Send} size={16} className="send-icon" />
                    </button>
                    <p className="product-direct-foot">{t('products.directFoot')}</p>
                  </form>
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
                  {company.description?.trim() ? (
                    <p className="product-page-desc">{company.description.trim()}</p>
                  ) : null}
                  <dl className="supplier-profile-dl">
                    {company.bin ? (
                      <div>
                        <dt>{t('suppliers.bin')}</dt>
                        <dd>{company.bin}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>{t('suppliers.statCity')}</dt>
                      <dd>{company.city || product.city || t('common.empty')}</dd>
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
                    {company.categories?.length ? (
                      <div>
                        <dt>{t('suppliers.statCategories')}</dt>
                        <dd>{company.categories.join(', ')}</dd>
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
