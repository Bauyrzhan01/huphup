import { useTranslation } from 'react-i18next';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { LeadActivity } from '../../types';

const TYPE_LABELS: Record<string, string> = {
  CREATED: 'crmActCreated',
  VIEWED: 'crmActViewed',
  CLAIMED: 'crmActClaimed',
  REASSIGNED: 'crmActReassigned',
  STATUS_CHANGED: 'crmActStatus',
  OFFER_SENT: 'crmActOffer',
  SKIPPED: 'crmActSkipped',
  NOTE_ADDED: 'crmActNote',
  NEXT_STEP_SET: 'crmActNextStep',
};

type Props = {
  items: LeadActivity[];
  loading?: boolean;
};

export function LeadActivityTimeline({ items, loading }: Props) {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();

  if (loading) {
    return <p className="meta">{t('common.loading')}</p>;
  }
  if (!items.length) {
    return <p className="meta">{t('supplier.timelineEmpty')}</p>;
  }

  return (
    <ul className="lead-timeline">
      {items.map((item) => (
        <li key={item.id} className="lead-timeline-item">
          <div className="lead-timeline-dot" />
          <div className="lead-timeline-body">
            <div className="lead-timeline-top">
              <b>{t(`supplier.${TYPE_LABELS[item.type] ?? 'crmActStatus'}`)}</b>
              <small>{formatDateTime(item.createdAt)}</small>
            </div>
            <p>{item.message}</p>
            {item.user ? (
              <small className="meta">{item.user.fullName}</small>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
