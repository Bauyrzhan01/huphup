import type { ConfigService } from '@nestjs/config';
import { geminiLogStore } from '../ops/gemini-log.store';
import { GeminiService } from './gemini.service';

type ConfigMap = Record<string, string | undefined>;

function buildConfig(values: ConfigMap): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function buildService(values: ConfigMap = { GEMINI_API_KEY: 'test-key' }) {
  return new GeminiService(buildConfig(values));
}

function jsonResponse(
  status: number,
  body: unknown,
  statusText = '',
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Shape of a real Gemini generateContent success response. */
function geminiOk(
  payload: unknown,
  tokens: { prompt?: number; output?: number } = {},
) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    usageMetadata: {
      promptTokenCount: tokens.prompt ?? 100,
      candidatesTokenCount: tokens.output ?? 20,
    },
  };
}

const analyzePayload = (over: Record<string, unknown> = {}) => ({
  understanding: 'клиент хочет цемент',
  assistantMessage: 'Какая марка цемента нужна?',
  title: 'Цемент М400',
  description: 'Нужен цемент М400, 10 тонн, Алматы',
  category: 'Стройматериалы',
  city: 'Алматы',
  quantity: '10 тонн',
  deadline: 'Уточнить',
  items: [{ name: 'Цемент М400', quantity: '10 т', specs: '', city: 'Алматы' }],
  questions: [
    { id: 'q1', field: 'brand', question: 'Какая марка цемента нужна?' },
  ],
  ready: false,
  ackOnly: false,
  ...over,
});

describe('GeminiService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('без ключа API', () => {
    it('ничего не запрашивает и возвращает пустой результат', async () => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock;
      const service = buildService({ GEMINI_API_KEY: '' });

      expect(service.isConfigured).toBe(false);
      await expect(service.analyzeRequest('нужен цемент')).resolves.toBeNull();
      await expect(
        service.clarifyRequest({ text: 'цемент', answers: [] }),
      ).resolves.toBeNull();
      await expect(
        service.matchProducts({
          requestText: 'цемент',
          title: 'цемент',
          products: [
            {
              id: 'p1',
              name: 'Цемент',
              description: null,
              city: null,
              company: { id: 'c1', name: 'Компания', city: null },
            },
          ],
        }),
      ).resolves.toEqual([]);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('matchProducts с пустым каталогом тоже не ходит в сеть', async () => {
      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.matchProducts({
        requestText: 'цемент',
        title: 'цемент',
        products: [],
      });

      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('analyzeRequest', () => {
    it('разбирает успешный ответ модели в структуру заявки', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, geminiOk(analyzePayload())));
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.analyzeRequest(
        'Нужен цемент М400 10 тонн в Алматы',
      );

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Цемент М400');
      expect(result?.city).toBe('Алматы');
      expect(result?.items).toHaveLength(1);
      expect(result?.questions).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('снимает markdown-обёртку ```json перед разбором', async () => {
      const raw = '```json\n' + JSON.stringify(analyzePayload()) + '\n```';
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          candidates: [{ content: { parts: [{ text: raw }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
      );
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.analyzeRequest('цемент');

      expect(result?.title).toBe('Цемент М400');
    });

    it('вытаскивает JSON, даже если модель добавила текст вокруг', async () => {
      const raw =
        'Вот результат:\n' + JSON.stringify(analyzePayload()) + '\nСпасибо!';
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          candidates: [{ content: { parts: [{ text: raw }] } }],
        }),
      );
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.analyzeRequest('цемент');

      expect(result?.title).toBe('Цемент М400');
    });

    it('совсем сломанный JSON — возвращает null, а не бросает исключение', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          candidates: [
            { content: { parts: [{ text: 'это не json вообще' }] } },
          ],
        }),
      );
      globalThis.fetch = fetchMock;
      const service = buildService();

      await expect(service.analyzeRequest('цемент')).resolves.toBeNull();
    });

    it('не повторяет дословно текст клиента в assistantMessage', async () => {
      const userText = 'Нужен цемент М400 10 тонн в Алматы';
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          200,
          geminiOk(
            analyzePayload({
              assistantMessage: userText + ' Уточните марку.',
            }),
          ),
        ),
      );
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.analyzeRequest(userText);

      expect(result?.assistantMessage.startsWith(userText)).toBe(false);
    });

    it('ackOnly=true очищает вопросы и assistantMessage', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          200,
          geminiOk(
            analyzePayload({
              ackOnly: true,
              ready: true,
              assistantMessage: 'должно исчезнуть',
              questions: [
                { id: 'q1', field: 'x', question: 'должно исчезнуть' },
              ],
            }),
          ),
        ),
      );
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.analyzeRequest('да, всё верно');

      expect(result?.ackOnly).toBe(true);
      expect(result?.assistantMessage).toBe('');
      expect(result?.questions).toEqual([]);
      expect(result?.ready).toBe(true);
    });
  });

  describe('clarifyRequest', () => {
    it('переносит данные из previous, когда сессия уже готова и клиент просто подтверждает', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          200,
          geminiOk(
            analyzePayload({
              ackOnly: true,
              ready: true,
              title: '',
              city: '',
            }),
          ),
        ),
      );
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.clarifyRequest({
        text: 'да, публикуйте',
        answers: [],
        previous: {
          ready: true,
          title: 'Цемент М400',
          city: 'Алматы',
          description: 'ТЗ',
          category: 'Стройматериалы',
          quantity: '10 тонн',
          deadline: 'Уточнить',
          items: [],
        },
      });

      // Пустые поля из ackOnly-ответа не должны затирать уже собранные данные.
      expect(result?.title).toBe('Цемент М400');
      expect(result?.city).toBe('Алматы');
      expect(result?.ready).toBe(true);
      expect(result?.ackOnly).toBe(true);
    });
  });

  describe('matchProducts', () => {
    const products = [
      {
        id: 'p1',
        name: 'Цемент М400',
        description: 'мешок 50 кг',
        city: 'Алматы',
        company: { id: 'c1', name: 'Компания 1', city: 'Алматы' },
      },
      {
        id: 'p2',
        name: 'Цемент М500',
        description: 'мешок 50 кг',
        city: 'Алматы',
        company: { id: 'c1', name: 'Компания 1', city: 'Алматы' },
      },
      {
        id: 'p3',
        name: 'Песок',
        description: 'карьерный',
        city: 'Астана',
        company: { id: 'c2', name: 'Компания 2', city: 'Астана' },
      },
    ];

    it('отсекает совпадения ниже порога score 55', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          200,
          geminiOk({
            matches: [
              {
                productId: 'p1',
                companyId: 'c1',
                score: 90,
                reason: 'подходит',
              },
              {
                productId: 'p3',
                companyId: 'c2',
                score: 40,
                reason: 'слабое совпадение',
              },
            ],
          }),
        ),
      );
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.matchProducts({
        requestText: 'нужен цемент',
        title: 'цемент',
        products,
      });

      expect(result).toHaveLength(1);
      expect(result[0].productId).toBe('p1');
    });

    it('оставляет только один, лучший, товар на компанию', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          200,
          geminiOk({
            matches: [
              { productId: 'p1', companyId: 'c1', score: 70 },
              { productId: 'p2', companyId: 'c1', score: 95 },
            ],
          }),
        ),
      );
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.matchProducts({
        requestText: 'нужен цемент',
        title: 'цемент',
        products,
      });

      expect(result).toHaveLength(1);
      expect(result[0].productId).toBe('p2');
      expect(result[0].score).toBe(95);
    });

    it('игнорирует productId, которого не было в переданном каталоге', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          200,
          geminiOk({
            matches: [
              { productId: 'not-in-catalog', companyId: 'x', score: 99 },
            ],
          }),
        ),
      );
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.matchProducts({
        requestText: 'нужен цемент',
        title: 'цемент',
        products,
      });

      expect(result).toEqual([]);
    });

    it('сортирует результат по убыванию score', async () => {
      const many = Array.from({ length: 3 }, (_, i) => ({
        id: `p${i}`,
        name: `Товар ${i}`,
        description: null,
        city: null,
        company: { id: `c${i}`, name: `Компания ${i}`, city: null },
      }));
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          200,
          geminiOk({
            matches: [
              { productId: 'p0', companyId: 'c0', score: 60 },
              { productId: 'p1', companyId: 'c1', score: 90 },
              { productId: 'p2', companyId: 'c2', score: 75 },
            ],
          }),
        ),
      );
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.matchProducts({
        requestText: 'товар',
        title: 'товар',
        products: many,
      });

      expect(result.map((m) => m.score)).toEqual([90, 75, 60]);
    });
  });

  describe('устойчивость к сбоям', () => {
    it('повторяет запрос один раз после сетевой ошибки и получает результат', async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce(jsonResponse(200, geminiOk(analyzePayload())));
      globalThis.fetch = fetchMock;
      const service = buildService();

      const promise = service.analyzeRequest('цемент');
      await jest.advanceTimersByTimeAsync(300);
      const result = await promise;

      expect(result?.title).toBe('Цемент М400');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('повторяет запрос после HTTP 503, но не после 401', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            503,
            { error: { message: 'overloaded' } },
            'Service Unavailable',
          ),
        )
        .mockResolvedValueOnce(jsonResponse(200, geminiOk(analyzePayload())));
      globalThis.fetch = fetchMock;
      const service = buildService();

      const promise = service.analyzeRequest('цемент');
      await jest.advanceTimersByTimeAsync(300);
      const result = await promise;

      expect(result?.title).toBe('Цемент М400');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('не повторяет запрос после HTTP 401 — только один вызов, результат null', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(401, { error: { message: 'bad key' } }, 'Unauthorized'),
        );
      globalThis.fetch = fetchMock;
      const service = buildService();

      const result = await service.analyzeRequest('цемент');

      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('открывает предохранитель после серии сбоев и перестаёт ходить в сеть', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(500, { error: { message: 'boom' } }, 'Internal Error'),
        );
      globalThis.fetch = fetchMock;
      const service = buildService();

      // Каждый вызов из-за 500 — транзиентный, значит внутри одна попытка + один ретрай.
      for (let i = 0; i < 4; i += 1) {
        const promise = service.analyzeRequest('цемент');
        await jest.advanceTimersByTimeAsync(300);
        await promise;
      }
      const callsBeforeOpen = fetchMock.mock.calls.length;
      expect(callsBeforeOpen).toBe(8); // 4 вызова × (попытка + ретрай)

      // Предохранитель открыт — сеть больше не трогаем.
      const skipped = await service.analyzeRequest('цемент');
      expect(skipped).toBeNull();
      expect(fetchMock.mock.calls.length).toBe(callsBeforeOpen);
    });

    it('закрывает предохранитель после остывания и пробует снова', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(401, { error: { message: 'bad key' } }, 'Unauthorized'),
        );
      globalThis.fetch = fetchMock;
      const service = buildService();

      // 401 не ретраится, значит по вызову на попытку — быстрее набрать порог.
      for (let i = 0; i < 4; i += 1) {
        await service.analyzeRequest('цемент');
      }
      expect(fetchMock).toHaveBeenCalledTimes(4);

      const blocked = await service.analyzeRequest('цемент');
      expect(blocked).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(4);

      await jest.advanceTimersByTimeAsync(30_001);

      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, geminiOk(analyzePayload())),
      );
      const recovered = await service.analyzeRequest('цемент');

      expect(recovered?.title).toBe('Цемент М400');
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('успешный вызов сбрасывает счётчик сбоев', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(401, { error: { message: 'bad key' } }, 'Unauthorized'),
        )
        .mockResolvedValueOnce(
          jsonResponse(401, { error: { message: 'bad key' } }, 'Unauthorized'),
        )
        .mockResolvedValueOnce(
          jsonResponse(401, { error: { message: 'bad key' } }, 'Unauthorized'),
        )
        .mockResolvedValueOnce(jsonResponse(200, geminiOk(analyzePayload())))
        .mockResolvedValue(
          jsonResponse(401, { error: { message: 'bad key' } }, 'Unauthorized'),
        );
      globalThis.fetch = fetchMock;
      const service = buildService();

      await service.analyzeRequest('цемент');
      await service.analyzeRequest('цемент');
      await service.analyzeRequest('цемент');
      const ok = await service.analyzeRequest('цемент');
      expect(ok?.title).toBe('Цемент М400');

      // Счётчик сбоев обнулился успешным вызовом — нужно снова 4 подряд,
      // чтобы открыть предохранитель, а не 1.
      for (let i = 0; i < 3; i += 1) {
        const r = await service.analyzeRequest('цемент');
        expect(r).toBeNull();
      }
      expect(fetchMock).toHaveBeenCalledTimes(7); // 3 + 1 успешный + 3, без пропуска сетью
    });
  });

  describe('дневной бюджет токенов', () => {
    it('не трогает сеть, когда бюджет на сегодня уже исчерпан', async () => {
      jest.setSystemTime(new Date('2032-03-01T10:00:00Z'));
      geminiLogStore.push({
        purpose: 'analyze',
        ok: true,
        status: 200,
        ms: 10,
        promptChars: 1,
        responseChars: 1,
        promptTokens: 900,
        outputTokens: 200,
      });
      expect(geminiLogStore.tokensToday()).toBe(1100);

      const fetchMock = jest.fn();
      globalThis.fetch = fetchMock;
      const service = buildService({
        GEMINI_API_KEY: 'test-key',
        GEMINI_DAILY_TOKEN_BUDGET: '1000',
      });

      const result = await service.analyzeRequest('цемент');

      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('пропуск по бюджету не открывает предохранитель', async () => {
      jest.setSystemTime(new Date('2032-03-02T10:00:00Z'));
      geminiLogStore.push({
        purpose: 'analyze',
        ok: true,
        status: 200,
        ms: 10,
        promptChars: 1,
        responseChars: 1,
        promptTokens: 900,
        outputTokens: 200,
      });

      const fetchMock = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, geminiOk(analyzePayload())));
      globalThis.fetch = fetchMock;
      const service = buildService({
        GEMINI_API_KEY: 'test-key',
        GEMINI_DAILY_TOKEN_BUDGET: '1000',
      });

      // Несколько запросов подряд упираются в бюджет, а не в реальные сбои.
      for (let i = 0; i < 5; i += 1) {
        await service.analyzeRequest('цемент');
      }
      expect(fetchMock).not.toHaveBeenCalled();

      // Бюджет снят — предохранитель должен быть закрыт, звонок проходит.
      jest.setSystemTime(new Date('2032-03-03T10:00:00Z'));
      const result = await service.analyzeRequest('цемент');

      expect(result?.title).toBe('Цемент М400');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('без переменной окружения бюджет не ограничивает вызовы', async () => {
      jest.setSystemTime(new Date('2032-03-04T10:00:00Z'));
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse(
            200,
            geminiOk(analyzePayload(), { prompt: 100_000, output: 100_000 }),
          ),
        );
      globalThis.fetch = fetchMock;
      const service = buildService({ GEMINI_API_KEY: 'test-key' });

      const result = await service.analyzeRequest('цемент');

      expect(result?.title).toBe('Цемент М400');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
