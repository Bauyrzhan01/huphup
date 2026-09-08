import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react';
import { companiesApi, productsApi } from '../../api';
import { AppIcon } from '../../components/AppIcon';
import { SupplierProductCard } from '../../components/SupplierProductCard';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { isNoCompanyError, mapApiError } from '../../utils/apiErrors';
import type { Product } from '../../types';

export function SupplierProductsPage() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [hasCompany, setHasCompany] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    void companiesApi
      .me()
      .then(() => productsApi.mine())
      .then((list) => {
        setHasCompany(true);
        setProducts(list);
      })
      .catch((err) => {
        if (isNoCompanyError(err)) {
          setHasCompany(false);
          setProducts([]);
        } else {
          setError(mapApiError(err, t));
        }
      })
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <SupplierLayout
      crumb={t('products.crumb')}
      actions={
        hasCompany ? (
          <Link className="primary" to="/supplier/products/new">
            {t('products.addNew')}
          </Link>
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
              <p className="notice supplier-products-notice is-error">{error}</p>
            ) : null}

            {loading ? (
              <p className="assist-note">{t('common.loading')}</p>
            ) : products.length === 0 ? (
              <div className="supplier-products-empty card">
                <div className="supplier-products-empty-icon" aria-hidden>
                  <AppIcon icon={Package} size={40} strokeWidth={1.5} />
                </div>
                <b>{t('products.empty')}</b>
                <p>{t('products.emptyHint')}</p>
                <Link className="primary" to="/supplier/products/new">
                  {t('products.addNew')}
                </Link>
              </div>
            ) : (
              <div className="supplier-products-grid">
                {products.map((product) => (
                  <SupplierProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </SupplierLayout>
  );
}
