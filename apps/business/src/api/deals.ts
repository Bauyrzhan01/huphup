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
  /** What the company receives after the platform commission. */
  payout: string;
  currency: string;
  deliveryDays: number | null;
  disputeReason: string | null;
  request: { id: string; code: string; title: string; city: string | null };
  company: { id: string; name: string; city: string | null };
  buyer?: { id: string; fullName: string; email: string };
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

export const dealsApi = {
  list: () => api<Deal[]>('/deals'),
  ship: (id: string) => api<Deal>(`/deals/${id}/ship`, { method: 'POST' }),
  cancel: (id: string, reason?: string) =>
    api<Deal>(`/deals/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  dispute: (id: string, reason: string) =>
    api<Deal>(`/deals/${id}/dispute`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

// Without scope the API returns the company wallet — where deal payouts land.
export const walletApi = {
  me: () => api<Wallet>('/billing/wallet'),
  transactions: (page = 1) =>
    api<{ items: WalletTransaction[]; page: number; totalPages: number }>(
      `/billing/transactions?page=${page}&limit=20`,
    ),
};
