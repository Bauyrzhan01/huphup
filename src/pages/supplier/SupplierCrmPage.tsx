import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi, leadsApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAppLocale } from '../../i18n/useAppLocale';
import type { CompanyMember, Lead } from '../../types';

type AssigneeFilter = 'all' | 'mine' | 'unassigned' | string;

export function SupplierCrmPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatDate } = useAppLocale();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [filter, setFilter] = useState<AssigneeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([leadsApi.list(), companiesApi.me().catch(() => null)])
      .then(([list, company]) => {
        setLeads(list);
        if (company) {
          setIsOwner(Boolean(company.isOwner));
          setMembers(company.members ?? []);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  const filtered = useMemo(() => {
    if (filter === 'all') return leads;
    if (filter === 'mine') return leads.filter((l) => l.assigneeId === user?.id);
    if (filter === 'unassigned') return leads.filter((l) => !l.assigneeId);
    return leads.filter((l) => l.assigneeId === filter);
  }, [leads, filter, user?.id]);

  const columns = useMemo(
    () => ({
      NEW: filtered.filter((l) => l.status === 'NEW'),
      VIEWED: filtered.filter((l) => l.status === 'VIEWED'),
      OFFERED: filtered.filter((l) => l.status === 'OFFERED'),
      SKIPPED: filtered.filter((l) => l.status === 'SKIPPED'),
    }),
    [filtered],
  );

  const columnTitles = {
    NEW: t('supplier.colNew'),
    VIEWED: t('supplier.colViewed'),
    OFFERED: t('supplier.colOffered'),
    SKIPPED: t('supplier.colSkipped'),
  } as const;

  const unassignedCount = leads.filter((l) => !l.assigneeId).length;
  const mineCount = leads.filter((l) => l.assigneeId === user?.id).length;

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

        <div className="stat-grid crm-stats">
          <div className="stat">
            <small>{t('supplier.statNew')}</small>
            <b>{leads.filter((l) => l.status === 'NEW').length}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statViewed')}</small>
            <b>{leads.filter((l) => l.status === 'VIEWED').length}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statOffered')}</small>
            <b>{leads.filter((l) => l.status === 'OFFERED').length}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statUnassigned')}</small>
            <b>{unassignedCount}</b>
          </div>
        </div>

        <div className="crm-filters">
          <label className="meta" htmlFor="crm-assignee-filter">
            {t('supplier.filterByManager')}
          </label>
          <select
            id="crm-assignee-filter"
            className="filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as AssigneeFilter)}
          >
            <option value="all">{t('supplier.filterAll')}</option>
            <option value="mine">{t('supplier.filterMine', { count: mineCount })}</option>
            <option value="unassigned">
              {t('supplier.filterUnassigned', { count: unassignedCount })}
            </option>
            {isOwner
              ? members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.fullName}
                  </option>
                ))
              : null}
          </select>
        </div>

        <div className="kanban kanban-crm">
          {(['NEW', 'VIEWED', 'OFFERED', 'SKIPPED'] as const).map((key) => (
            <div key={key} className="column">
              <div className="column-head">
                <b>{columnTitles[key]}</b>
                <span className="count">{columns[key].length}</span>
              </div>
              {columns[key].map((lead) => (
                <Link
                  key={lead.id}
                  className="deal deal-link"
                  to={`/supplier/leads?leadId=${lead.id}`}
                >
                  <div className="deal-top">
                    <span className="lead-code">{lead.request.code}</span>
                    <span className="deal-score">{Math.round(lead.score)}</span>
                  </div>
                  <div className="deal-title">{lead.request.title}</div>
                  <p className="deal-meta">
                    {lead.request.city ?? t('common.empty')}
                    {lead.request.quantity ? ` · ${lead.request.quantity}` : ''}
                  </p>
                  <div className="deal-assignee">
                    {lead.assignee ? (
                      <>
                        <UserAvatar
                          name={lead.assignee.fullName}
                          avatarUrl={lead.assignee.avatarUrl}
                          className="deal-assignee-avatar"
                        />
                        <span>{lead.assignee.fullName}</span>
                      </>
                    ) : (
                      <span className="deal-unassigned">{t('supplier.unassigned')}</span>
                    )}
                  </div>
                  <div className="deal-foot">
                    <span>{formatDate(lead.createdAt)}</span>
                  </div>
                </Link>
              ))}
              {!loading && columns[key].length === 0 ? (
                <p className="kanban-empty">{t('supplier.kanbanEmpty')}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </SupplierLayout>
  );
}
