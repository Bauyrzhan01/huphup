export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PublicProduct = Pick<
  Product,
  | 'id'
  | 'name'
  | 'description'
  | 'unit'
  | 'city'
  | 'images'
  | 'avgRating'
  | 'reviewCount'
>;

export type CompanyProductsResponse = PaginatedResponse<PublicProduct> & {
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
  avatarUrl?: string | null;
  lastSeenAt?: string | null;
  role: UserRole;
  createdAt?: string;
  company?: Company | null;
};

export type CompanyMemberRole = 'OWNER' | 'MANAGER';

export type CompanyMember = {
  id: string;
  role?: CompanyMemberRole;
  title?: string | null;
  createdAt?: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    phone?: string | null;
    avatarUrl?: string | null;
    lastSeenAt?: string | null;
    createdAt?: string;
  };
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
  createdAt?: string;
  logoUrl?: string | null;
  avatarUrl?: string | null;
  owner?: { id: string; fullName: string; email?: string; avatarUrl?: string | null };
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

export type ProductImage = {
  id: string;
  url: string;
  sortOrder: number;
};

export type ProductReview = {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; fullName: string };
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
  images?: ProductImage[];
  avgRating?: number | null;
  reviewCount?: number;
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
  rawText?: string | null;
  isFavorite?: boolean;
  hiddenAt?: string | null;
  _count?: { offers: number; leads: number };
  offers?: Offer[];
  leads?: Array<{
    id: string;
    score: number;
    status: string;
    productId?: string | null;
    company: Pick<Company, 'id' | 'name' | 'city' | 'verified' | 'avatarUrl'>;
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
  company: Pick<Company, 'id' | 'name' | 'city' | 'verified' | 'rating' | 'avatarUrl'>;
  request?: Pick<RequestItem, 'id' | 'code' | 'title' | 'city' | 'status'>;
};

export type LeadUser = {
  id: string;
  fullName: string;
  email?: string;
  avatarUrl?: string | null;
  lastSeenAt?: string | null;
};

export type LeadIdleState = 'idle' | 'unassigned' | 'overdue' | null;

export type Lead = {
  id: string;
  score: number;
  status: string;
  matchReason?: string | null;
  createdAt: string;
  claimedAt?: string | null;
  assigneeId?: string | null;
  lastActorId?: string | null;
  nextStepAt?: string | null;
  nextStepText?: string | null;
  statusChangedAt?: string;
  idleState?: LeadIdleState;
  assignee?: LeadUser | null;
  lastActor?: LeadUser | null;
  request: RequestItem;
};

export type LeadActivity = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  meta?: Record<string, unknown> | null;
  user?: LeadUser | null;
};

export type LeadNote = {
  id: string;
  body: string;
  createdAt: string;
  user: LeadUser;
};

export type CrmStage = {
  id: string;
  status: string;
  label: string;
  sortOrder: number;
  color?: string | null;
};

export type CrmAutomationRule = {
  id: string;
  trigger: string;
  action: string;
  enabled: boolean;
  config?: Record<string, unknown>;
};

export type CrmAnalytics = {
  total: number;
  byStatus: Record<string, number>;
  conversionRate: number;
  viewRate: number;
  avgResponseHours: number | null;
  idleCount: number;
  overdueCount: number;
  byAssignee: Array<{
    userId: string;
    name: string;
    total: number;
    offered: number;
  }>;
};

export type AnalyzeQuestion = {
  id: string;
  field: string;
  question: string;
  placeholder?: string;
  options?: string[];
};

export type AnalyzeItem = {
  name: string;
  quantity: string;
  specs: string;
  city: string;
};

export type AnalyzeResult = {
  title: string;
  description: string;
  category: string;
  city: string;
  quantity: string;
  deadline: string;
  rawText: string;
  understanding?: string;
  assistantMessage?: string;
  items?: AnalyzeItem[];
  questions?: AnalyzeQuestion[];
  ready?: boolean;
  ackOnly?: boolean;
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
    avatarUrl?: string | null;
    score: number;
    reason?: string;
    productId?: string;
  }>;
};

export type ConversationItem = {
  id: string;
  updatedAt: string;
  isPinned?: boolean;
  request?: { id: string; code: string; title: string } | null;
  messages: { id: string; body: string; createdAt: string }[];
  participants?: Array<{
    id: string;
    fullName: string;
    role: string;
    companyName: string | null;
    avatarUrl?: string | null;
  }>;
};

export type MessageAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: string;
};

export type MessageItem = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string; role: string; avatarUrl?: string | null };
  attachments?: MessageAttachment[];
};
