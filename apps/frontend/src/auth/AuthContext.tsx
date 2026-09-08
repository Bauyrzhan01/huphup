import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi, usersApi } from '../api';
import { ApiError } from '../api/client';
import type { User } from '../types';
import { readCachedUser, writeCachedUser } from './userCache';
import { clearHomeChatStorage } from '../utils/homeChatStorage';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    role?: 'BUYER' | 'SUPPLIER';
  }) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  patchUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function hasToken() {
  return Boolean(localStorage.getItem('huphup_token'));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() =>
    hasToken() ? readCachedUser() : null,
  );
  const [loading, setLoading] = useState(() => hasToken() && !readCachedUser());

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('huphup_token');
    if (!token) {
      setUser(null);
      writeCachedUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await usersApi.me();
      setUser(me);
      writeCachedUser(me);
    } catch (err) {
      // Only an explicit rejection by the server means the session is gone.
      // A dead network, a timeout or a 5xx must not throw the user out —
      // keep the cached profile and let the next call try again.
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 401 || status === 403) {
        localStorage.removeItem('huphup_token');
        writeCachedUser(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let timer: number | undefined;

    async function beat() {
      if (cancelled || document.visibilityState === 'hidden') return;
      try {
        const res = await usersApi.heartbeat();
        if (!cancelled) {
          setUser((prev) => {
            if (!prev) return prev;
            const next = { ...prev, lastSeenAt: res.lastSeenAt };
            writeCachedUser(next);
            return next;
          });
        }
      } catch {
        /* ignore transient heartbeat errors */
      }
    }

    void beat();
    timer = window.setInterval(() => void beat(), 30_000);

    function onVisible() {
      if (document.visibilityState === 'visible') void beat();
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    localStorage.setItem('huphup_token', res.accessToken);
    setUser(res.user);
    writeCachedUser(res.user);
    setLoading(false);
    return res.user;
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; fullName: string; role?: 'BUYER' | 'SUPPLIER' }) => {
      const res = await authApi.register({ ...input, role: input.role ?? 'BUYER' });
      localStorage.setItem('huphup_token', res.accessToken);
      setUser(res.user);
      writeCachedUser(res.user);
      setLoading(false);
      return res.user;
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem('huphup_token');
    writeCachedUser(null);
    clearHomeChatStorage();
    setUser(null);
    setLoading(false);
  }, []);

  const patchUser = useCallback((next: User) => {
    setUser(next);
    writeCachedUser(next);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, patchUser }),
    [user, loading, login, register, logout, refresh, patchUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
