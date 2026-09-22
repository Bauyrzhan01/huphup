import { api } from './client';
import type {
  AdminWalletRow,
  Banner,
  BannerInput,
  BillingReason,
  BillingTx,
  BillingWalletRow,
  Deal,
  DealStatus,
  DisputeTriage,
  LoginResponse,
  Paginated,
  PriceRule,
  PricingList,
  TopUpOrAdjustResult,
  WalletDetail,
  WalletTx,
} from './types';

function query(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const authApi = {
  login: (email: string, password: string) =>
    api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
};

/** Legacy per-user wallets — /admin/wallets. */
export const walletsApi = {
  list: (params: { q?: string; page?: number; limit?: number } = {}) =>
    api<Paginated<AdminWalletRow>>(`/admin/wallets${query(params)}`),
  one: (userId: string) => api<WalletDetail>(`/admin/wallets/${userId}`),
  transactions: (userId: string, params: { page?: number; limit?: number } = {}) =>
    api<Paginated<WalletTx>>(`/admin/wallets/${userId}/transactions${query(params)}`),
  credit: (userId: string, amount: number, comment?: string) =>
    api<{ balance: string; currency: string }>(`/admin/wallets/${userId}/credit`, {
      method: 'POST',
      body: JSON.stringify({ amount, comment }),
    }),
  debit: (userId: string, amount: number, comment?: string) =>
    api<{ balance: string; currency: string }>(`/admin/wallets/${userId}/debit`, {
      method: 'POST',
      body: JSON.stringify({ amount, comment }),
    }),
};

/** Company + personal wallets, priced actions — /admin/billing. */
export const billingApi = {
  wallets: (params: { q?: string; page?: number; limit?: number } = {}) =>
    api<Paginated<BillingWalletRow>>(`/admin/billing/wallets${query(params)}`),
  transactions: (
    params: { reason?: BillingReason; page?: number; limit?: number } = {},
  ) => api<Paginated<BillingTx>>(`/admin/billing/transactions${query(params)}`),
  topUp: (owner: { companyId?: string; userId?: string }, amount: number, comment?: string) =>
    api<TopUpOrAdjustResult>('/admin/billing/topup', {
      method: 'POST',
      body: JSON.stringify({ ...owner, amount, comment }),
    }),
  adjust: (owner: { companyId?: string; userId?: string }, amount: number, comment: string) =>
    api<TopUpOrAdjustResult>('/admin/billing/adjust', {
      method: 'POST',
      body: JSON.stringify({ ...owner, amount, comment }),
    }),
  pricing: () => api<PricingList>('/admin/billing/pricing'),
  updatePricing: (rules: PriceRule[]) =>
    api<PricingList>('/admin/billing/pricing', {
      method: 'PUT',
      body: JSON.stringify({ rules }),
    }),
};

/** Escrow deals and dispute resolution — /admin/deals. */
export const dealsApi = {
  list: (status?: DealStatus) => api<Deal[]>(`/admin/deals${query({ status })}`),
  aiSummary: (id: string) => api<DisputeTriage>(`/admin/deals/${id}/ai-summary`),
  release: (id: string) => api<Deal>(`/admin/deals/${id}/release`, { method: 'POST' }),
  refund: (id: string, reason?: string) =>
    api<Deal>(`/admin/deals/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

/** NBO banners on the app home screen — /admin/banners. */
export const bannersApi = {
  list: () => api<Banner[]>('/admin/banners'),
  create: (input: BannerInput) =>
    api<Banner>('/admin/banners', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, patch: Partial<BannerInput>) =>
    api<Banner>(`/admin/banners/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) => api<{ ok: true }>(`/admin/banners/${id}`, { method: 'DELETE' }),
  uploadImage: (id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return api<Banner>(`/admin/banners/${id}/image`, { method: 'POST', body });
  },
  removeImage: (id: string) => api<Banner>(`/admin/banners/${id}/image`, { method: 'DELETE' }),
};
