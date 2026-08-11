import { api } from './client';
import type {
  AnalyzeResult,
  Company,
  CompanyMember,
  ConversationItem,
  InviteCreated,
  InvitePreview,
  Lead,
  MessageItem,
  NotificationItem,
  Offer,
  Product,
  RequestItem,
  User,
} from '../types';

export const authApi = {
  register: (body: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role?: 'BUYER' | 'SUPPLIER';
  }) =>
    api<{ user: User; accessToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    api<{ user: User; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export const usersApi = {
  me: () => api<User>('/users/me'),
  updateMe: (body: { fullName?: string; phone?: string }) =>
    api<User>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
};

export const companiesApi = {
  list: (params?: { city?: string; q?: string }) => {
    const q = new URLSearchParams();
    if (params?.city) q.set('city', params.city);
    if (params?.q) q.set('q', params.q);
    const suffix = q.toString() ? `?${q}` : '';
    return api<Company[]>(`/companies${suffix}`);
  },
  me: () => api<Company>('/companies/me'),
  members: () => api<CompanyMember[]>('/companies/me/members'),
  removeMember: (userId: string) =>
    api<{ ok: boolean }>(`/companies/me/members/${userId}`, {
      method: 'DELETE',
    }),
  createInvite: (body?: { expiresInHours?: number }) =>
    api<InviteCreated>('/companies/me/invites', {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  create: (body: {
    name: string;
    city?: string;
    description?: string;
    categories?: string[];
    bin?: string;
  }) =>
    api<Company>('/companies', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    api<Company>(`/companies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

export const productsApi = {
  mine: () => api<Product[]>('/products/mine'),
  create: (body: {
    name: string;
    description?: string;
    unit?: string;
    priceFrom?: number;
    currency?: string;
    city?: string;
  }) =>
    api<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
  update: (
    id: string,
    body: {
      name?: string;
      description?: string;
      unit?: string;
      priceFrom?: number;
      currency?: string;
      city?: string;
      isActive?: boolean;
    },
  ) =>
    api<Product>(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    api<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
};

export const invitesApi = {
  get: (token: string) => api<InvitePreview>(`/invites/${token}`),
  accept: (token: string) =>
    api<{ ok: boolean; companyId: string; alreadyMember: boolean }>(
      `/invites/${token}/accept`,
      { method: 'POST' },
    ),
};

export const requestsApi = {
  analyze: (text: string) =>
    api<AnalyzeResult>('/requests/analyze', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  list: () => api<RequestItem[]>('/requests'),
  get: (id: string) => api<RequestItem>(`/requests/${id}`),
  create: (body: Record<string, unknown>) =>
    api<RequestItem>('/requests', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Record<string, unknown>) =>
    api<RequestItem>(`/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  publish: (id: string) =>
    api<{
      request: RequestItem;
      leadsCreated: number;
      matchedSuppliers: Array<{
        companyId: string;
        companyName: string;
        city: string | null;
        score: number;
        reason?: string;
        productId?: string;
      }>;
    }>(`/requests/${id}/publish`, { method: 'POST' }),
};

export const offersApi = {
  mine: () => api<Offer[]>('/offers/mine'),
  byRequest: (requestId: string) =>
    api<Offer[]>(`/offers/by-request/${requestId}`),
  create: (body: {
    requestId: string;
    price: number;
    currency?: string;
    deliveryDays?: number;
    comment?: string;
  }) =>
    api<Offer>('/offers', { method: 'POST', body: JSON.stringify(body) }),
  accept: (id: string) =>
    api<{ offerId: string; conversationId: string }>(`/offers/${id}/accept`, {
      method: 'POST',
    }),
};

export const leadsApi = {
  list: () => api<Lead[]>('/leads'),
  view: (id: string) => api(`/leads/${id}/view`, { method: 'POST' }),
};

export const notificationsApi = {
  list: () => api<NotificationItem[]>('/notifications'),
  read: (id: string) =>
    api<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
};

export const conversationsApi = {
  list: () => api<ConversationItem[]>('/conversations'),
  messages: (id: string) => api<MessageItem[]>(`/conversations/${id}/messages`),
  send: (id: string, body: string) =>
    api<MessageItem>(`/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
};
