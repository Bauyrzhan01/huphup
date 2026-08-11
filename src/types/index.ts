export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type CompanyProductsResponse = PaginatedResponse<
  Pick<
    Product,
    'id' | 'name' | 'description' | 'unit' | 'priceFrom' | 'currency' | 'city'
  >
> & {
  company: Pick<Company, 'id' | 'name'>;
};

export type MessagesPageResponse = {
  items: MessageItem[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type Attachment = {
  id: string;
  requestId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type UserRole = 'BUYER' | 'SUPPLIER' | 'ADMIN';

export type User = {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: UserRole;
  createdAt?: string;
  company?: Company | null;
};

export type CompanyMemberRole = 'OWNER' | 'MANAGER';

export type CompanyMember = {
  id: string;
  role?: CompanyMemberRole;
  title?: string | null;
  user: { id: string; fullName: string; email: string };
};

export type Company = {
  id: string;
  name: string;
  bin?: string | null;
  city?: string | null;
  description?: string | null;
  categories: string[];
  verified: boolean;
  rating: number;
  ownerId?: string;
  members?: CompanyMember[];
  myRole?: CompanyMemberRole;
  isOwner?: boolean;
};

export type InvitePreview = {
  company: { id: string; name: string; city?: string | null };
  expiresAt: string;
  valid: boolean;
  expired: boolean;
  used: boolean;
};

export type InviteCreated = {
  id: string;
  token: string;
  expiresAt: string;
  urlPath: string;
};

export type Product = {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  unit?: string | null;
  priceFrom?: string | number | null;
  currency: string;
  city?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RequestItem = {
  id: string;
  code: string;
  title: string;
  description: string;
  category?: string | null;
  city?: string | null;
  quantity?: string | null;
  deadline?: string | null;
  budgetMin?: string | number | null;
  budgetMax?: string | number | null;
  status: string;
  createdAt: string;
  _count?: { offers: number; leads: number };
  offers?: Offer[];
  leads?: Array<{
    id: string;
    score: number;
    status: string;
    company: Pick<Company, 'id' | 'name' | 'city' | 'verified'>;
  }>;
};

export type Offer = {
  id: string;
  requestId: string;
  price: string | number;
  currency: string;
  deliveryDays?: number | null;
  comment?: string | null;
  status: string;
  createdAt?: string;
  company: Pick<Company, 'id' | 'name' | 'city' | 'verified' | 'rating'>;
  request?: Pick<RequestItem, 'id' | 'code' | 'title' | 'city' | 'status'>;
};

export type Lead = {
  id: string;
  score: number;
  status: string;
  createdAt: string;
  request: RequestItem;
};

export type AnalyzeResult = {
  title: string;
  description: string;
  category: string;
  city: string;
  quantity: string;
  deadline: string;
  rawText: string;
};

export type NotificationPayload = {
  requestId?: string;
  offerId?: string;
  conversationId?: string;
  code?: string;
  requestCode?: string;
  requestTitle?: string;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  payload?: NotificationPayload | null;
  isRead: boolean;
  createdAt: string;
};

export type PublishResult = {
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
};

export type ConversationItem = {
  id: string;
  updatedAt: string;
  request?: { id: string; code: string; title: string } | null;
  messages: { id: string; body: string; createdAt: string }[];
  participants?: Array<{
    id: string;
    fullName: string;
    role: string;
    companyName: string | null;
  }>;
};

export type MessageItem = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string; role: string };
};
