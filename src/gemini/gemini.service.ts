import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY')?.trim() ?? '';
    this.model =
      this.config.get<string>('GEMINI_MODEL')?.trim() || 'gemini-flash-latest';
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
  "ready": false
}`;

  async analyzeRequest(text: string): Promise<GeminiAnalyzeResult | null> {
    if (!this.isConfigured) return null;
    const raw = await this.generateChatJson([{ role: 'user', text }]);
    if (!raw) return null;
    return this.normalizeAnalyze(text, this.parseJson<Record<string, unknown>>(raw), [text]);
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
            role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
            text: m.content,
          }))
        : [{ role: 'user' as const, text: input.text }];

    const raw = await this.generateChatJson(turns);
    if (!raw) return null;
    const userTexts = turns.filter((t) => t.role === 'user').map((t) => t.text);
    return this.normalizeAnalyze(
      input.text,
      this.parseJson<Record<string, unknown>>(raw),
      userTexts,
    );
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

    const raw = await this.generateText(prompt);
    if (!raw) return [];

    const parsed = this.parseJson<{ matches?: GeminiProductMatch[] }>(raw);
    if (!parsed?.matches || !Array.isArray(parsed.matches)) {
      return [];
    }

    const allowed = new Map(
      input.products.map((p) => [
        p.id,
        { companyId: p.company.id },
      ]),
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
        reason: typeof m.reason === 'string' ? m.reason.slice(0, 200) : undefined,
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
        const name = String(row.name ?? '').trim();
        if (!name) return null;
        return {
          name: name.slice(0, 120),
          quantity: String(row.quantity ?? '').trim().slice(0, 80),
          specs: String(row.specs ?? '').trim().slice(0, 240),
          city: String(row.city ?? '').trim().slice(0, 80),
        };
      })
      .filter((item): item is GeminiRequestItem => Boolean(item))
      .slice(0, 8);

    const questionsRaw = Array.isArray(parsed.questions) ? parsed.questions : [];
    const questions: GeminiClarifyQuestion[] = [];
    for (const [i, q] of questionsRaw.entries()) {
      if (!q || typeof q !== 'object') continue;
      const row = q as Record<string, unknown>;
      const question = String(row.question ?? '').trim();
      if (!question) continue;
      const options = Array.isArray(row.options)
        ? row.options
            .map((o) => String(o).trim())
            .filter(Boolean)
            .slice(0, 6)
        : [];
      const next: GeminiClarifyQuestion = {
        id: String(row.id ?? `q${i + 1}`).slice(0, 40),
        field: String(row.field ?? 'other').slice(0, 40),
        question: question.slice(0, 220),
      };
      const placeholder = String(row.placeholder ?? '').trim().slice(0, 120);
      if (placeholder) next.placeholder = placeholder;
      if (options.length) next.options = options;
      questions.push(next);
      if (questions.length >= 1) break;
    }

    const understanding = String(parsed.understanding || '').slice(0, 400);
    const firstQuestion = questions[0]?.question ?? '';
    const assistantMessage = this.stripEcho(
      String(parsed.assistantMessage || firstQuestion).trim(),
      userTexts,
      firstQuestion,
    ).slice(0, 800);

    const ready = parsed.ready === true && questions.length === 0;

    const title = String(parsed.title || text).slice(0, 120);
    const rawDescription = String(parsed.description || text).slice(0, 4000);
    const description =
      normalizeRequestDescription(title, rawDescription, text) ||
      buildRequestDescription({
        title,
        description: rawDescription,
        category: String(parsed.category || 'Товары и материалы').slice(0, 80),
        city: String(parsed.city || '').slice(0, 80),
        quantity: String(parsed.quantity || '—').slice(0, 80),
        deadline: String(parsed.deadline || 'Уточнить').slice(0, 80),
      });

    return {
      title,
      description,
      category: String(parsed.category || 'Товары и материалы').slice(0, 80),
      city: String(parsed.city || '').slice(0, 80),
      quantity: String(parsed.quantity || '—').slice(0, 80),
      deadline: String(parsed.deadline || 'Уточнить').slice(0, 80),
      rawText: text,
      understanding,
      assistantMessage,
      items,
      questions,
      ready,
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
        msg = msg.slice(u.length).replace(/^[\s,.\-:;]+/, '').trim();
      }
    }
    const dump = compact(users.join(' '));
    if (dump.length >= 8 && compact(msg).includes(dump)) {
      msg = msg.replace(new RegExp(users.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'i'), '').trim();
    }
    const echoed = users.filter((u) => u.length > 4 && compact(msg).includes(compact(u)));
    if (echoed.length >= Math.max(1, users.length - 1) && users.length > 1) {
      return fallback || 'Какая марка или характеристики нужны?';
    }
    return msg || fallback;
  }

  private async generateChatJson(
    turns: Array<{ role: 'user' | 'model'; text: string }>,
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
      system: this.chatSystem,
    });
  }

  private async generateText(prompt: string): Promise<string | null> {
    return this.generateContent([{ role: 'user', parts: [{ text: prompt }] }], {
      temperature: 0.2,
    });
  }

  private async generateContent(
    contents: Array<{ role: string; parts: Array<{ text: string }> }>,
    opts: { temperature: number; system?: string },
  ): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': this.apiKey,
        },
        signal:
          typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(12000)
            : undefined,
        body: JSON.stringify({
          ...(opts.system
            ? { systemInstruction: { parts: [{ text: opts.system }] } }
            : {}),
          contents,
          generationConfig: {
            temperature: opts.temperature,
            responseMimeType: 'application/json',
          },
        }),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      if (!res.ok) {
        this.logger.warn(
          `Gemini error ${res.status}: ${data.error?.message ?? res.statusText}`,
        );
        return null;
      }
      const text = data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim();
      return text || null;
    } catch (err) {
      this.logger.warn(
        `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
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
