import { api } from './client';

export type RequestStatus = 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED';
export type LeadStatus = 'NEW' | 'VIEWED' | 'OFFERED' | 'SKIPPED';
export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

/** A buyer request matched to our company. */
export type Lead = {
  id: string;
  requestId: string;
  status: LeadStatus;
  score: number;
  matchReason: string | null;
  createdAt: string;
  request: {
    id: string;
    code: string;
    title: string;
    description: string;
    category: string | null;
    city: string | null;
    quantity: string | null;
    deadline: string | null;
    status: RequestStatus;
    createdAt: string;
  };
  matchedProduct: {
    id: string;
    name: string;
    unit: string | null;
    priceFrom: string | null;
    currency: string;
  } | null;
};

export type CompanyOffer = {
  id: string;
  price: string | number;
  currency: string;
  deliveryDays: number | null;
  comment: string | null;
  status: OfferStatus;
  createdAt: string;
  request: { id: string; code: string; title: string; city: string | null; status: RequestStatus };
};

export const leadsApi = {
  list: () => api<Lead[]>('/leads'),
  view: (id: string) => api<Lead>(`/leads/${id}/view`, { method: 'POST' }),
  skip: (id: string) => api<Lead>(`/leads/${id}/skip`, { method: 'POST' }),
};

export const offersApi = {
  list: () => api<CompanyOffer[]>('/offers/for-company'),
  create: (input: { requestId: string; price: number; deliveryDays?: number; comment?: string }) =>
    api<CompanyOffer>('/offers', { method: 'POST', body: JSON.stringify(input) }),
  withdraw: (id: string) => api<CompanyOffer>(`/offers/${id}/withdraw`, { method: 'POST' }),
};
