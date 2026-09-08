export type AppLang = 'ru' | 'kk';

export const LANG_STORAGE_KEY = 'huphup_lang';

export function getStoredLang(): AppLang {
  const v = localStorage.getItem(LANG_STORAGE_KEY);
  return v === 'kk' ? 'kk' : 'ru';
}

export function setStoredLang(lang: AppLang) {
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  document.documentElement.lang = lang;
}

export function localeFor(lang: AppLang) {
  return lang === 'kk' ? 'kk-KZ' : 'ru-RU';
}
