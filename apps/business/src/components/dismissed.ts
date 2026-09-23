import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'huphup_dismissed_popups';

/**
 * Pop-ups a person closed, so they do not come back on the next launch.
 * Same storage split as the auth token: SecureStore on a phone, localStorage on web.
 */
async function read(): Promise<string[]> {
  try {
    const raw =
      Platform.OS === 'web'
        ? (globalThis.localStorage?.getItem(KEY) ?? null)
        : await SecureStore.getItemAsync(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export const dismissedPopups = {
  read,
  async add(id: string) {
    const next = [...new Set([...(await read()), id])].slice(-50);
    const raw = JSON.stringify(next);
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
      else await SecureStore.setItemAsync(KEY, raw);
    } catch {
      // A closed pop-up that fails to persist simply shows again later.
    }
  },
};
