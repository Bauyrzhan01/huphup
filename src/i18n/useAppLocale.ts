import { useTranslation } from 'react-i18next';
import { localeFor, type AppLang } from '../i18n/lang';

export function useAppLocale() {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'kk' ? 'kk' : 'ru') as AppLang;
  const locale = localeFor(lang);

  function formatDate(value: string | Date) {
    return new Date(value).toLocaleDateString(locale);
  }

  function formatDateTime(value: string | Date) {
    return new Date(value).toLocaleString(locale);
  }

  function formatMoney(value: string | number) {
    const n = typeof value === 'string' ? Number(value) : value;
    return `${n.toLocaleString(locale)} ₸`;
  }

  return { lang, locale, formatDate, formatDateTime, formatMoney };
}

export function useStatusLabel() {
  const { t } = useTranslation();

  return {
    request: (status: string) =>
      t(`status.request.${status}`, { defaultValue: status }),
    offer: (status: string) =>
      t(`status.offer.${status}`, { defaultValue: status }),
    lead: (status: string) =>
      t(`status.lead.${status}`, { defaultValue: status }),
  };
}

export function useRoleLabel() {
  const { t } = useTranslation();
  return (role: string) => t(`role.${role}`, { defaultValue: role });
}
