import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ImageIcon, MessageSquare, Paperclip } from 'lucide-react';
import { conversationsApi } from '../api';
import { resolveMediaUrl } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import { UserAvatar } from '../components/UserAvatar';
import { useWorkspaceMode } from '../hooks/useWorkspaceMode';
import { BuyerLayout, SupplierLayout } from '../layouts/AppLayouts';
import { useAppLocale } from '../i18n/useAppLocale';
import type { ConversationItem, MessageAttachment, MessageItem } from '../types';

type PreviewMessage = ConversationItem['messages'][number];

function formatFileSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAttachment(att: MessageAttachment) {
  if (att.mimeType?.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(att.fileName || att.fileUrl || '');
}

function ChatImage({ att, href }: { att: MessageAttachment; href: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="bubble-attachment-file">
        <AppIcon icon={ImageIcon} className="bubble-attachment-icon" size={20} />
        <span className="bubble-attachment-meta">
          <b>{att.fileName}</b>
        </span>
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="bubble-attachment-image-link">
      <img
        src={href}
        alt={att.fileName}
        className="bubble-attachment-image"
        onError={() => setBroken(true)}
      />
    </a>
  );
}

function MessageAttachments({
  attachments,
  mine,
}: {
  attachments: MessageAttachment[];
  mine: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <div className="bubble-attachments">
      {attachments.map((att) => {
        const href = resolveMediaUrl(att.fileUrl);
        if (isImageAttachment(att)) {
          return <ChatImage key={att.id} att={att} href={href} />;
        }
        return (
          <a
            key={att.id}
            href={href}
            target="_blank"
            rel="noreferrer"
            className={`bubble-attachment-file${mine ? ' is-mine' : ''}`}
          >
            <AppIcon icon={Paperclip} className="bubble-attachment-icon" size={20} />
            <span className="bubble-attachment-meta">
              <b>{att.fileName}</b>
              {att.sizeBytes ? <small>{formatFileSize(att.sizeBytes)}</small> : null}
            </span>
          </a>
        );
      })}
    </div>
  );
}

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
      avatarUrl: fallbackSender?.avatarUrl ?? null,
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

    function refreshOnVisible() {
      if (document.visibilityState === 'visible') {
        void loadList(false);
      }
    }

    window.addEventListener('focus', refreshOnVisible);
    document.addEventListener('visibilitychange', refreshOnVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshOnVisible);
      document.removeEventListener('visibilitychange', refreshOnVisible);
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

    const convSnapshot = items.find((c) => c.id === selectedId);
    if (convSnapshot?.messages?.length) {
      setMessages(
        previewToMessages(convSnapshot.messages, convSnapshot.participants, user?.id),
      );
      setMessagesLoading(false);
    } else {
      setMessagesLoading(true);
    }

    async function loadMessages() {
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
    if (!selectedId || sending) return;
    const text = body.trim();
    if (!text && !pendingFile) return;
    setSending(true);
    try {
      const msg = pendingFile
        ? await conversationsApi.sendWithFile(selectedId, pendingFile, text || undefined)
        : await conversationsApi.send(selectedId, text);
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
      stickToBottomRef.current = true;
      setBody('');
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('');
      const list = await conversationsApi.list();
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSending(false);
    }
  }

  function onPickFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError(t('conversations.fileTooLarge'));
      return;
    }
    setError('');
    setPendingFile(file);
  }

  const canSend = Boolean(body.trim() || pendingFile);

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
            <div className="leads-placeholder-ico">
              <AppIcon icon={MessageSquare} size={32} strokeWidth={1.5} />
            </div>
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
                const other = others[0];
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`chat-item${active ? ' is-active' : ''}`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <UserAvatar
                      name={other?.fullName ?? withLabel ?? c.request?.title ?? 'HH'}
                      avatarUrl={other?.avatarUrl}
                      className="chat-avatar"
                    />
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

                    <div className="chat-messages">
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
                                <UserAvatar
                                  name={m.sender.fullName}
                                  avatarUrl={m.sender.avatarUrl}
                                  className="bubble-avatar"
                                />
                              ) : (
                                <UserAvatar
                                  name={user?.fullName ?? 'U'}
                                  avatarUrl={user?.avatarUrl}
                                  className="bubble-avatar"
                                />
                              )}
                              <div className={`bubble${mine ? ' mine' : ''}`}>
                              {!mine ? (
                                <div className="bubble-name">{m.sender.fullName}</div>
                              ) : null}
                              {m.attachments?.length ? (
                                <MessageAttachments attachments={m.attachments} mine={mine} />
                              ) : null}
                              {m.body ? <div className="bubble-text">{m.body}</div> : null}
                                <div className="bubble-time">
                                  {formatDateTime(m.createdAt)}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <form className="chat-composer" onSubmit={(e) => void send(e)}>
                    {pendingFile ? (
                      <div className="chat-pending-file">
                        <span className="chat-pending-file-name">
                          <AppIcon icon={Paperclip} size={16} className="chat-pending-file-icon" />
                          {pendingFile.name}
                          <small>{formatFileSize(pendingFile.size)}</small>
                        </span>
                        <button
                          type="button"
                          className="ghost chat-pending-file-remove"
                          onClick={() => {
                            setPendingFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                        >
                          {t('conversations.removeFile')}
                        </button>
                      </div>
                    ) : null}
                    <div className="chat-composer-row">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
                        style={{ display: 'none' }}
                        onChange={(e) => onPickFile(e.target.files)}
                      />
                      <button
                        type="button"
                        className="chat-attach-btn"
                        aria-label={t('conversations.attachFile')}
                        disabled={sending}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <AppIcon icon={Paperclip} size={18} />
                      </button>
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder={t('conversations.placeholder')}
                        rows={1}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void send(e as unknown as FormEvent);
                          }
                        }}
                      />
                      <button
                        className="primary chat-composer-send"
                        disabled={sending || !canSend}
                      >
                        {sending ? t('conversations.sending') : t('common.send')}
                      </button>
                    </div>
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
