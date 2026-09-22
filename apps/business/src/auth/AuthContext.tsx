import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, setAuthToken } from '../api/client';
import { authApi, type User } from '../api/auth';
import { tokenStore } from './tokenStore';

type AuthState = {
  user: User | null;
  /** True until the stored session has been checked on launch. */
  restoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { fullName: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-read /users/me, e.g. after the company was created. */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await tokenStore.get().catch(() => null);
      if (!token) return;
      setAuthToken(token);
      try {
        const me = await authApi.me();
        if (alive) setUser(me);
      } catch (err) {
        // Only a rejected token ends the session; a network hiccup must not log people out.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setAuthToken(null);
          await tokenStore.clear().catch(() => undefined);
        }
      }
    })().finally(() => alive && setRestoring(false));
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (token: string, next: User) => {
    setAuthToken(token);
    await tokenStore.set(token);
    setUser(next);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email.trim().toLowerCase(), password);
      await signIn(res.accessToken, res.user);
    },
    [signIn],
  );

  const register = useCallback(
    async (input: { fullName: string; email: string; password: string }) => {
      const res = await authApi.register({
        fullName: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        password: input.password,
      });
      await signIn(res.accessToken, res.user);
    },
    [signIn],
  );

  const logout = useCallback(async () => {
    setAuthToken(null);
    await tokenStore.clear().catch(() => undefined);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    setUser(await authApi.me());
  }, []);

  const value = useMemo(
    () => ({ user, restoring, login, register, logout, refresh }),
    [user, restoring, login, register, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
