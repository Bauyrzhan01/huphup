export type UserRole = 'BUYER' | 'SUPPLIER' | 'ADMIN';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
};

export type LoginResponse = {
  user: AuthUser;
  accessToken: string;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

// ---------------------------------------------------------------- Wallets
// Legacy per-user wallets (/admin/wallets) — the very first balance system,
// distinct from the billing wallets below even though they share a table.

export type WalletTransactionType = 'CREDIT' | 'DEBIT';

export type AdminWalletRow = {
  walletId: string;
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  balance: string;
  currency: string;
  updatedAt: string;
};

export type WalletDetail = AdminWalletRow;

export type WalletTx = {
  id: string;
  type: WalletTransactionType;
  amount: string;
  balanceAfter: string;
  comment: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------- Billing
// Company + personal wallets, priced actions, ledger with a reason.

export type BillingReason =
  | 'ESCROW_HOLD'
  | 'ESCROW_RELEASE'
  | 'ESCROW_REFUND'
  | 'LEAD_UNLOCK'
  | 'OFFER_SENT'
  | 'SUBSCRIPTION'
  | 'DEAL_COMMISSION'
  | 'MANUAL';

export const BILLING_REASONS: BillingReason[] = [
  'LEAD_UNLOCK',
  'OFFER_SENT',
  'SUBSCRIPTION',
  'DEAL_COMMISSION',
  'ESCROW_HOLD',
  'ESCROW_RELEASE',
  'ESCROW_REFUND',
  'MANUAL',
];

export const BILLING_REASON_LABEL: Record<BillingReason, string> = {
  LEAD_UNLOCK: 'Открытие лида',
  OFFER_SENT: 'Отправка КП',
  SUBSCRIPTION: 'Подписка',
  DEAL_COMMISSION: 'Комиссия со сделки',
  ESCROW_HOLD: 'Заморозка (оплата сделки)',
  ESCROW_RELEASE: 'Выдача (сделка закрыта)',
  ESCROW_REFUND: 'Возврат по сделке',
  MANUAL: 'Ручная операция',
};

export type BillingWalletRow = {
  id: string;
  companyId: string | null;
  userId: string | null;
  balance: string;
  currency: string;
  updatedAt: string;
  company: { id: string; name: string; city: string | null } | null;
  user: { id: string; email: string; fullName: string } | null;
};

export type BillingTx = {
  id: string;
  type: 'TOPUP' | 'CHARGE' | 'REFUND' | 'ADJUSTMENT';
  reason: BillingReason | null;
  amount: string;
  balanceAfter: string;
  comment: string | null;
  leadId: string | null;
  offerId: string | null;
  requestId: string | null;
  createdBy: { id: string; fullName: string; email: string } | null;
  createdAt: string;
};

export type TopUpOrAdjustResult = {
  transaction: BillingTx;
  balance: string;
  duplicate: boolean;
};

export type PlatformPriceRow = {
  reason: BillingReason;
  enabled: boolean;
  amount: string;
  percent: string | null;
  currency: string;
};

export type CompanyPriceRow = {
  companyId: string;
  companyName: string;
  reason: BillingReason;
  enabled: boolean;
  amount: string;
  percent: string | null;
};

export type PricingList = {
  platform: PlatformPriceRow[];
  companies: CompanyPriceRow[];
};

export type PriceRule = {
  reason: BillingReason;
  enabled: boolean;
  amount: number;
  percent?: number;
  companyId?: string;
};

// ---------------------------------------------------------------- Deals

export type DealStatus =
  | 'AWAITING_PAYMENT'
  | 'HELD'
  | 'SHIPPED'
  | 'RELEASED'
  | 'REFUNDED'
  | 'DISPUTED';

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  AWAITING_PAYMENT: 'Ждём оплату',
  HELD: 'Деньги у площадки',
  SHIPPED: 'Отгружено',
  RELEASED: 'Выдано поставщику',
  REFUNDED: 'Возвращено покупателю',
  DISPUTED: 'Спор',
};

export type Deal = {
  id: string;
  status: DealStatus;
  side: 'buyer' | 'supplier' | 'admin';
  amount: string;
  commission: string;
  payout: string;
  currency: string;
  request: { id: string; code: string; title: string; city: string | null };
  company: { id: string; name: string; city: string | null };
  buyer?: { id: string; fullName: string; email: string };
  offerId: string;
  deliveryDays: number | null;
  disputeReason: string | null;
  fundedAt: string | null;
  shippedAt: string | null;
  autoReleaseAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DisputeRecommendation = 'RELEASE' | 'REFUND' | 'NEEDS_INFO';

export type DisputeTriage =
  | {
      available: true;
      triage: {
        summary: string;
        recommendation: DisputeRecommendation;
        reasoning: string;
      };
    }
  | { available: false; reason: string };
