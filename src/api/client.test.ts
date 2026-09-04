import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('подставляет токен в заголовок Authorization', async () => {
    localStorage.setItem('huphup_token', 'token-123');
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(jsonResponse(200, { ok: true })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api('/users/me');

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-123');
  });

  it('без токена заголовок не ставится', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(jsonResponse(200, { ok: true })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api('/platform/live');

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('сохраняет код и текст ошибки сервера', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(401, { message: 'Unauthorized' }))),
    );

    const err = await api('/users/me').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).message).toBe('Unauthorized');
  });

  it('склеивает список сообщений валидации', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(400, { message: ['email must be an email', 'password too short'] }),
        ),
      ),
    );

    const err = (await api('/auth/register').catch((e: unknown) => e)) as ApiError;

    expect(err.status).toBe(400);
    expect(err.message).toBe('email must be an email, password too short');
  });

  it('обрыв сети превращается в ApiError со статусом 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const err = (await api('/users/me').catch((e: unknown) => e)) as ApiError;

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toBe('network');
  });

  it('таймаут отличается от обрыва сети', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(timeout)),
    );

    const err = (await api('/users/me').catch((e: unknown) => e)) as ApiError;

    expect(err.status).toBe(0);
    expect(err.message).toBe('timeout');
  });

  it('204 возвращает пустой результат, а не падает на разборе JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 204,
          json: () => Promise.reject(new Error('нет тела')),
        } as unknown as Response),
      ),
    );

    await expect(api('/companies/me/logo')).resolves.toBeUndefined();
  });
});
