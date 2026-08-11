import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi } from '../../api';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { Company, Product } from '../../types';

type PublicProduct = Pick<
  Product,
  'id' | 'name' | 'description' | 'unit' | 'priceFrom' | 'currency' | 'city'
>;

export function SupplierDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { formatMoney } = useAppLocale();
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void Promise.all([companiesApi.get(id), companiesApi.products(id)])
      .then(([c, p]) => {
        setCompany(c);
        setProducts(p);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [id, t]);

  return (
    <BuyerLayout crumb={t('suppliers.title')}>
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{company?.name ?? t('common.loading')}</h1>
            <p>
              {company?.city ?? t('common.empty')}
              {company
                ? ` · ${t('common.rating', { value: Number(company.rating).toFixed(1) })}`
                : ''}
              {company?.verified ? <span className="verified"> ✓</span> : null}
            </p>
          </div>
          <Link className="ghost" to="/suppliers">
            {t('common.back')}
          </Link>
        </div>

        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}
        {loading ? <p className="assist-note">{t('common.loading')}</p> : null}

        {company ? (
          <>
            {company.description ? (
              <div className="panel" style={{ marginBottom: 16 }}>
                <p style={{ margin: 0, lineHeight: 1.5 }}>{company.description}</p>
              </div>
            ) : null}
            {company.categories.length > 0 ? (
              <div className="chips" style={{ marginBottom: 16 }}>
                {company.categories.map((cat) => (
                  <span key={cat} className="chip">
                    {cat}
                  </span>
                ))}
              </div>
            ) : null}
            {company.bin ? (
              <p className="meta" style={{ marginBottom: 16 }}>
                {t('suppliers.bin')}: {company.bin}
              </p>
            ) : null}

            <h2 className="section-title">
              {t('suppliers.productsTitle', { count: products.length })}
            </h2>
            <div className="supplier-grid">
              {products.map((p) => (
                <div key={p.id} className="supplier-card">
                  <h3>{p.name}</h3>
                  <p>{p.description || t('common.empty')}</p>
                  <div className="meta">
                    {p.priceFrom != null
                      ? `${t('suppliers.from')} ${formatMoney(p.priceFrom)}`
                      : t('products.priceOnRequest')}
                    {p.unit ? ` / ${p.unit}` : ''}
                    {p.city ? ` · ${p.city}` : ''}
                  </div>
                </div>
              ))}
            </div>
            {products.length === 0 ? (
              <p className="assist-note">{t('suppliers.noProducts')}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </BuyerLayout>
  );
}
