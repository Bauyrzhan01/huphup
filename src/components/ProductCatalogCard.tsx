import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PublicProduct } from '../types';
import { ProductImageGallery } from './ProductImageGallery';
import { ProductStars } from './ProductReviews';

export function ProductCatalogCard({
  product,
  href,
}: {
  product: PublicProduct;
  href: string;
}) {
  const { t } = useTranslation();

  return (
    <article className="supplier-card product-catalog-card">
      <div className="product-catalog-main">
        <ProductImageGallery images={product.images} alt={product.name} className="product-card-gallery" />
        <Link to={href} className="product-card-body">
          <h3>{product.name}</h3>
          <p>{product.description || t('common.empty')}</p>
          <div className="product-catalog-foot">
            <div>
              <div className="meta">
                {[product.unit, product.city].filter(Boolean).join(' · ')}
              </div>
              <p className="meta product-price-contact">{t('products.priceOnContact')}</p>
              <div className="product-card-rating">
                {product.reviewCount && product.avgRating != null ? (
                  <>
                    <ProductStars value={product.avgRating} size="sm" />
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
            </div>
            <span className="supplier-directory-open">{t('products.openPage')}</span>
          </div>
        </Link>
      </div>
    </article>
  );
}
