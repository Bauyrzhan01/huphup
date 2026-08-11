import { useTranslation } from 'react-i18next';
import { resolveMediaUrl } from '../api/client';
import { useAppLocale } from '../i18n/useAppLocale';
import type { Product } from '../types';

type Props = {
  product: Product;
  selected: boolean;
  onSelect: () => void;
};

export function SupplierProductCard({ product, selected, onSelect }: Props) {
  const { t } = useTranslation();
  const { formatMoney } = useAppLocale();
  const cover = product.images?.[0];
  const imageCount = product.images?.length ?? 0;

  return (
    <button
      type="button"
      className={`supplier-product-card${selected ? ' is-selected' : ''}${product.isActive ? '' : ' is-hidden'}`}
      onClick={onSelect}
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
        <p className="supplier-product-card-price">
          {product.priceFrom != null
            ? `${formatMoney(product.priceFrom)}${product.unit ? ` / ${product.unit}` : ''}`
            : t('products.priceOnRequest')}
        </p>
        {product.city ? <p className="meta">{product.city}</p> : null}
        {product.reviewCount && product.avgRating != null ? (
          <p className="supplier-product-card-rating">
            <span className="supplier-product-card-stars">★ {product.avgRating.toFixed(1)}</span>
            <span className="meta">({product.reviewCount})</span>
          </p>
        ) : null}
      </div>
    </button>
  );
}
