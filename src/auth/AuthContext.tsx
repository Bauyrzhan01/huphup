import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '../api';
import { ApiError } from '../api/client';
import { getToken, setToken } from '../api/client';
import type { AuthUser } from '../api/types';

const USER_CACHE_KEY = 'huphup_admin_user';

function readCachedUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AuthUser | null) {
  try {
    if (user) sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(USER_CACHE_KEY);
  } catch {
    /* приватный режим браузера — переживём без кэша */
  }
}

type AuthContextValue = {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() =>
    getToken() ? readCachedUser() : null,
  );

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    if (res.user.role !== 'ADMIN') {
      throw new ApiError(
        403,
        'Этот аккаунт не администратор — вход в панель запрещён',
      );
    }
    setToken(res.accessToken);
    setUser(res.user);
    writeCachedUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    writeCachedUser(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * A 401/403 from any admin call means the token is dead or was never an
 * admin's — send them back to the login screen. Any other failure (network
 * drop, timeout, 5xx) must NOT log the admin out; it's just a bad request.
 */
export function isAuthError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403);
}
