import { api } from './client';

export type Message = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string; role: string };
  attachments?: { id: string; fileName: string; fileUrl: string }[];
};

export type Conversation = {
  id: string;
  updatedAt: string;
  request?: { id: string; code: string; title: string } | null;
  messages: { id: string; body: string; createdAt: string }[];
  participants?: { id: string; fullName: string; role: string; companyName: string | null }[];
};

type MessagesPage = { items: Message[]; hasMore: boolean; nextCursor: string | null };

const PAGE = 100;

export const chatApi = {
  list: () => api<Conversation[]>('/conversations'),
  send: (id: string, body: string) =>
    api<Message>(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  /** Messages after `after` (oldest first); without a cursor the API starts from the very first one. */
  after: async (id: string, after?: string) => {
    const all: Message[] = [];
    let cursor = after;
    // The API pages forward from the cursor, so keep going until the newest message.
    for (;;) {
      const q = new URLSearchParams({ limit: String(PAGE) });
      if (cursor) q.set('after', cursor);
      const page = await api<MessagesPage | Message[]>(`/conversations/${id}/messages?${q.toString()}`);
      const items = Array.isArray(page) ? page : page.items;
      all.push(...items);
      if (Array.isArray(page) || !page.hasMore || !items.length) return all;
      cursor = items[items.length - 1].id;
    }
  },
};
