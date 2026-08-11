import { useTranslation } from 'react-i18next';
import type { AppLang } from '../i18n/lang';
import { setStoredLang } from '../i18n/lang';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'kk' ? 'kk' : 'ru') as AppLang;

  function setLang(next: AppLang) {
    if (next === lang) return;
    setStoredLang(next);
    void i18n.changeLanguage(next);
  }

  return (
    <div
      className="lang-switch"
      style={{
        display: 'inline-flex',
        gap: 4,
        ...(compact ? {} : { marginLeft: 8 }),
      }}
    >
      <button
        type="button"
        className={`tool-pill${lang === 'ru' ? ' lang-active' : ''}`}
        onClick={() => setLang('ru')}
      >
        Рус
      </button>
      <button
        type="button"
        className={`tool-pill${lang === 'kk' ? ' lang-active' : ''}`}
        onClick={() => setLang('kk')}
      >
        Қаз
      </button>
    </div>
  );
}
