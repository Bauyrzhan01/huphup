import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestsApi } from '../../api';
import { ApiError } from '../../api/client';
import { MatchedSupplierCard } from '../../components/MatchedSupplierCard';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { shouldSkipAssistantReply } from '../../utils/requestChat';
import type { AnalyzeResult, PublishResult, RequestItem } from '../../types';

const HOME_CHAT_KEY = 'huphup_home_chat';

type ChatTurn = {
  role: 'user' | 'assistant';
  text: string;
  options?: string[];
};

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [originalText, setOriginalText] = useState('');
  const [analyzed, setAnalyzed] = useState<AnalyzeResult | null>(null);
  const [city, setCity] = useState('Алматы');
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
    try {
      const raw = sessionStorage.getItem(HOME_CHAT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        chat?: ChatTurn[];
        originalText?: string;
        analyzed?: AnalyzeResult | null;
        answers?: Array<{ id: string; answer: string }>;
        title?: string;
        description?: string;
        city?: string;
      };
      if (saved.chat?.length) {
        startedRef.current = true;
        setChat(saved.chat);
        setOriginalText(saved.originalText ?? '');
        setAnalyzed(saved.analyzed ?? null);
        setCollectedAnswers(saved.answers ?? []);
        setTitle(saved.title ?? '');
        setDescription(saved.description ?? '');
        setCity(saved.city || 'Алматы');
      }
    } catch {
      sessionStorage.removeItem(HOME_CHAT_KEY);
    }
  }, []);

  useEffect(() => {
    if (!chat.length) return;
    sessionStorage.setItem(
      HOME_CHAT_KEY,
      JSON.stringify({
        chat,
        originalText,
        analyzed,
        answers: collectedAnswers,
        title,
        description,
        city,
      }),
    );
  }, [chat, originalText, analyzed, collectedAnswers, title, description, city]);

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
      setCity(res.city || 'Алматы');
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
      setCity(res.city || city || 'Алматы');
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
        deadline: analyzed?.deadline,
        rawText: originalText,
      });
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
    sessionStorage.removeItem(HOME_CHAT_KEY);
    setChat([]);
    setAnalyzed(null);
    setCollectedAnswers([]);
    setOriginalText('');
    setDescription('');
    setTitle('');
    setQ('');
    setError('');
    setPublishResult(null);
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
            <div className="composer-footer">
              <div className="composer-tools">
                {chatting ? (
                  <button type="button" className="tool-pill" onClick={resetChat}>
                    {t('nav.newRequest')}
                  </button>
                ) : (
                  <>
                    <button type="button" className="tool-pill">
                      {t('home.file')}
                    </button>
                    <button type="button" className="tool-pill">
                      {t('home.city')}
                    </button>
                    <button type="button" className="tool-pill">
                      {t('home.deadline')}
                    </button>
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
                  <img src="/send-icon.png" alt="" className="send-icon" width={18} height={18} />
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
                  <img src="/send-icon.png" alt="" className="send-icon" width={18} height={18} />
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
