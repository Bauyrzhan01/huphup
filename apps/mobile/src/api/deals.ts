import { api } from './client';

export type DealStatus =
  | 'AWAITING_PAYMENT'
  | 'HELD'
  | 'SHIPPED'
  | 'RELEASED'
  | 'REFUNDED'
  | 'DISPUTED';

export type Deal = {
  id: string;
  status: DealStatus;
  side: 'buyer' | 'supplier' | 'admin';
  amount: string;
  currency: string;
  deliveryDays: number | null;
  disputeReason: string | null;
  request: { id: string; code: string; title: string; city: string | null };
  company: { id: string; name: string; city: string | null };
  autoReleaseAt: string | null;
  createdAt: string;
};

export type Wallet = { balance: string; currency: string };

export type WalletTransaction = {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  /** Signed: a debit is negative. */
  amount: string;
  balanceAfter: string;
  comment: string | null;
  createdAt: string;
};

export const offersApi = {
  accept: (id: string) =>
    api<{ offerId: string; conversationId: string }>(`/offers/${id}/accept`, { method: 'POST' }),
  reject: (id: string) => api<unknown>(`/offers/${id}/reject`, { method: 'POST' }),
};

export const dealsApi = {
  list: () => api<Deal[]>('/deals'),
  pay: (id: string) => api<Deal>(`/deals/${id}/pay`, { method: 'POST' }),
  confirm: (id: string) => api<Deal>(`/deals/${id}/confirm`, { method: 'POST' }),
  cancel: (id: string, reason?: string) =>
    api<Deal>(`/deals/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  dispute: (id: string, reason: string) =>
    api<Deal>(`/deals/${id}/dispute`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

// Purchases are paid from the personal wallet; scope=user asks for it even if the buyer owns a company.
export const walletApi = {
  me: () => api<Wallet>('/billing/wallet?scope=user'),
  transactions: (page = 1) =>
    api<{ items: WalletTransaction[]; page: number; totalPages: number }>(
      `/billing/transactions?scope=user&page=${page}&limit=20`,
    ),
};
