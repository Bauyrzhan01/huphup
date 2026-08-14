import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi } from '../../api';
import { ProductCatalogCard } from '../../components/ProductCatalogCard';
import { UserAvatar } from '../../components/UserAvatar';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { Company, PublicProduct } from '../../types';

const PAGE_SIZE = 12;

function coverTone(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const tones = [
    'linear-gradient(135deg,#111 0%,#2d2d2d 48%,#0f8a68 140%)',
    'linear-gradient(135deg,#1a1a1a 0%,#334 55%,#087a5e 130%)',
    'linear-gradient(145deg,#0c0c0c 0%,#222 50%,#145c4a 125%)',
    'linear-gradient(135deg,#171717 0%,#2a2a2a 45%,#1b6b55 135%)',
  ];
  return tones[hash % tones.length];
}

export function SupplierDetailPage() {
  const { t } = useTranslation();
  const { formatDate } = useAppLocale();
  const { id = '' } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setPage(1);
    void companiesApi
      .get(id)
      .then(setCompany)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void companiesApi
      .products(id, { page, limit: PAGE_SIZE })
      .then((res) => {
        setProducts(res.items);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [id, page, t]);

  const rating = company ? Number(company.rating) : 0;
  const cover = useMemo(
    () => (company ? coverTone(company.id || company.name) : coverTone('huphup')),
    [company],
  );

  return (
    <BuyerLayout crumb={t('suppliers.title')}>
      <div className="page supplier-profile-page">
        {error ? (
          <p className="notice" style={{ color: '#b45309' }}>
            {error}
          </p>
        ) : null}

        {loading && !company ? <p className="assist-note">{t('common.loading')}</p> : null}

        {company ? (
          <>
            <section className="supplier-profile-hero">
              <div className="supplier-profile-cover" style={{ background: cover }} aria-hidden>
                <div className="supplier-profile-cover-pattern" />
              </div>
              <div className="supplier-profile-hero-body">
                <div className="supplier-profile-identity">
                  <UserAvatar
                    name={company.name}
                    avatarUrl={
                      company.avatarUrl ||
                      company.logoUrl ||
                      company.owner?.avatarUrl
                    }
                    className="supplier-profile-avatar"
                  />
                  <div className="supplier-profile-title">
                    <div className="supplier-profile-name-row">
                      <h1>{company.name}</h1>
                      {company.verified ? (
                        <span className="supplier-profile-verified" title={t('suppliers.verified')}>
                          ✓ {t('suppliers.verified')}
                        </span>
                      ) : null}
                    </div>
                    <p className="supplier-profile-sub">
                      {[company.city, t('common.rating', { value: rating.toFixed(1) })]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {company.categories.length > 0 ? (
                      <div className="chips supplier-profile-chips">
                        {company.categories.map((cat) => (
                          <span key={cat} className="chip">
                            {cat}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="supplier-profile-actions">
                  <Link className="ghost" to="/suppliers">
                    {t('common.back')}
                  </Link>
                  <Link className="primary" to="/requests/new">
                    {t('suppliers.createRequest')}
                  </Link>
                </div>
              </div>
            </section>

            <div className="supplier-profile-stats">
              <div className="supplier-profile-stat">
                <small>{t('suppliers.statProducts')}</small>
                <b>{total}</b>
              </div>
              <div className="supplier-profile-stat">
                <small>{t('suppliers.statRating')}</small>
                <b>
                  <span className="supplier-profile-stars">★</span> {rating.toFixed(1)}
                </b>
              </div>
              <div className="supplier-profile-stat">
                <small>{t('suppliers.statCity')}</small>
                <b>{company.city || t('common.empty')}</b>
              </div>
              <div className="supplier-profile-stat">
                <small>{t('suppliers.statCategories')}</small>
                <b>{company.categories.length || '—'}</b>
              </div>
            </div>

            <div className="supplier-profile-layout">
              <aside className="supplier-profile-side">
                <div className="panel supplier-profile-about">
                  <h2 className="section-title">{t('suppliers.about')}</h2>
                  <p>
                    {company.description?.trim() || t('suppliers.noDescription')}
                  </p>
                </div>
                <div className="panel supplier-profile-meta">
                  <h2 className="section-title">{t('suppliers.details')}</h2>
                  <dl className="supplier-profile-dl">
                    <div>
                      <dt>{t('suppliers.bin')}</dt>
                      <dd>{company.bin || t('common.empty')}</dd>
                    </div>
                    <div>
                      <dt>{t('suppliers.statCity')}</dt>
                      <dd>{company.city || t('common.empty')}</dd>
                    </div>
                    <div>
                      <dt>{t('suppliers.statRating')}</dt>
                      <dd>★ {rating.toFixed(1)}</dd>
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
                </div>
              </aside>

              <section className="supplier-profile-catalog">
                <div className="supplier-profile-catalog-head">
                  <h2 className="section-title">
                    {t('suppliers.productsTitle', { count: total })}
                  </h2>
                  <p className="meta">{t('suppliers.catalogHint')}</p>
                </div>
                {loading ? <p className="assist-note">{t('common.loading')}</p> : null}
                <div className="supplier-profile-products">
                  {products.map((p) => (
                    <ProductCatalogCard key={p.id} product={p} />
                  ))}
                </div>
                {products.length === 0 && !loading ? (
                  <div className="supplier-profile-empty">
                    <b>{t('suppliers.noProducts')}</b>
                    <p>{t('suppliers.noProductsHint')}</p>
                  </div>
                ) : null}
                {totalPages > 1 ? (
                  <div className="actions" style={{ marginTop: 20, justifyContent: 'center' }}>
                    <button
                      type="button"
                      className="ghost"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      {t('common.prevPage')}
                    </button>
                    <span className="meta">
                      {t('common.pageOf', { page, total: totalPages })}
                    </span>
                    <button
                      type="button"
                      className="ghost"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {t('common.nextPage')}
                    </button>
                  </div>
                ) : null}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </BuyerLayout>
  );
}
