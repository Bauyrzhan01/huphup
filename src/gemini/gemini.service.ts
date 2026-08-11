import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GeminiAnalyzeResult = {
  title: string;
  description: string;
  category: string;
  city: string;
  quantity: string;
  deadline: string;
  rawText: string;
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

  async analyzeRequest(text: string): Promise<GeminiAnalyzeResult | null> {
    if (!this.isConfigured) return null;

    const prompt = `Ты помощник B2B-площадки HupHup (Казахстан).
Из текста заявки заказчика извлеки структурированные поля.
Ответь ТОЛЬКО валидным JSON без markdown:
{
  "title": "краткий заголовок заявки",
  "description": "полное описание",
  "category": "категория товаров/услуг",
  "city": "город или пустая строка",
  "quantity": "объём/количество или —",
  "deadline": "срок или Уточнить"
}

Текст заявки:
"""${text.slice(0, 4000)}"""`;

    const raw = await this.generateText(prompt);
    if (!raw) return null;

    const parsed = this.parseJson<{
      title?: string;
      description?: string;
      category?: string;
      city?: string;
      quantity?: string;
      deadline?: string;
    }>(raw);
    if (!parsed) return null;

    return {
      title: (parsed.title || text).slice(0, 120),
      description: parsed.description || text,
      category: parsed.category || 'Товары и материалы',
      city: parsed.city || '',
      quantity: parsed.quantity || '—',
      deadline: parsed.deadline || 'Уточнить',
      rawText: text,
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

  private async generateText(prompt: string): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
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
