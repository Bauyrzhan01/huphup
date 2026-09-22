import { api } from './client';

export type RequestStatus = 'DRAFT' | 'PUBLISHED' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED';

export type Offer = {
  id: string;
  price: string | number;
  currency: string;
  deliveryDays: number | null;
  comment: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  createdAt: string;
  company: { id: string; name: string; city: string | null; verified: boolean };
};

export type RequestItem = {
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
  _count?: { offers: number; leads: number };
  offers?: Offer[];
};

export type AnalyzeQuestion = { id: string; question: string; options?: string[] };

export type AnalyzeResult = {
  title: string;
  description: string;
  category: string;
  city: string;
  quantity: string;
  deadline: string;
  rawText: string;
  assistantMessage?: string;
  questions?: AnalyzeQuestion[];
  ready?: boolean;
  /** The buyer only confirmed ("да, публикуй") — nothing new to say back. */
  ackOnly?: boolean;
};

export type PublishResult = {
  request: RequestItem;
  leadsCreated: number;
  matchedSuppliers: {
    companyId: string;
    companyName: string;
    city: string | null;
    score: number;
    reason?: string;
  }[];
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export const requestsApi = {
  analyze: (text: string) =>
    api<AnalyzeResult>('/requests/analyze', { method: 'POST', body: JSON.stringify({ text }) }),
  clarify: (input: {
    text: string;
    answers: { id: string; answer: string }[];
    previous: AnalyzeResult | null;
    messages: ChatMessage[];
  }) =>
    api<AnalyzeResult>('/requests/analyze/clarify', {
      method: 'POST',
      body: JSON.stringify({ ...input, previous: input.previous ?? undefined }),
    }),
  list: () => api<RequestItem[]>('/requests'),
  get: (id: string) => api<RequestItem>(`/requests/${id}`),
  create: (body: {
    title: string;
    description: string;
    category?: string;
    city?: string;
    quantity?: string;
    deadline?: string;
    rawText: string;
  }) => api<RequestItem>('/requests', { method: 'POST', body: JSON.stringify(body) }),
  publish: (id: string) => api<PublishResult>(`/requests/${id}/publish`, { method: 'POST' }),
};

export const directoryApi = {
  meta: () => api<{ cities: string[] }>('/products/catalog/meta'),
};
