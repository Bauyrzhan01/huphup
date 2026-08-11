import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { conversationsApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useWorkspaceMode } from '../hooks/useWorkspaceMode';
import { BuyerLayout, SupplierLayout } from '../layouts/AppLayouts';
import { useAppLocale } from '../i18n/useAppLocale';
import type { ConversationItem, MessageItem } from '../types';

type PreviewMessage = ConversationItem['messages'][number];

function previewToMessages(
  previews: PreviewMessage[],
  participants: ConversationItem['participants'],
  myId?: string,
): MessageItem[] {
  const others = (participants ?? []).filter((p) => p.id !== myId);
  const fallbackSender = others[0];
  return previews.map((m) => ({
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    sender: {
      id: fallbackSender?.id ?? 'preview',
      fullName:
        fallbackSender?.companyName ??
        fallbackSender?.fullName ??
        '—',
      role: fallbackSender?.role ?? 'SUPPLIER',
    },
  }));
}

export function ConversationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatDateTime } = useAppLocale();
  const { isSupplier } = useWorkspaceMode();
  const [searchParams] = useSearchParams();
  const Layout = isSupplier ? SupplierLayout : BuyerLayout;
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const conversationFromUrl = searchParams.get('conversationId');

  const selected = useMemo(
    () => items.find((c) => c.id === selectedId) ?? null,
    [items, selectedId],
  );

  const counterpartLabel = useMemo(() => {
    if (!selected?.participants?.length) return null;
    const others = selected.participants.filter((p) => p.id !== user?.id);
    if (others.length === 0) return null;
    return others
      .map((p) => p.companyName ?? p.fullName)
      .filter(Boolean)
      .join(', ');
  }, [selected, user?.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadList(initial = false) {
      try {
        const list = await conversationsApi.list();
        if (cancelled) return;
        setItems(list);
        setSelectedId((prev) => {
          if (conversationFromUrl && list.some((c) => c.id === conversationFromUrl)) {
            return conversationFromUrl;
          }
          return prev || list[0]?.id || '';
        });
        setError('');
      } catch (err) {
        if (!cancelled && initial) {
          setError(err instanceof Error ? err.message : t('common.error'));
        }
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    }
    void loadList(true);
    const timer = window.setInterval(() => void loadList(false), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [t, conversationFromUrl]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setHasMore(false);
      return;
    }

    let cancelled = false;
    stickToBottomRef.current = true;
    setMessagesLoading(true);

    async function loadMessages() {
      const convSnapshot = items.find((c) => c.id === selectedId);
      try {
        const res = await conversationsApi.messages(selectedId, { limit: 50 });
        if (cancelled) return;
        if (res.items.length > 0) {
          setMessages(res.items);
        } else {
          const conv = convSnapshot;
          if (conv?.messages?.length) {
            setMessages(
              previewToMessages(conv.messages, conv.participants, user?.id),
            );
          } else {
            setMessages([]);
          }
        }
        setHasMore(res.hasMore);
        setError('');
      } catch (err) {
        if (!cancelled) {
          const conv = convSnapshot;
          if (conv?.messages?.length) {
            setMessages(
              previewToMessages(conv.messages, conv.participants, user?.id),
            );
          } else {
            setMessages([]);
          }
          setError(err instanceof Error ? err.message : t('common.error'));
        }
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    }

    void loadMessages();

    const unsubscribe = conversationsApi.subscribeStream(selectedId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      stickToBottomRef.current = true;
      void conversationsApi.list().then(setItems).catch(() => {});
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedId, user?.id, t]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, selectedId]);

  async function loadOlder() {
    if (!selectedId || !messages.length || loadingOlder || !hasMore) return;
    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    setLoadingOlder(true);
    stickToBottomRef.current = false;
    const el = threadRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const res = await conversationsApi.messages(selectedId, {
        before: oldestId,
        limit: 30,
      });
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const older = res.items.filter((m) => !ids.has(m.id));
        return [...older, ...prev];
      });
      setHasMore(res.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !body.trim() || sending) return;
    setSending(true);
    try {
      const msg = await conversationsApi.send(selectedId, body.trim());
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
      stickToBottomRef.current = true;
      setBody('');
      setError('');
      const list = await conversationsApi.list();
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Layout
      fullWidth
      crumb=""
      title={t('conversations.title')}
      subtitle={
        loading
          ? t('conversations.subtitleLoading')
          : t('conversations.subtitleCount', { count: items.length })
      }
    >
      <div className="chat-shell">
        {error ? (
          <p className="notice chat-shell-notice" style={{ color: '#b45309' }}>
            {error}
          </p>
        ) : null}

        {items.length === 0 && !loading ? (
          <div className="panel chat-empty-state">
            <div className="leads-placeholder-ico">💬</div>
            <b>{t('conversations.emptyTitle')}</b>
            <p>{t('conversations.empty')}</p>
            {!isSupplier ? (
              <Link className="primary" to="/offers">
                {t('conversations.goOffers')}
              </Link>
            ) : (
              <Link className="primary" to="/supplier/leads">
                {t('conversations.goLeads')}
              </Link>
            )}
          </div>
        ) : (
          <div className="chat-workspace">
            <aside className="chat-rail card">
              <div className="leads-rail-head">
                <b>{t('conversations.inbox')}</b>
                <span>{t('conversations.inboxCount', { count: items.length })}</span>
              </div>
              {items.map((c) => {
                const active = selectedId === c.id;
                const preview = c.messages[0]?.body ?? t('conversations.noMessages');
                const others = (c.participants ?? []).filter((p) => p.id !== user?.id);
                const withLabel =
                  others.map((p) => p.companyName ?? p.fullName).filter(Boolean)[0] ??
                  null;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`chat-item${active ? ' is-active' : ''}`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="chat-avatar">
                      {(withLabel ?? c.request?.title ?? 'HH').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="chat-item-body">
                      <div className="chat-item-top">
                        <b>{c.request?.title ?? t('conversations.dialog')}</b>
                        <small>
                          {c.messages[0]
                            ? formatDateTime(c.messages[0].createdAt)
                            : ''}
                        </small>
                      </div>
                      <div className="chat-item-meta">
                        <span className="lead-code">
                          {c.request?.code ?? c.id.slice(0, 8)}
                        </span>
                        {withLabel ? (
                          <span className="chip soft" style={{ marginLeft: 6 }}>
                            {withLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className="chat-preview">{preview}</p>
                    </div>
                  </button>
                );
              })}
            </aside>

            <section className="chat-panel panel">
              {selected ? (
                <>
                  <header className="chat-panel-head">
                    <div>
                      <div className="lead-hero-chips">
                        <span className="chip-strong">
                          {selected.request?.code ?? '—'}
                        </span>
                        <span className="chip soft">{t('conversations.live')}</span>
                        {counterpartLabel ? (
                          <span className="chip soft">{counterpartLabel}</span>
                        ) : null}
                      </div>
                      <h2>{selected.request?.title ?? t('conversations.dialog')}</h2>
                      <p className="meta" style={{ margin: '6px 0 0' }}>
                        {counterpartLabel
                          ? t('conversations.withPartner', { name: counterpartLabel })
                          : t('conversations.threadHint')}
                      </p>
                    </div>
                    {selected.request?.id ? (
                      <Link
                        className="ghost"
                        to={
                          isSupplier
                            ? '/supplier/leads'
                            : `/requests/${selected.request.id}`
                        }
                      >
                        {t('conversations.openRequest')}
                      </Link>
                    ) : null}
                  </header>

                  <div
                    className="chat-thread"
                    ref={threadRef}
                    onScroll={() => {
                      const el = threadRef.current;
                      if (!el) return;
                      stickToBottomRef.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                    }}
                  >
                    {hasMore ? (
                      <div className="chat-load-older">
                        <button
                          type="button"
                          className="ghost"
                          disabled={loadingOlder}
                          onClick={() => void loadOlder()}
                        >
                          {loadingOlder
                            ? t('common.loading')
                            : t('conversations.loadOlder')}
                        </button>
                      </div>
                    ) : null}

                    {messagesLoading ? (
                      <div className="chat-thread-empty">
                        <b>{t('common.loading')}</b>
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="chat-thread-empty">
                        <b>{t('conversations.noMessagesYet')}</b>
                        <p>{t('conversations.startHint')}</p>
                        {counterpartLabel ? (
                          <p className="meta">{t('conversations.partnerWaiting', { name: counterpartLabel })}</p>
                        ) : null}
                      </div>
                    ) : (
                      messages.map((m) => {
                        const mine = m.sender.id === user?.id;
                        return (
                          <div
                            key={m.id}
                            className={`bubble-row${mine ? ' is-mine' : ''}`}
                          >
                            {!mine ? (
                              <div className="bubble-avatar">
                                {m.sender.fullName.slice(0, 1).toUpperCase()}
                              </div>
                            ) : null}
                            <div className={`bubble${mine ? ' mine' : ''}`}>
                              {!mine ? (
                                <div className="bubble-name">{m.sender.fullName}</div>
                              ) : null}
                              <div className="bubble-text">{m.body}</div>
                              <div className="bubble-time">
                                {formatDateTime(m.createdAt)}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <form className="chat-composer" onSubmit={(e) => void send(e)}>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={t('conversations.placeholder')}
                      rows={2}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void send(e as unknown as FormEvent);
                        }
                      }}
                      required
                    />
                    <button className="primary" disabled={sending || !body.trim()}>
                      {sending ? t('conversations.sending') : t('common.send')}
                    </button>
                  </form>
                </>
              ) : (
                <div className="chat-thread-empty">
                  <b>{t('conversations.selectDialog')}</b>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </Layout>
  );
}
