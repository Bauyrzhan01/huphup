import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getStoredLang, setStoredLang } from './lang';
import ru from './locales/ru.json';
import kk from './locales/kk.json';

const initialLang = getStoredLang();
setStoredLang(initialLang);

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    kk: { translation: kk },
  },
  lng: initialLang,
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
});

export default i18n;
