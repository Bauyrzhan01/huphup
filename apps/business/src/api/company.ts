import { api } from './client';

export type Company = {
  id: string;
  name: string;
  bin: string | null;
  city: string | null;
  description: string | null;
  categories: string[];
  verified: boolean;
  rating: string | number | null;
};

export const companyApi = {
  // GET /companies/me would silently create a company named after the user,
  // so the app only calls it once the user already has one.
  me: () => api<Company>('/companies/me'),
  create: (input: { name: string; bin?: string; city?: string; categories?: string[] }) =>
    api<Company>('/companies', { method: 'POST', body: JSON.stringify(input) }),
  meta: () => api<{ cities: string[]; categories: string[] }>('/products/catalog/meta'),
};
