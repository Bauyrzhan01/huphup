import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolveMediaUrl } from '../api/client';
import type { Product } from '../types';

type Props = {
  product: Product;
};

export function SupplierProductCard({ product }: Props) {
  const { t } = useTranslation();
  const cover = product.images?.[0];
  const imageCount = product.images?.length ?? 0;

  return (
    <Link
      to={`/supplier/products/${product.id}`}
      className={`supplier-product-card${product.isActive ? '' : ' is-hidden'}`}
    >
      <div className="supplier-product-card-media">
        {cover ? (
          <img src={resolveMediaUrl(cover.url)} alt={product.name} loading="lazy" />
        ) : (
          <div className="supplier-product-card-placeholder">
            <span className="supplier-product-card-icon" aria-hidden>
              📦
            </span>
            <span>{t('products.noPhoto')}</span>
          </div>
        )}
        <span className={`supplier-product-card-status ${product.isActive ? 'is-active' : ''}`}>
          {product.isActive ? t('products.active') : t('products.hidden')}
        </span>
        {imageCount > 1 ? (
          <span className="supplier-product-card-photos">+{imageCount - 1}</span>
        ) : null}
      </div>
      <div className="supplier-product-card-body">
        <h3>{product.name}</h3>
        {product.unit || product.city ? (
          <p className="meta">
            {[product.unit, product.city].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {product.reviewCount && product.avgRating != null ? (
          <p className="supplier-product-card-rating">
            <span className="supplier-product-card-stars">★ {product.avgRating.toFixed(1)}</span>
            <span className="meta">({product.reviewCount})</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
