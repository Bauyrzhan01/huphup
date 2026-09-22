import { api } from './client';

export type Product = {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  city: string | null;
  priceFrom: string | null;
  currency: string;
  images: { id: string; url: string; sortOrder: number }[];
  avgRating: number | null;
  reviewCount: number;
  company?: { id: string; name: string; city: string | null; verified: boolean; rating: number | null };
};

export type Company = {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  categories: string[];
  verified: boolean;
  rating: number | null;
  avatarUrl: string | null;
};

type Page<T> = { items: T[]; page: number; totalPages: number; total: number };

export const catalogApi = {
  meta: () => api<{ cities: string[]; categories: string[] }>('/products/catalog/meta'),
  products: (params: { q?: string; limit?: number } = {}) => {
    const q = new URLSearchParams({ limit: String(params.limit ?? 10) });
    if (params.q) q.set('q', params.q);
    return api<Page<Product>>(`/products/catalog?${q.toString()}`);
  },
  product: (id: string) => api<Product>(`/products/${id}`),
  companies: (limit = 50) => api<Page<Company>>(`/companies?limit=${limit}`),
  company: (id: string) => api<Company>(`/companies/${id}`),
  companyProducts: (id: string) => api<Page<Product>>(`/companies/${id}/products?limit=50`),
};
