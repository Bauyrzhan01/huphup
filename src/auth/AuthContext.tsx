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
import type { User } from '../types';
import { readCachedUser, writeCachedUser } from './userCache';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
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
    } catch {
      localStorage.removeItem('huphup_token');
      writeCachedUser(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login({ email, password });
    localStorage.setItem('huphup_token', res.accessToken);
    setUser(res.user);
    writeCachedUser(res.user);
    setLoading(false);
    return res.user;
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; fullName: string }) => {
      const res = await authApi.register({ ...input, role: 'BUYER' });
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
