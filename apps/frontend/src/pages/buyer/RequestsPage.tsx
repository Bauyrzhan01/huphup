import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestsApi } from '../../api';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { useAppLocale, useStatusLabel } from '../../i18n/useAppLocale';
import type { RequestItem } from '../../types';

export function RequestsPage() {
  const { t } = useTranslation();
  const { formatDate } = useAppLocale();
  const statusLabel = useStatusLabel();
  const [items, setItems] = useState<RequestItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void requestsApi
      .list()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  const stats = useMemo(
    () => ({
      total: items.length,
      open: items.filter((i) => i.status === 'PUBLISHED').length,
      progress: items.filter((i) => i.status === 'IN_PROGRESS').length,
      offers: items.reduce((sum, i) => sum + (i._count?.offers ?? 0), 0),
    }),
    [items],
  );

  return (
    <BuyerLayout
      crumb={t('requests.title')}
      actions={
        <Link className="primary" to="/app">
          {t('requests.newShort')}
        </Link>
      }
    >
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t('requests.title')}</h1>
            <p>{t('requests.subtitle')}</p>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat">
            <small>{t('requests.statTotal')}</small>
            <b>{stats.total}</b>
          </div>
          <div className="stat">
            <small>{t('requests.statOpen')}</small>
            <b>{stats.open}</b>
          </div>
          <div className="stat">
            <small>{t('requests.statProgress')}</small>
            <b>{stats.progress}</b>
          </div>
          <div className="stat">
            <small>{t('requests.statOffers')}</small>
            <b>{stats.offers}</b>
          </div>
        </div>

        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}

        {loading ? (
          <p className="assist-note">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <div className="panel chat-empty-state">
            <b>{t('requests.emptyTitle')}</b>
            <p>{t('requests.emptyHint')}</p>
            <Link className="primary" to="/app">
              {t('requests.newShort')}
            </Link>
          </div>
        ) : (
          <div className="request-cards">
            {items.map((item) => (
              <Link key={item.id} className="request-card" to={`/requests/${item.id}`}>
                <div className="request-card-top">
                  <span className="lead-code">{item.code}</span>
                  <span
                    className={`badge ${
                      item.status === 'PUBLISHED'
                        ? 'green'
                        : item.status === 'IN_PROGRESS'
                          ? 'amber'
                          : 'blue'
                    }`}
                  >
                    {statusLabel.request(item.status)}
                  </span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="lead-info-grid request-card-grid">
                  <div className="lead-info-cell">
                    <small>{t('requests.city')}</small>
                    <b>{item.city ?? t('common.empty')}</b>
                  </div>
                  <div className="lead-info-cell">
                    <small>{t('requests.quantity')}</small>
                    <b>{item.quantity ?? t('common.empty')}</b>
                  </div>
                  <div className="lead-info-cell">
                    <small>{t('requests.offersCount')}</small>
                    <b>{item._count?.offers ?? 0}</b>
                  </div>
                  <div className="lead-info-cell">
                    <small>{t('requests.created')}</small>
                    <b>{formatDate(item.createdAt)}</b>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </BuyerLayout>
  );
}
