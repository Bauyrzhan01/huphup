import { api, API_URL, getToken, uploadApi } from './client';
import type {
  AnalyzeResult,
  Attachment,
  Company,
  CompanyMember,
  CompanyProductsResponse,
  ConversationItem,
  InviteCreated,
  InvitePreview,
  Lead,
  MessageItem,
  MessagesPageResponse,
  NotificationItem,
  Offer,
  PaginatedResponse,
  Product,
  ProductImage,
  ProductReview,
  PublishResult,
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
  forgotPassword: (email: string) =>
    api<{ ok: boolean; message: string; resetToken?: string; expiresAt?: string }>(
      '/auth/forgot-password',
      { method: 'POST', body: JSON.stringify({ email }) },
    ),
  resetPassword: (body: { token: string; newPassword: string }) =>
    api<{ ok: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export const usersApi = {
  me: () => api<User>('/users/me'),
  updateMe: (body: { fullName?: string; phone?: string }) =>
    api<User>('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api<{ ok: boolean }>('/users/me/password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export const companiesApi = {
  list: (params?: { city?: string; q?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.city) q.set('city', params.city);
    if (params?.q) q.set('q', params.q);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const suffix = q.toString() ? `?${q}` : '';
    return api<PaginatedResponse<Company>>(`/companies${suffix}`);
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
  get: (id: string) => api<Company>(`/companies/${id}`),
  products: (id: string, params?: { page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const suffix = q.toString() ? `?${q}` : '';
    return api<CompanyProductsResponse>(`/companies/${id}/products${suffix}`);
  },
};

export const productsApi = {
  mine: () => api<Product[]>('/products/mine'),
  get: (id: string) => api<Product>(`/products/${id}`),
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
  uploadImage: (productId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return uploadApi<ProductImage>(`/products/${productId}/images`, form);
  },
  removeImage: (productId: string, imageId: string) =>
    api<{ ok: boolean }>(`/products/${productId}/images/${imageId}`, {
      method: 'DELETE',
    }),
  reviews: (productId: string) =>
    api<ProductReview[]>(`/products/${productId}/reviews`),
  addReview: (productId: string, body: { rating: number; comment?: string }) =>
    api<ProductReview>(`/products/${productId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
    api<PublishResult>(`/requests/${id}/publish`, { method: 'POST' }),
  cancel: (id: string) =>
    api<RequestItem>(`/requests/${id}/cancel`, { method: 'POST' }),
  close: (id: string) =>
    api<RequestItem>(`/requests/${id}/close`, { method: 'POST' }),
};

export const attachmentsApi = {
  list: (requestId: string) =>
    api<Attachment[]>(`/requests/${requestId}/attachments`),
  upload: (requestId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return uploadApi<Attachment>(`/requests/${requestId}/attachments`, form);
  },
  remove: (requestId: string, attachmentId: string) =>
    api<{ ok: boolean }>(
      `/requests/${requestId}/attachments/${attachmentId}`,
      { method: 'DELETE' },
    ),
};

export const offersApi = {
  mine: () => api<Offer[]>('/offers/mine'),
  forCompany: () => api<Offer[]>('/offers/for-company'),
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
  reject: (id: string) =>
    api<Offer>(`/offers/${id}/reject`, { method: 'POST' }),
  withdraw: (id: string) =>
    api<Offer>(`/offers/${id}/withdraw`, { method: 'POST' }),
};

export const leadsApi = {
  list: () => api<Lead[]>('/leads'),
  view: (id: string) => api(`/leads/${id}/view`, { method: 'POST' }),
  skip: (id: string) => api<Lead>(`/leads/${id}/skip`, { method: 'POST' }),
};

export const notificationsApi = {
  list: () => api<NotificationItem[]>('/notifications'),
  read: (id: string) =>
    api<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
};

export const conversationsApi = {
  list: () => api<ConversationItem[]>('/conversations'),
  messages: (
    id: string,
    params?: { after?: string; before?: string; limit?: number },
  ) => {
    const q = new URLSearchParams();
    if (params?.after) q.set('after', params.after);
    if (params?.before) q.set('before', params.before);
    if (params?.limit) q.set('limit', String(params.limit));
    const suffix = q.toString() ? `?${q}` : '';
    return api<MessageItem[] | MessagesPageResponse>(
      `/conversations/${id}/messages${suffix}`,
    ).then((data) => {
      if (Array.isArray(data)) {
        return { items: data, hasMore: false, nextCursor: null };
      }
      return {
        items: data.items ?? [],
        hasMore: Boolean(data.hasMore),
        nextCursor: data.nextCursor ?? null,
      };
    });
  },
  send: (id: string, body: string) =>
    api<MessageItem>(`/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  subscribeStream: (
    conversationId: string,
    onMessage: (msg: MessageItem) => void,
  ): (() => void) => {
    const token = getToken();
    if (!token) return () => {};
    const url = `${API_URL}/conversations/${conversationId}/stream?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data) as MessageItem);
      } catch {
        /* ignore malformed events */
      }
    };
    return () => es.close();
  },
};
