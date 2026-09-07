import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { asText } from '../common/text.util';
import { geminiLogStore } from '../ops/gemini-log.store';
import {
  buildRequestDescription,
  normalizeRequestDescription,
} from '../requests/request-text.util';

export type GeminiClarifyQuestion = {
  id: string;
  field: string;
  question: string;
  placeholder?: string;
  options?: string[];
};

export type GeminiRequestItem = {
  name: string;
  quantity: string;
  specs: string;
  city: string;
};

export type GeminiAnalyzeResult = {
  title: string;
  description: string;
  category: string;
  city: string;
  quantity: string;
  deadline: string;
  rawText: string;
  understanding: string;
  assistantMessage: string;
  items: GeminiRequestItem[];
  questions: GeminiClarifyQuestion[];
  ready: boolean;
  ackOnly?: boolean;
};

export type GeminiClarifyAnswer = {
  id: string;
  answer: string;
};

export type GeminiProductMatch = {
  productId: string;
  companyId: string;
  score: number;
  reason?: string;
};

type CatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  company: {
    id: string;
    name: string;
    city: string | null;
  };
};

/** HTTP statuses worth one retry — a blip, not a real rejection of the request. */
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRY_DELAY_MS = 250;
const ATTEMPT_TIMEOUT_MS = 6000;

/** Consecutive failures before the breaker opens and skips calls outright. */
const BREAKER_FAILURE_THRESHOLD = 4;
const BREAKER_COOLDOWN_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AttemptResult = {
  /** True only when the call returned a usable, non-empty text answer. */
  success: boolean;
  status: number;
  text: string | null;
  promptTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  /** Worth retrying once — a timeout, network drop, or rate limit, not a bad request. */
  transient: boolean;
};

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dailyTokenBudget: number | null;

  // A simple circuit breaker: after a run of real failures, stop paying the
  // timeout on every single request and go straight to the rule-based
  // fallback for a cooldown window instead.
  private consecutiveFailures = 0;
  private breakerOpenUntil = 0;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY')?.trim() ?? '';
    this.model =
      this.config.get<string>('GEMINI_MODEL')?.trim() || 'gemini-flash-latest';

    const budgetRaw = Number(
      this.config.get<string>('GEMINI_DAILY_TOKEN_BUDGET'),
    );
    this.dailyTokenBudget =
      Number.isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : null;
  }

  get isConfigured() {
    return Boolean(this.apiKey);
  }

  private readonly chatSystem = `Ты чат-ассистент B2B-площадки HupHup. Веди себя как обычный ChatGPT: живой диалог, коротко, по делу.

Жёстко:
- assistantMessage — ТОЛЬКО твоя новая реплика. Никогда не повторяй, не цитируй и не пересказывай сообщения клиента дословно.
- Не начинай ответ с текста клиента. Не склеивай историю чата в одно сообщение.
- Приветствие — не товар. Сначала спроси, что закупить.
- Когда товар назван — один НОВЫЙ уточняющий вопрос за ход (марка, количество, город, срок, доставка).
- НИКОГДА не задавай один и тот же вопрос повторно. Если клиент уже ответил — переходи к следующему.
- Не спрашивай общее «какие характеристики важны поставщику?», если марка или тип уже названы.
- Не выдумывай факты. Язык как у клиента (казахский или русский).
- ready=true только если есть реальный товар и хватает данных для КП поставщику.
- Если заявка уже готова (ready=true) и клиент только подтверждает, соглашается, благодарит или просит опубликовать — любым языком и формулировкой, без новых данных о закупке — установи ackOnly=true, assistantMessage="", ready=true, questions=[].
- Не повторяй «Собрал заявку» и не задавай новых вопросов при ackOnly.
- Если после ready клиент добавляет новые факты о товаре — ackOnly=false, обнови поля и задай вопрос при необходимости.

Ответ — только JSON:
{
  "understanding": "внутреннее: что поняли, клиенту не показывать",
  "assistantMessage": "только новая реплика в чат",
  "title": "",
  "description": "ТЗ из известных фактов",
  "category": "",
  "city": "",
  "quantity": "",
  "deadline": "",
  "items": [{ "name": "", "quantity": "", "specs": "", "city": "" }],
  "questions": [{ "id": "q1", "field": "spec", "question": "короткий вопрос", "placeholder": "", "options": [] }],
  "ready": false,
  "ackOnly": false
}`;

  async analyzeRequest(text: string): Promise<GeminiAnalyzeResult | null> {
    if (!this.isConfigured) return null;
    const raw = await this.generateChatJson(
      [{ role: 'user', text }],
      '',
      'analyze',
    );
    if (!raw) return null;
    return this.normalizeAnalyze(
      text,
      this.parseJson<Record<string, unknown>>(raw),
      [text],
    );
  }

  async clarifyRequest(input: {
    text: string;
    answers: GeminiClarifyAnswer[];
    previous?: Partial<GeminiAnalyzeResult> | null;
    messages?: Array<{ role: string; content: string }>;
  }): Promise<GeminiAnalyzeResult | null> {
    if (!this.isConfigured) return null;

    const history = (input.messages ?? []).filter((m) => m.content.trim());
    const turns =
      history.length > 0
        ? history.map((m) => ({
            role:
              m.role === 'assistant' ? ('model' as const) : ('user' as const),
            text: m.content,
          }))
        : [{ role: 'user' as const, text: input.text }];

    const readyContext = input.previous?.ready
      ? '\n\nКОНТЕКСТ СЕССИИ: заявка уже собрана (ready=true). Ассистент уже сообщил, что заявку можно проверить и опубликовать. Если новое сообщение клиента — только подтверждение, согласие или просьба опубликовать без новых фактов о закупке, верни ackOnly=true и пустой assistantMessage.'
      : '';
    const raw = await this.generateChatJson(turns, readyContext, 'clarify');
    if (!raw) return null;
    const userTexts = turns.filter((t) => t.role === 'user').map((t) => t.text);
    const parsed = this.normalizeAnalyze(
      input.text,
      this.parseJson<Record<string, unknown>>(raw),
      userTexts,
    );
    if (!parsed || !input.previous?.ready || !parsed.ackOnly) return parsed;
    return {
      ...input.previous,
      ...parsed,
      title: parsed.title || input.previous.title || '',
      description: parsed.description || input.previous.description || '',
      category: parsed.category || input.previous.category || '',
      city: parsed.city || input.previous.city || '',
      quantity: parsed.quantity || input.previous.quantity || '',
      deadline: parsed.deadline || input.previous.deadline || '',
      items: parsed.items.length ? parsed.items : (input.previous.items ?? []),
      assistantMessage: '',
      questions: [],
      ready: true,
      ackOnly: true,
    };
  }

  async matchProducts(input: {
    requestText: string;
    title: string;
    category?: string | null;
    city?: string | null;
    products: CatalogProduct[];
  }): Promise<GeminiProductMatch[]> {
    if (!this.isConfigured || input.products.length === 0) {
      return [];
    }

    const catalog = input.products.slice(0, 400).map((p) => ({
      productId: p.id,
      companyId: p.company.id,
      company: p.company.name,
      product: p.name,
      description: (p.description || '').slice(0, 160),
      city: p.city || p.company.city || '',
    }));

    const prompt = `Ты матчер B2B-площадки HupHup.
Найди поставщиков/товары, которые реально подходят под заявку заказчика.
Верни ТОЛЬКО JSON без markdown:
{
  "matches": [
    { "productId": "...", "companyId": "...", "score": 0-100, "reason": "коротко почему" }
  ]
}

Правила:
- бери только productId/companyId из каталога ниже
- score >= 55 только если товар действительно релевантен
- максимум 12 matches
- разные компании предпочтительнее дублей одной компании (оставь лучший товар компании)
- если ничего не подходит — { "matches": [] }

Заявка:
title: ${input.title}
category: ${input.category || ''}
city: ${input.city || ''}
text: """${input.requestText.slice(0, 3000)}"""

Каталог:
${JSON.stringify(catalog)}`;

    const raw = await this.generateText(prompt, 'match');
    if (!raw) return [];

    const parsed = this.parseJson<{ matches?: GeminiProductMatch[] }>(raw);
    if (!parsed?.matches || !Array.isArray(parsed.matches)) {
      return [];
    }

    const allowed = new Map(
      input.products.map((p) => [p.id, { companyId: p.company.id }]),
    );

    const byCompany = new Map<string, GeminiProductMatch>();
    for (const m of parsed.matches) {
      if (!m?.productId || !allowed.has(m.productId)) continue;
      const companyId = allowed.get(m.productId)!.companyId;
      const score = Math.max(0, Math.min(100, Number(m.score) || 0));
      if (score < 55) continue;
      const next: GeminiProductMatch = {
        productId: m.productId,
        companyId,
        score,
        reason:
          typeof m.reason === 'string' ? m.reason.slice(0, 200) : undefined,
      };
      const prev = byCompany.get(companyId);
      if (!prev || next.score > prev.score) {
        byCompany.set(companyId, next);
      }
    }

    return [...byCompany.values()].sort((a, b) => b.score - a.score);
  }

  private normalizeAnalyze(
    text: string,
    parsed: Record<string, unknown> | null,
    userTexts: string[] = [],
  ): GeminiAnalyzeResult | null {
    if (!parsed) return null;

    const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
    const items: GeminiRequestItem[] = itemsRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const name = asText(row.name).trim();
        if (!name) return null;
        return {
          name: name.slice(0, 120),
          quantity: asText(row.quantity).trim().slice(0, 80),
          specs: asText(row.specs).trim().slice(0, 240),
          city: asText(row.city).trim().slice(0, 80),
        };
      })
      .filter((item): item is GeminiRequestItem => Boolean(item))
      .slice(0, 8);

    const questionsRaw = Array.isArray(parsed.questions)
      ? parsed.questions
      : [];
    const questions: GeminiClarifyQuestion[] = [];
    for (const [i, q] of questionsRaw.entries()) {
      if (!q || typeof q !== 'object') continue;
      const row = q as Record<string, unknown>;
      const question = asText(row.question).trim();
      if (!question) continue;
      const options = Array.isArray(row.options)
        ? row.options
            .map((o) => asText(o).trim())
            .filter(Boolean)
            .slice(0, 6)
        : [];
      const next: GeminiClarifyQuestion = {
        id: (asText(row.id) || `q${i + 1}`).slice(0, 40),
        field: (asText(row.field) || 'other').slice(0, 40),
        question: question.slice(0, 220),
      };
      const placeholder = asText(row.placeholder).trim().slice(0, 120);
      if (placeholder) next.placeholder = placeholder;
      if (options.length) next.options = options;
      questions.push(next);
      if (questions.length >= 1) break;
    }

    const understanding = asText(parsed.understanding).slice(0, 400);
    const firstQuestion = questions[0]?.question ?? '';
    const assistantMessage = this.stripEcho(
      (asText(parsed.assistantMessage) || firstQuestion).trim(),
      userTexts,
      firstQuestion,
    ).slice(0, 800);

    const ackOnly = parsed.ackOnly === true;
    const ready = (parsed.ready === true && questions.length === 0) || ackOnly;

    // On a plain "да, публикуйте" turn the model rightly leaves title/category/
    // etc. blank — there is no new product data in that message. Falling back
    // to the raw confirmation text (or a generic placeholder) here would make
    // every field look "filled in", which then defeats clarifyRequest's
    // `parsed.field || previous.field` merge below: it never sees the blanks
    // it needs to know a field must be carried over from the prior turn.
    const title = ackOnly
      ? asText(parsed.title).slice(0, 120)
      : (asText(parsed.title) || text).slice(0, 120);
    const rawDescription = ackOnly
      ? asText(parsed.description).slice(0, 4000)
      : (asText(parsed.description) || text).slice(0, 4000);
    const category = ackOnly
      ? asText(parsed.category).slice(0, 80)
      : (asText(parsed.category) || 'Товары и материалы').slice(0, 80);
    const quantity = ackOnly
      ? asText(parsed.quantity).slice(0, 80)
      : (asText(parsed.quantity) || '—').slice(0, 80);
    const deadline = ackOnly
      ? asText(parsed.deadline).slice(0, 80)
      : (asText(parsed.deadline) || 'Уточнить').slice(0, 80);
    const city = asText(parsed.city).slice(0, 80);

    const description =
      normalizeRequestDescription(title, rawDescription, text) ||
      (ackOnly
        ? rawDescription
        : buildRequestDescription({
            title,
            description: rawDescription,
            category: category || 'Товары и материалы',
            city,
            quantity: quantity || '—',
            deadline: deadline || 'Уточнить',
          }));

    return {
      title,
      description,
      category,
      city,
      quantity,
      deadline,
      rawText: text,
      understanding,
      assistantMessage: ackOnly ? '' : assistantMessage,
      items,
      questions: ackOnly ? [] : questions,
      ready,
      ...(ackOnly ? { ackOnly: true } : {}),
    };
  }

  private stripEcho(message: string, userTexts: string[], fallback: string) {
    let msg = message.trim();
    const compact = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const users = userTexts.map((u) => u.trim()).filter((u) => u.length > 1);
    for (const u of users) {
      const cu = compact(u);
      if (cu.length < 2) continue;
      if (compact(msg).startsWith(cu)) {
        msg = msg
          .slice(u.length)
          .replace(/^[\s,.\-:;]+/, '')
          .trim();
      }
    }
    const dump = compact(users.join(' '));
    if (dump.length >= 8 && compact(msg).includes(dump)) {
      msg = msg
        .replace(
          new RegExp(
            users
              .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('\\s+'),
            'i',
          ),
          '',
        )
        .trim();
    }
    const echoed = users.filter(
      (u) => u.length > 4 && compact(msg).includes(compact(u)),
    );
    if (echoed.length >= Math.max(1, users.length - 1) && users.length > 1) {
      return fallback || 'Какая марка или характеристики нужны?';
    }
    return msg || fallback;
  }

  private async generateChatJson(
    turns: Array<{ role: 'user' | 'model'; text: string }>,
    systemExtra = '',
    purpose = 'chat',
  ): Promise<string | null> {
    const merged: Array<{ role: 'user' | 'model'; text: string }> = [];
    for (const t of turns) {
      const text = t.text.trim();
      if (!text) continue;
      const last = merged[merged.length - 1];
      if (last && last.role === t.role) last.text += `\n${text}`;
      else merged.push({ role: t.role, text });
    }
    if (merged[0]?.role === 'model') {
      merged.unshift({ role: 'user', text: 'Привет' });
    }
    const contents = merged.map((t) => ({
      role: t.role,
      parts: [{ text: t.text.slice(0, 4000) }],
    }));
    return this.generateContent(contents, {
      temperature: 0.5,
      system: this.chatSystem + systemExtra,
      purpose,
    });
  }

  private async generateText(
    prompt: string,
    purpose = 'match',
  ): Promise<string | null> {
    return this.generateContent([{ role: 'user', parts: [{ text: prompt }] }], {
      temperature: 0.2,
      purpose,
    });
  }

  /** One HTTP round trip — no retry, no logging, no breaker bookkeeping. */
  private async attempt(url: string, body: unknown): Promise<AttemptResult> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': this.apiKey,
        },
        signal:
          typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)
            : undefined,
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const text = data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim();

      if (!res.ok) {
        return {
          success: false,
          status: res.status,
          text: null,
          errorMessage: (data.error?.message ?? res.statusText).slice(0, 180),
          transient: TRANSIENT_STATUSES.has(res.status),
        };
      }
      return {
        success: Boolean(text),
        status: res.status,
        text: text || null,
        promptTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
        errorMessage: text ? undefined : 'empty response',
        transient: false,
      };
    } catch (err) {
      // A thrown fetch is a network drop or our own timeout — always worth
      // one retry, unlike an explicit rejection from the API itself.
      return {
        success: false,
        status: 0,
        text: null,
        errorMessage: (err instanceof Error ? err.message : String(err)).slice(
          0,
          180,
        ),
        transient: true,
      };
    }
  }

  private async generateContent(
    contents: Array<{ role: string; parts: Array<{ text: string }> }>,
    opts: { temperature: number; system?: string; purpose: string },
  ): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const promptChars =
      (opts.system?.length ?? 0) +
      contents.reduce(
        (sum, c) =>
          sum + c.parts.reduce((s, p) => s + (p.text?.length ?? 0), 0),
        0,
      );

    // A budget skip is a deliberate choice, not Gemini failing — it must
    // never count toward the circuit breaker below.
    if (this.dailyTokenBudget !== null) {
      const used = geminiLogStore.tokensToday();
      if (used >= this.dailyTokenBudget) {
        geminiLogStore.push({
          purpose: opts.purpose,
          ok: false,
          status: 0,
          ms: 0,
          promptChars,
          responseChars: 0,
          error: `daily token budget exceeded (${used}/${this.dailyTokenBudget})`,
        });
        this.logger.warn(
          `Gemini daily token budget exceeded (${used}/${this.dailyTokenBudget}); skipping call`,
        );
        return null;
      }
    }

    if (this.breakerOpenUntil > Date.now()) {
      geminiLogStore.push({
        purpose: opts.purpose,
        ok: false,
        status: 0,
        ms: 0,
        promptChars,
        responseChars: 0,
        error: `circuit breaker open after ${this.consecutiveFailures} failures in a row`,
      });
      return null;
    }

    const body = {
      ...(opts.system
        ? { systemInstruction: { parts: [{ text: opts.system }] } }
        : {}),
      contents,
      generationConfig: {
        temperature: opts.temperature,
        responseMimeType: 'application/json',
      },
    };

    const started = Date.now();
    let result = await this.attempt(url, body);
    if (!result.success && result.transient) {
      await sleep(RETRY_DELAY_MS);
      result = await this.attempt(url, body);
    }

    geminiLogStore.push({
      purpose: opts.purpose,
      ok: result.success,
      status: result.status,
      ms: Date.now() - started,
      promptChars,
      responseChars: result.text?.length ?? 0,
      promptTokens: result.promptTokens,
      outputTokens: result.outputTokens,
      error: result.success ? undefined : result.errorMessage,
    });

    if (result.success) {
      this.consecutiveFailures = 0;
      this.breakerOpenUntil = 0;
      return result.text;
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= BREAKER_FAILURE_THRESHOLD) {
      this.breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
      this.logger.warn(
        `Gemini failed ${this.consecutiveFailures} times in a row — pausing calls for ${
          BREAKER_COOLDOWN_MS / 1000
        }s`,
      );
    }
    this.logger.warn(`Gemini error ${result.status}: ${result.errorMessage}`);
    return null;
  }

  private parseJson<T>(raw: string): T | null {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(cleaned.slice(start, end + 1)) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}
