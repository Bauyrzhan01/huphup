import { useTranslation } from 'react-i18next';

/** Shown while a route chunk is being fetched. Matches ProtectedRoute's loader. */
export function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div className="home-shell">
      <div className="assist-note">{t('common.loading')}</div>
    </div>
  );
}
