import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Paperclip, Send, X } from 'lucide-react';
import { attachmentsApi, requestsApi } from '../../api';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { AppIcon } from '../../components/AppIcon';
import { MatchedSupplierCard } from '../../components/MatchedSupplierCard';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { useDirectoryMeta } from '../../hooks/useDirectoryMeta';
import {
  homeChatKey,
  LEGACY_HOME_CHAT_KEY,
} from '../../utils/homeChatStorage';
import { shouldSkipAssistantReply } from '../../utils/requestChat';
import type { AnalyzeResult, PublishResult, RequestItem } from '../../types';

const MAX_DRAFT_FILES = 5;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function todayIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Показываем выбранную дату на пилюле как ДД.ММ.ГГГГ; если это не
// ISO-дата (старое значение или AI написал текстом), просто выводим как есть.
function formatDeadlineDisplay(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

type ChatTurn = {
  role: 'user' | 'assistant';
  text: string;
  options?: string[];
};

export function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { cities } = useDirectoryMeta();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [originalText, setOriginalText] = useState('');
  const [analyzed, setAnalyzed] = useState<AnalyzeResult | null>(null);
  const [city, setCity] = useState('');
  const [deadline, setDeadline] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [collectedAnswers, setCollectedAnswers] = useState<
    Array<{ id: string; answer: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // Ручной выбор пользователя — приоритетнее того, что распознает ИИ из текста.
  const cityIsManual = useRef(false);
  const deadlineIsManual = useRef(false);

  const [openTool, setOpenTool] = useState<'city' | 'deadline' | null>(null);
  const [cityDraft, setCityDraft] = useState('');
  const [deadlineDraft, setDeadlineDraft] = useState('');
  const toolPopoverRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');

  const ready = Boolean(analyzed?.ready || (analyzed && !(analyzed.questions ?? []).length));

  function errorText(err: unknown) {
    if (err instanceof ApiError) {
      if (err.message === 'network') return t('requests.networkError');
      if (err.message === 'timeout') return t('requests.timeoutError');
    }
    if (err instanceof Error && /failed to fetch/i.test(err.message)) {
      return t('requests.networkError');
    }
    return err instanceof Error ? err.message : t('common.error');
  }

  useEffect(() => {
    sessionStorage.removeItem(LEGACY_HOME_CHAT_KEY);
    if (!user?.id) return;

    try {
      const raw = sessionStorage.getItem(homeChatKey(user.id));
      if (!raw) {
        startedRef.current = false;
        setChat([]);
        setOriginalText('');
        setAnalyzed(null);
        setCollectedAnswers([]);
        setTitle('');
        setDescription('');
        setCity('');
        setDeadline('');
        cityIsManual.current = false;
        deadlineIsManual.current = false;
        setPublishResult(null);
        return;
      }
      const saved = JSON.parse(raw) as {
        chat?: ChatTurn[];
        originalText?: string;
        analyzed?: AnalyzeResult | null;
        answers?: Array<{ id: string; answer: string }>;
        title?: string;
        description?: string;
        city?: string;
        deadline?: string;
      };
      if (saved.chat?.length) {
        startedRef.current = true;
        setChat(saved.chat);
        setOriginalText(saved.originalText ?? '');
        setAnalyzed(saved.analyzed ?? null);
        setCollectedAnswers(saved.answers ?? []);
        setTitle(saved.title ?? '');
        setDescription(saved.description ?? '');
        setCity(saved.city || '');
        setDeadline(saved.deadline || '');
      }
    } catch {
      sessionStorage.removeItem(homeChatKey(user.id));
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !chat.length) return;
    sessionStorage.setItem(
      homeChatKey(user.id),
      JSON.stringify({
        chat,
        originalText,
        analyzed,
        answers: collectedAnswers,
        title,
        description,
        city,
        deadline,
      }),
    );
  }, [
    user?.id,
    chat,
    originalText,
    analyzed,
    collectedAnswers,
    title,
    description,
    city,
    deadline,
  ]);

  // Закрыть попап выбора города/срока по клику снаружи или по Escape.
  useEffect(() => {
    if (!openTool) return;
    function onPointerDown(e: PointerEvent) {
      if (!toolPopoverRef.current?.contains(e.target as Node)) {
        setOpenTool(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenTool(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openTool]);

  useEffect(() => {
    void requestsApi
      .list()
      .then((list) => setRecent(list.slice(0, 3)))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, busy]);

  useEffect(() => {
    const draft = sessionStorage.getItem('huphupDraft')?.trim();
    if (!draft || startedRef.current) return;
    sessionStorage.removeItem('huphupDraft');
    setQ('');
    void startConversation(draft);
  }, []);

  async function startConversation(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    startedRef.current = true;
    setOriginalText(trimmed);
    setChat([{ role: 'user', text: trimmed }]);
    setQ('');
    setBusy(true);
    setError('');
    try {
      const res = await requestsApi.analyze(trimmed);
      setAnalyzed(res);
      setTitle(res.title);
      if (!cityIsManual.current) setCity(res.city || '');
      if (!deadlineIsManual.current) setDeadline(res.deadline || '');
      setDescription(res.description || trimmed);
      const ask = res.questions?.[0];
      setChat([
        { role: 'user', text: trimmed },
        {
          role: 'assistant',
          text:
            res.assistantMessage ||
            ask?.question ||
            t('requests.chatReady'),
          options: res.ready || !ask ? undefined : ask.options,
        },
      ]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(reply: string) {
    const trimmed = reply.trim();
    if (!trimmed || busy) return;
    if (!originalText) {
      await startConversation(trimmed);
      return;
    }
    const current = analyzed?.questions?.[0];
    const nextAnswers = [
      ...collectedAnswers,
      { id: current?.id ?? `a${collectedAnswers.length + 1}`, answer: trimmed },
    ];
    const nextChat: ChatTurn[] = [...chat, { role: 'user', text: trimmed }];
    const userText = nextChat
      .filter((m) => m.role === 'user')
      .map((m) => m.text)
      .join('\n');
    setCollectedAnswers(nextAnswers);
    setChat(nextChat);
    setOriginalText(userText);
    setQ('');
    setBusy(true);
    setError('');
    try {
      const res = await requestsApi.clarify(
        userText,
        nextAnswers,
        analyzed,
        nextChat.map((m) => ({ role: m.role, content: m.text })),
      );
      setAnalyzed(res);
      setTitle(res.title);
      if (!cityIsManual.current) setCity(res.city || city || '');
      if (!deadlineIsManual.current) setDeadline(res.deadline || deadline || '');
      setDescription(res.description || originalText);
      const ask = res.questions?.[0];
      const done = res.ready === true || !ask;
      const assistantText = res.ackOnly
        ? ''
        : done
          ? res.assistantMessage || t('requests.chatReady')
          : res.assistantMessage || ask?.question || t('requests.chatReady');
      const lastAssistant = [...nextChat]
        .reverse()
        .find((m) => m.role === 'assistant');
      const skipAssistant =
        res.ackOnly ||
        shouldSkipAssistantReply(lastAssistant?.text, assistantText, done);
      setChat([
        ...nextChat,
        ...(skipAssistant
          ? []
          : [
              {
                role: 'assistant' as const,
                text: assistantText,
                options: done ? undefined : ask?.options,
              },
            ]),
      ]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (busy || !description.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await requestsApi.create({
        title: title || analyzed?.title || originalText.slice(0, 80),
        description: description.trim() || originalText,
        category: analyzed?.category,
        city,
        quantity: analyzed?.quantity,
        deadline: deadline || analyzed?.deadline,
        rawText: originalText,
      });
      // Файлы прикреплены к черновику ещё до того, как у заявки появился id —
      // грузим их сейчас. Одна неудачная загрузка не должна откатывать уже
      // созданную и готовую к публикации заявку.
      if (files.length) {
        const failed: string[] = [];
        for (const file of files) {
          try {
            await attachmentsApi.upload(created.id, file);
          } catch {
            failed.push(file.name);
          }
        }
        if (failed.length) {
          setFileError(t('home.fileUploadFailed', { files: failed.join(', ') }));
        }
        setFiles([]);
      }
      const result = await requestsApi.publish(created.id);
      setPublishResult(result);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function resetChat() {
    startedRef.current = false;
    if (user?.id) sessionStorage.removeItem(homeChatKey(user.id));
    sessionStorage.removeItem(LEGACY_HOME_CHAT_KEY);
    setChat([]);
    setAnalyzed(null);
    setCollectedAnswers([]);
    setOriginalText('');
    setDescription('');
    setTitle('');
    setQ('');
    setError('');
    setPublishResult(null);
    // Файлы — не переносим на новую заявку, город и срок оставляем: часто
    // следующая заявка от того же покупателя про тот же город и срок.
    setFiles([]);
    setFileError('');
    setOpenTool(null);
  }

  function retryLast() {
    const lastUser = [...chat].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    if (chat.filter((m) => m.role === 'user').length <= 1) {
      startedRef.current = false;
      setOriginalText('');
      void startConversation(lastUser.text);
      return;
    }
    setChat((prev) => {
      const copy = [...prev];
      if (copy[copy.length - 1]?.role === 'user') copy.pop();
      return copy;
    });
    void sendChat(lastUser.text);
  }

  function onPickFiles(list: FileList | null) {
    if (!list?.length) return;
    setFileError('');
    setFiles((prev) => {
      const room = MAX_DRAFT_FILES - prev.length;
      if (room <= 0) {
        setFileError(t('home.fileLimit', { count: MAX_DRAFT_FILES }));
        return prev;
      }
      const picked = Array.from(list).slice(0, room);
      if (list.length > picked.length) {
        setFileError(t('home.fileLimit', { count: MAX_DRAFT_FILES }));
      }
      return [...prev, ...picked];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function openToolPopover(tool: 'city' | 'deadline') {
    if (openTool === tool) {
      setOpenTool(null);
      return;
    }
    setCityDraft(city);
    setDeadlineDraft(deadline);
    setOpenTool(tool);
  }

  function confirmCity() {
    setCity(cityDraft.trim());
    cityIsManual.current = true;
    setOpenTool(null);
  }

  function confirmDeadline() {
    setDeadline(deadlineDraft.trim());
    deadlineIsManual.current = true;
    setOpenTool(null);
  }

  if (publishResult) {
    const { request, leadsCreated, matchedSuppliers } = publishResult;
    return (
      <BuyerLayout crumb={t('nav.businessCrumb')}>
        <div className="page">
          <div className="page-head">
            <div>
              <h1>{t('requests.publishSuccessTitle')}</h1>
              <p>{t('requests.publishSuccessSubtitle', { code: request.code })}</p>
            </div>
          </div>
          <div className="panel publish-result">
            <div className="lead-hero-chips">
              <span className="chip-strong">{request.code}</span>
              <span className="chip soft">
                {t('requests.matchedSuppliers', { count: leadsCreated })}
              </span>
            </div>
            <p className="meta" style={{ margin: '12px 0 16px' }}>
              {t('requests.matchedHint')}
            </p>
            {matchedSuppliers.length === 0 ? (
              <p className="assist-note">{t('requests.matchedEmpty')}</p>
            ) : (
              <div className="matched-list">
                {matchedSuppliers.map((m) => (
                  <MatchedSupplierCard
                    key={m.companyId}
                    companyId={m.companyId}
                    companyName={m.companyName}
                    city={m.city}
                    avatarUrl={m.avatarUrl}
                    score={m.score}
                    reason={m.reason}
                    highlightProductId={m.productId}
                  />
                ))}
              </div>
            )}
            <div className="actions">
              <Link className="primary" to={`/requests/${request.id}`}>
                {t('requests.viewRequest')}
              </Link>
              <button type="button" className="ghost" onClick={resetChat}>
                {t('nav.newRequest')}
              </button>
            </div>
          </div>
        </div>
      </BuyerLayout>
    );
  }

  const chatting = chat.length > 0;
  const compactReady = chatting && ready && !q.trim();

  return (
    <BuyerLayout crumb={t('nav.businessCrumb')}>
      <section className={`home-shell${chatting ? ' is-chatting' : ''}`}>
        <div className="home-center">
          {chatting ? null : <h1>{t('home.title')}</h1>}

          {chatting ? (
            <div className="home-chat">
              <div className="clarify-thread" ref={threadRef}>
                {chat.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={`clarify-bubble-row${m.role === 'user' ? ' is-mine' : ''}`}
                  >
                    <div className={`clarify-bubble${m.role === 'user' ? ' is-mine' : ''}`}>
                      {m.text}
                    </div>
                    {m.role === 'assistant' &&
                    m.options?.length &&
                    i === chat.length - 1 &&
                    !busy &&
                    !ready ? (
                      <div className="clarify-options">
                        {m.options.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            className="tool-pill"
                            onClick={() => void sendChat(opt)}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {busy ? (
                  <div className="clarify-bubble-row">
                    <div className="clarify-bubble is-typing">{t('requests.chatTyping')}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={`composer${chatting ? ' is-chat' : ''}${compactReady ? ' is-ready' : ''}`}>
            {compactReady ? (
              <p className="composer-ready-note">{t('requests.chatReady')}</p>
            ) : null}
            <textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                chatting ? t('requests.chatPlaceholder') : t('home.placeholder')
              }
              disabled={busy}
              rows={compactReady ? 1 : chatting ? 2 : 3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendChat(q);
                }
              }}
            />

            {!chatting && files.length > 0 ? (
              <div className="draft-files">
                {files.map((file, i) => (
                  <span key={`${file.name}-${i}`} className="file-chip">
                    <Paperclip size={12} className="ico" />
                    <span className="file-chip-name">{file.name}</span>
                    <span className="file-chip-size">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      className="file-chip-remove"
                      onClick={() => removeFile(i)}
                      aria-label={t('common.remove')}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {fileError ? <p className="draft-file-error">{fileError}</p> : null}

            <div className="composer-footer">
              <div className="composer-tools">
                {chatting ? (
                  <button type="button" className="tool-pill" onClick={resetChat}>
                    {t('nav.newRequest')}
                  </button>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => onPickFiles(e.target.files)}
                    />
                    <button
                      type="button"
                      className={`tool-pill${files.length ? ' is-on' : ''}`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {files.length
                        ? t('home.fileCount', { count: files.length })
                        : t('home.file')}
                    </button>

                    <div className="tool-pill-wrap">
                      <button
                        type="button"
                        className={`tool-pill${city ? ' is-on' : ''}`}
                        onClick={() => openToolPopover('city')}
                      >
                        {city ? `⌖ ${city}` : t('home.city')}
                      </button>
                      {openTool === 'city' ? (
                        <div className="tool-popover" ref={toolPopoverRef}>
                          <input
                            autoFocus
                            value={cityDraft}
                            onChange={(e) => setCityDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                confirmCity();
                              }
                            }}
                            list="home-cities"
                            placeholder={t('home.cityPlaceholder')}
                          />
                          <datalist id="home-cities">
                            {cities.map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                          <button type="button" className="tool-popover-ok" onClick={confirmCity}>
                            {t('common.ok')}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="tool-pill-wrap">
                      <button
                        type="button"
                        className={`tool-pill${deadline ? ' is-on' : ''}`}
                        onClick={() => openToolPopover('deadline')}
                      >
                        {deadline ? `◷ ${formatDeadlineDisplay(deadline)}` : t('home.deadline')}
                      </button>
                      {openTool === 'deadline' ? (
                        <div className="tool-popover" ref={toolPopoverRef}>
                          <input
                            autoFocus
                            type="date"
                            min={todayIso()}
                            value={deadlineDraft}
                            onChange={(e) => setDeadlineDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                confirmDeadline();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="tool-popover-ok"
                            onClick={confirmDeadline}
                          >
                            {t('common.ok')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
              {q.trim() ? (
                <button
                  type="button"
                  className="send"
                  onClick={() => void sendChat(q)}
                  disabled={busy}
                  aria-label={t('common.send')}
                >
                  <AppIcon icon={Send} className="send-icon" size={18} />
                </button>
              ) : ready && chatting ? (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void onPublish()}
                >
                  {busy ? t('requests.publishing') : t('requests.publish')}
                </button>
              ) : (
                <button
                  type="button"
                  className="send"
                  onClick={() => void sendChat(q)}
                  disabled={busy || !q.trim()}
                  aria-label={t('common.send')}
                >
                  <AppIcon icon={Send} className="send-icon" size={18} />
                </button>
              )}
            </div>
          </div>

          {error ? (
            <div className="home-chat-error">
              <p>{error}</p>
              <button type="button" className="ghost" onClick={retryLast} disabled={busy}>
                {t('requests.retry')}
              </button>
            </div>
          ) : null}

          {chatting ? null : loading ? (
            <div className="assist-note">{t('common.loading')}</div>
          ) : recent.length > 0 ? (
            <>
              <div className="assist-note" style={{ marginBottom: 8 }}>
                {t('home.recentTitle')}
              </div>
              <div className="suggestions">
                {recent.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="suggestion"
                    onClick={() => navigate(`/requests/${r.id}`)}
                  >
                    <b>{r.code}</b>
                    {r.title}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="panel home-empty-hint">
              <p>{t('home.emptyHint')}</p>
            </div>
          )}
        </div>
      </section>
    </BuyerLayout>
  );
}
