import type { User } from '../types';

const USER_CACHE_KEY = 'huphup_user_cache';

export function readCachedUser(): User | null {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function writeCachedUser(user: User | null) {
  if (user) {
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(USER_CACHE_KEY);
  }
}
