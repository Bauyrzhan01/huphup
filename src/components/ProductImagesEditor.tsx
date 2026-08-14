import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { productsApi } from '../api';
import { resolveMediaUrl } from '../api/client';
import { AppIcon } from './AppIcon';
import type { ProductImage } from '../types';

type Props = {
  productId: string;
  images: ProductImage[];
  onChange: () => void;
};

export function ProductImagesEditor({ productId, images, onChange }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function onPickFiles(fileList: FileList | null) {
    if (!fileList?.length || uploading) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith('image/')) continue;
        await productsApi.uploadImage(productId, file);
      }
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onRemove(imageId: string) {
    setError('');
    try {
      await productsApi.removeImage(productId, imageId);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <div className="product-images-editor">
      <label className="field-label">{t('products.images')}</label>
      <p className="meta product-images-hint">{t('products.imagesHint')}</p>
      {error ? (
        <p className="notice" style={{ color: '#b45309', marginBottom: 8 }}>
          {error}
        </p>
      ) : null}
      <div className="product-images-grid">
        {images.map((img) => (
          <div key={img.id} className="product-image-thumb">
            <img src={resolveMediaUrl(img.url)} alt="" />
            <button
              type="button"
              className="product-image-remove"
              aria-label={t('products.removeImage')}
              onClick={() => void onRemove(img.id)}
            >
              <AppIcon icon={X} size={16} />
            </button>
          </div>
        ))}
        {images.length < 10 ? (
          <button
            type="button"
            className="product-image-add"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? t('products.uploading') : '+'}
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void onPickFiles(e.target.files)}
      />
    </div>
  );
}
