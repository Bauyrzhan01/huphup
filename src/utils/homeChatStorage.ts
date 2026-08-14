export const LEGACY_HOME_CHAT_KEY = 'huphup_home_chat';

const PREFIX = 'huphup_home_chat_';

export function homeChatKey(userId: string) {
  return `${PREFIX}${userId}`;
}

/** Remove chat drafts so they never leak between accounts in the same tab. */
export function clearHomeChatStorage() {
  sessionStorage.removeItem(LEGACY_HOME_CHAT_KEY);
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(PREFIX)) {
      sessionStorage.removeItem(key);
    }
  }
}
