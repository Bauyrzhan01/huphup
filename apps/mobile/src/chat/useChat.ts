import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { chatApi, type Message } from '../api/chat';
import { ApiError } from '../api/client';
import { tokenStore } from '../auth/tokenStore';
import { API_URL } from '../config';

// Socket.IO is the live channel; polling covers the gaps (socket down, app back from background).
const POLL_MS = 8000;

function merge(prev: Message[], incoming: Message[]) {
  if (!incoming.length) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  return fresh.length ? [...prev, ...fresh] : prev;
}

export function useChat(conversationId: string) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const lastId = useRef<string | undefined>(undefined);

  const add = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const next = merge(prev ?? [], incoming);
      lastId.current = next[next.length - 1]?.id ?? lastId.current;
      return next;
    });
  }, []);

  const pull = useCallback(async () => {
    try {
      add(await chatApi.after(conversationId, lastId.current));
      setError('');
    } catch (err) {
      setMessages((prev) => prev ?? []);
      setError(
        err instanceof ApiError && err.status === 403
          ? 'Нет доступа к этому чату.'
          : 'Не удалось загрузить сообщения.',
      );
    }
  }, [add, conversationId]);

  useEffect(() => {
    const first = setTimeout(() => void pull(), 0);
    const timer = setInterval(() => void pull(), POLL_MS);

    let socket: Socket | null = null;
    let closed = false;
    void tokenStore.get().then((token) => {
      if (!token || closed) return;
      socket = io(`${API_URL.replace(/\/api\/v1\/?$/, '')}/chat`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
      });
      socket.on('connect', () => socket?.emit('join', { conversationId }));
      socket.on('message:new', (msg: Message) => add([msg]));
    });

    return () => {
      closed = true;
      clearTimeout(first);
      clearInterval(timer);
      socket?.emit('leave', { conversationId });
      socket?.disconnect();
    };
  }, [add, conversationId, pull]);

  async function send(body: string) {
    const text = body.trim();
    if (!text || sending) return false;
    setSending(true);
    setError('');
    try {
      add([await chatApi.send(conversationId, text)]);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Сообщение не отправилось. Попробуйте ещё раз.');
      return false;
    } finally {
      setSending(false);
    }
  }

  return { messages, error, sending, send };
}
