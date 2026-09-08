import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const me = vi.fn();
const heartbeat = vi.fn(() =>
  Promise.resolve({ ok: true, lastSeenAt: '2026-09-03T12:00:00.000Z' }),
);

vi.mock('../api', () => ({
  usersApi: {
    me: () => me(),
    heartbeat: () => heartbeat(),
  },
  authApi: { login: vi.fn(), register: vi.fn() },
}));

import { ApiError } from '../api/client';
import type { User } from '../types';
import { AuthProvider, useAuth } from './AuthContext';

const TOKEN_KEY = 'huphup_token';
const CACHE_KEY = 'huphup_user_cache';

const cachedUser = {
  id: 'u1',
  email: 'buyer@huphup.test',
  fullName: 'Айгуль',
  role: 'BUYER',
} as unknown as User;

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <span data-testid="probe">loading</span>;
  return <span data-testid="probe">{user ? user.email : 'anon'}</span>;
}

function renderWithSession() {
  localStorage.setItem(TOKEN_KEY, 'token-123');
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(cachedUser));
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('обрыв связи не выбрасывает пользователя из аккаунта', async () => {
    me.mockRejectedValue(new ApiError(0, 'network'));
    renderWithSession();

    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toBe(cachedUser.email),
    );
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-123');
  });

  it('таймаут запроса тоже сохраняет сессию', async () => {
    me.mockRejectedValue(new ApiError(0, 'timeout'));
    renderWithSession();

    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toBe(cachedUser.email),
    );
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-123');
  });

  it('503 от бэкенда (база недоступна) не разлогинивает', async () => {
    me.mockRejectedValue(new ApiError(503, 'degraded'));
    renderWithSession();

    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toBe(cachedUser.email),
    );
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-123');
  });

  it('401 стирает токен и переводит в гости', async () => {
    me.mockRejectedValue(new ApiError(401, 'Unauthorized'));
    renderWithSession();

    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toBe('anon'),
    );
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('403 тоже завершает сессию', async () => {
    me.mockRejectedValue(new ApiError(403, 'Forbidden'));
    renderWithSession();

    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toBe('anon'),
    );
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('успешный ответ обновляет профиль из ответа сервера', async () => {
    me.mockResolvedValue({ ...cachedUser, email: 'fresh@huphup.test' });
    renderWithSession();

    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toBe('fresh@huphup.test'),
    );
  });

  it('без токена профиль не запрашивается', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('probe').textContent).toBe('anon'),
    );
    expect(me).not.toHaveBeenCalled();
  });
});
