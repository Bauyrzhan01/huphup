import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'huphup_token';

// SecureStore is native-only (Keychain / Keystore); the web build falls back to localStorage.
export const tokenStore = {
  async get() {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return SecureStore.getItemAsync(KEY);
  },
  async set(token: string) {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, token);
    else await SecureStore.setItemAsync(KEY, token);
  },
  async clear() {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  },
};
