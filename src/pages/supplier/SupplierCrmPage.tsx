import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { leadsApi } from '../../api';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { Lead } from '../../types';

export function SupplierCrmPage() {
  const { t } = useTranslation();
  const { formatDate } = useAppLocale();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void leadsApi
      .list()
      .then(setLeads)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  const columns = useMemo(
    () => ({
      NEW: leads.filter((l) => l.status === 'NEW'),
      VIEWED: leads.filter((l) => l.status === 'VIEWED'),
      OFFERED: leads.filter((l) => l.status === 'OFFERED'),
      SKIPPED: leads.filter((l) => l.status === 'SKIPPED'),
    }),
    [leads],
  );

  const columnTitles = {
    NEW: t('supplier.colNew'),
    VIEWED: t('supplier.colViewed'),
    OFFERED: t('supplier.colOffered'),
    SKIPPED: t('supplier.colSkipped'),
  } as const;

  return (
    <SupplierLayout
      crumb={t('supplier.crmCrumb')}
      actions={
        <Link className="primary" to="/supplier/leads">
          {t('supplier.newLeadsAction')}
        </Link>
      }
    >
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t('supplier.dealsTitle')}</h1>
            <p>
              {loading
                ? t('supplier.leadsLoading')
                : t('supplier.leadsTotal', { count: leads.length })}
            </p>
          </div>
        </div>
        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}
        <div className="stat-grid">
          <div className="stat">
            <small>{t('supplier.statNew')}</small>
            <b>{columns.NEW.length}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statViewed')}</small>
            <b>{columns.VIEWED.length}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statOffered')}</small>
            <b>{columns.OFFERED.length}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statTotal')}</small>
            <b>{leads.length}</b>
          </div>
        </div>
        <div className="kanban">
          {(['NEW', 'VIEWED', 'OFFERED', 'SKIPPED'] as const).map((key) => (
            <div key={key} className="column">
              <div className="column-head">
                <b>{columnTitles[key]}</b>
                <span className="count">{columns[key].length}</span>
              </div>
              {columns[key].map((lead) => (
                <Link key={lead.id} className="deal" to="/supplier/leads">
                  <div className="deal-title">{lead.request.title}</div>
                  <p>
                    {lead.request.city ?? t('common.empty')} · score {lead.score.toFixed(0)}
                  </p>
                  <div className="deal-foot">
                    <b>{lead.request.code}</b>
                    <span>{formatDate(lead.createdAt)}</span>
                  </div>
                </Link>
              ))}
              {!loading && columns[key].length === 0 ? (
                <p className="meta" style={{ padding: 8 }}>
                  {t('common.emptyInDb')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </SupplierLayout>
  );
}
