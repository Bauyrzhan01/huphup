import { readCachedUser } from '../auth/userCache';

const PREFIX = 'huphup_hidden_requests_';

function storageKey() {
  const userId = readCachedUser()?.id ?? 'anon';
  return `${PREFIX}${userId}`;
}

export function getHiddenRequestIds(): string[] {
  try {
    const raw = localStorage.getItem(storageKey());
    const parsed = JSON.parse(raw || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function hideRequestLocally(id: string) {
  const ids = new Set(getHiddenRequestIds());
  ids.add(id);
  localStorage.setItem(storageKey(), JSON.stringify([...ids]));
}

export function filterVisibleRequests<T extends { id: string }>(items: T[]): T[] {
  const hidden = new Set(getHiddenRequestIds());
  if (hidden.size === 0) return items;
  return items.filter((item) => !hidden.has(item.id));
}
