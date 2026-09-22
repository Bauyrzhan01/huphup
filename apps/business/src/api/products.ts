import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { api } from './client';

export type ProductImage = { id: string; url: string; sortOrder: number };

export type Product = {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  priceFrom: string | null;
  currency: string;
  city: string | null;
  isActive: boolean;
  images: ProductImage[];
  updatedAt: string;
};

export type ProductInput = {
  name: string;
  description?: string;
  unit?: string;
  city?: string;
  /** null clears the price («по запросу»). */
  priceFrom?: number | null;
};

function imageForm(asset: ImagePickerAsset) {
  const form = new FormData();
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  if (Platform.OS === 'web' && asset.file) {
    form.append('file', asset.file, name);
  } else {
    // React Native's FormData takes a { uri, name, type } descriptor instead of a Blob.
    form.append('file', { uri: asset.uri, name, type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
  }
  return form;
}

export const productsApi = {
  mine: () => api<Product[]>('/products/mine'),
  create: (input: ProductInput) =>
    api<Product>('/products', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<ProductInput> & { isActive?: boolean }) =>
    api<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => api<{ ok: true }>(`/products/${id}`, { method: 'DELETE' }),
  addImage: (id: string, asset: ImagePickerAsset) =>
    api<ProductImage>(`/products/${id}/images`, { method: 'POST', body: imageForm(asset) }),
  removeImage: (id: string, imageId: string) =>
    api<unknown>(`/products/${id}/images/${imageId}`, { method: 'DELETE' }),
};
