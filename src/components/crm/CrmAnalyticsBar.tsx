import { useTranslation } from 'react-i18next';
import type { CrmAnalytics } from '../../types';

type Props = {
  analytics: CrmAnalytics | null;
};

export function CrmAnalyticsBar({ analytics }: Props) {
  const { t } = useTranslation();
  if (!analytics) return null;

  return (
    <div className="crm-analytics-bar">
      <div className="crm-stat">
        <small>{t('supplier.crmStatTotal')}</small>
        <b>{analytics.total}</b>
      </div>
      <div className="crm-stat">
        <small>{t('supplier.crmStatConversion')}</small>
        <b>{analytics.conversionRate}%</b>
      </div>
      <div className="crm-stat">
        <small>{t('supplier.crmStatResponse')}</small>
        <b>
          {analytics.avgResponseHours != null
            ? t('supplier.crmStatResponseHours', { hours: analytics.avgResponseHours })
            : '—'}
        </b>
      </div>
      <div className="crm-stat">
        <small>{t('supplier.crmStatIdle')}</small>
        <b className={analytics.idleCount > 0 ? 'is-warn' : ''}>{analytics.idleCount}</b>
      </div>
      <div className="crm-stat">
        <small>{t('supplier.crmStatOverdue')}</small>
        <b className={analytics.overdueCount > 0 ? 'is-danger' : ''}>{analytics.overdueCount}</b>
      </div>
    </div>
  );
}
