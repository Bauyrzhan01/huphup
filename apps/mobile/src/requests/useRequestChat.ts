import { useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { requestsApi, type AnalyzeResult, type PublishResult } from '../api/requests';
import { READY_TEXT, shouldSkipAssistantReply } from './chat';

export type ChatTurn = { role: 'user' | 'assistant'; text: string; options?: string[] };

function errorText(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    if (err.status >= 500) return 'AI сейчас не отвечает. Попробуйте ещё раз.';
    return err.message;
  }
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}

/** The buyer ↔ AI conversation that turns free text into a published request. */
export function useRequestChat() {
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [analyzed, setAnalyzed] = useState<AnalyzeResult | null>(null);
  const [answers, setAnswers] = useState<{ id: string; answer: string }[]>([]);
  const [city, setCityState] = useState('');
  const [deadline, setDeadlineState] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [published, setPublished] = useState<PublishResult | null>(null);
  // A city/deadline the buyer picked by hand wins over what the AI read from the text.
  const cityManual = useRef(false);
  const deadlineManual = useRef(false);

  const started = chat.length > 0;
  const ready = Boolean(analyzed && (analyzed.ready || !(analyzed.questions ?? []).length));

  function setCity(value: string) {
    cityManual.current = Boolean(value);
    setCityState(value);
  }

  function setDeadline(value: string) {
    deadlineManual.current = Boolean(value);
    setDeadlineState(value);
  }

  function absorb(res: AnalyzeResult) {
    setAnalyzed(res);
    if (!cityManual.current && res.city) setCityState(res.city);
    if (!deadlineManual.current && res.deadline) setDeadlineState(res.deadline);
  }

  async function start(text: string) {
    setChat([{ role: 'user', text }]);
    setBusy(true);
    setError('');
    try {
      const res = await requestsApi.analyze(text);
      absorb(res);
      const ask = res.questions?.[0];
      setChat([
        { role: 'user', text },
        {
          role: 'assistant',
          text: res.assistantMessage || ask?.question || READY_TEXT,
          options: res.ready || !ask ? undefined : ask.options,
        },
      ]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function reply(text: string, base: ChatTurn[] = chat, baseAnswers = answers) {
    const current = analyzed?.questions?.[0];
    const nextAnswers = [
      ...baseAnswers,
      { id: current?.id ?? `a${baseAnswers.length + 1}`, answer: text },
    ];
    const nextChat: ChatTurn[] = [...base, { role: 'user', text }];
    const userText = nextChat
      .filter((m) => m.role === 'user')
      .map((m) => m.text)
      .join('\n');
    setAnswers(nextAnswers);
    setChat(nextChat);
    setBusy(true);
    setError('');
    try {
      const res = await requestsApi.clarify({
        text: userText,
        answers: nextAnswers,
        previous: analyzed,
        messages: nextChat.map((m) => ({ role: m.role, content: m.text })),
      });
      absorb(res);
      const ask = res.questions?.[0];
      const done = res.ready === true || !ask;
      const assistantText = res.ackOnly
        ? ''
        : done
          ? res.assistantMessage || READY_TEXT
          : res.assistantMessage || ask?.question || READY_TEXT;
      const lastAssistant = [...nextChat].reverse().find((m) => m.role === 'assistant');
      const skip = res.ackOnly || shouldSkipAssistantReply(lastAssistant?.text, assistantText, done);
      setChat(
        skip
          ? nextChat
          : [...nextChat, { role: 'assistant', text: assistantText, options: done ? undefined : ask?.options }],
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (!started) await start(trimmed);
    else await reply(trimmed);
  }

  /** Re-sends the last message after a failed call. */
  async function retry() {
    const lastUser = [...chat].reverse().find((m) => m.role === 'user');
    if (!lastUser || busy) return;
    if (chat.filter((m) => m.role === 'user').length <= 1) {
      await start(lastUser.text);
      return;
    }
    // The failed turn already added the message and its answer — drop both before re-sending.
    const withoutLast = chat.slice(0, chat.lastIndexOf(lastUser));
    await reply(lastUser.text, withoutLast, answers.slice(0, -1));
  }

  async function publish() {
    if (busy || !analyzed) return;
    const rawText = chat
      .filter((m) => m.role === 'user')
      .map((m) => m.text)
      .join('\n');
    setBusy(true);
    setError('');
    try {
      const created = await requestsApi.create({
        title: analyzed.title || rawText.slice(0, 80),
        description: analyzed.description || rawText,
        category: analyzed.category || undefined,
        city: city || undefined,
        quantity: analyzed.quantity || undefined,
        deadline: deadline || analyzed.deadline || undefined,
        rawText,
      });
      setPublished(await requestsApi.publish(created.id));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setChat([]);
    setAnalyzed(null);
    setAnswers([]);
    setError('');
    setPublished(null);
    // City and deadline are kept: the next request is often for the same place and date.
  }

  return {
    chat,
    started,
    ready,
    busy,
    error,
    published,
    city,
    deadline,
    setCity,
    setDeadline,
    send,
    retry,
    publish,
    reset,
  };
}
