import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveMediaUrl } from '../api/client';

type ImageItem = { id: string; url: string };

type Props = {
  images?: ImageItem[];
  alt: string;
  className?: string;
  placeholder?: string;
};

export function ProductImageGallery({ images = [], alt, className = '', placeholder }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const hasMany = images.length > 1;
  const current = images[index];

  useEffect(() => {
    setIndex(0);
  }, [images]);

  const goPrev = useCallback(
    (e?: MouseEvent) => {
      e?.stopPropagation();
      setIndex((i) => (i - 1 + images.length) % images.length);
    },
    [images.length],
  );

  const goNext = useCallback(
    (e?: MouseEvent) => {
      e?.stopPropagation();
      setIndex((i) => (i + 1) % images.length);
    },
    [images.length],
  );

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, goPrev, goNext]);

  if (!current) {
    return (
      <div className={`product-gallery product-gallery-empty ${className}`.trim()}>
        <span>{placeholder ?? alt.slice(0, 1)}</span>
      </div>
    );
  }

  return (
    <>
      <div className={`product-gallery${hasMany ? ' has-many' : ''} ${className}`.trim()}>
        <div className="product-gallery-stage">
          <button
            type="button"
            className="product-gallery-main"
            onClick={() => setLightbox(true)}
            aria-label={t('products.openGallery')}
          >
            <img src={resolveMediaUrl(current.url)} alt={alt} loading="lazy" />
            <span className="product-gallery-expand" aria-hidden>
              ⤢
            </span>
            {hasMany ? (
              <span className="product-gallery-count">
                {index + 1}/{images.length}
              </span>
            ) : null}
          </button>
          {hasMany ? (
            <>
              <button
                type="button"
                className="product-gallery-nav is-prev"
                aria-label={t('products.prevPhoto')}
                onClick={goPrev}
              >
                ‹
              </button>
              <button
                type="button"
                className="product-gallery-nav is-next"
                aria-label={t('products.nextPhoto')}
                onClick={goNext}
              >
                ›
              </button>
            </>
          ) : null}
        </div>
        {hasMany ? (
          <div className="product-gallery-thumbs" role="tablist" aria-label={alt}>
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={`product-gallery-thumb${i === index ? ' is-on' : ''}`}
                onClick={() => setIndex(i)}
              >
                <img src={resolveMediaUrl(img.url)} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {lightbox ? (
        <div
          className="product-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            className="product-lightbox-close"
            aria-label={t('products.closeGallery')}
            onClick={() => setLightbox(false)}
          >
            ×
          </button>
          {hasMany ? (
            <button type="button" className="product-lightbox-nav is-prev" onClick={goPrev}>
              ‹
            </button>
          ) : null}
          <img
            src={resolveMediaUrl(current.url)}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
          />
          {hasMany ? (
            <button type="button" className="product-lightbox-nav is-next" onClick={goNext}>
              ›
            </button>
          ) : null}
          {hasMany ? (
            <div className="product-lightbox-thumbs" onClick={(e) => e.stopPropagation()}>
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  className={`product-lightbox-thumb${i === index ? ' is-on' : ''}`}
                  onClick={() => setIndex(i)}
                >
                  <img src={resolveMediaUrl(img.url)} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
