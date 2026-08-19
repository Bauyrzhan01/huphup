import { readCachedUser } from '../auth/userCache';

function key(suffix: string) {
  const userId = readCachedUser()?.id ?? 'anon';
  return `huphup_conv_${suffix}_${userId}`;
}

function readIds(suffix: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(suffix)) || '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(suffix: string, ids: string[]) {
  localStorage.setItem(key(suffix), JSON.stringify(ids));
}

export function hideConversationLocally(id: string) {
  writeIds('hidden', [...new Set([...readIds('hidden'), id])]);
  writeIds(
    'pinned',
    readIds('pinned').filter((x) => x !== id),
  );
}

export function pinConversationLocally(id: string, pinned: boolean) {
  const set = new Set(readIds('pinned'));
  if (pinned) set.add(id);
  else set.delete(id);
  writeIds('pinned', [...set]);
}

export function applyConversationPrefs<T extends { id: string; isPinned?: boolean }>(items: T[]): T[] {
  const hidden = new Set(readIds('hidden'));
  const pinned = new Set(readIds('pinned'));
  return items
    .filter((item) => !hidden.has(item.id))
    .map((item) => ({ ...item, isPinned: Boolean(item.isPinned || pinned.has(item.id)) }))
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
}
