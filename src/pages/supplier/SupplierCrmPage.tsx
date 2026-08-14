import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi, leadsApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { UserAvatar } from '../../components/UserAvatar';
import { PresenceDot } from '../../components/PresenceDot';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAppLocale } from '../../i18n/useAppLocale';
import { isUserOnline } from '../../utils/presence';
import type { CompanyMember, Lead } from '../../types';

type AssigneeFilter = 'all' | 'inbox' | 'mine' | string;

const STAGES = ['NEW', 'VIEWED', 'OFFERED', 'SKIPPED'] as const;

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

    const timer = window.setInterval(() => {
      void leadsApi.list().then(setLeads).catch(() => undefined);
      void companiesApi
        .me()
        .then((company) => setMembers(company.members ?? []))
        .catch(() => undefined);
    }, 40_000);
    return () => window.clearInterval(timer);
  }, [t]);

  const inboxLeads = useMemo(
    () => leads.filter((l) => l.status === 'NEW' && !l.assigneeId),
    [leads],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return leads;
    if (filter === 'inbox') return inboxLeads;
    if (filter === 'mine') return leads.filter((l) => l.assigneeId === user?.id);
    return leads.filter((l) => l.assigneeId === filter);
  }, [leads, filter, user?.id, inboxLeads]);

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

  const mineCount = leads.filter((l) => l.assigneeId === user?.id).length;

  return (
    <SupplierLayout
      crumb={t('supplier.crmCrumb')}
      actions={
        <Link className="ghost" to="/supplier/leads">
          {t('supplier.newLeadsAction')}
        </Link>
      }
    >
      <div className="page crm-page">
        <div className="crm-toolbar">
          <h1>{t('supplier.dealsTitle')}</h1>
          <div className="crm-filter-chips" role="tablist" aria-label={t('supplier.filterByManager')}>
            <button
              type="button"
              className={`chip pick${filter === 'all' ? ' is-on' : ''}`}
              onClick={() => setFilter('all')}
            >
              {t('supplier.filterAll')}
            </button>
            <button
              type="button"
              className={`chip pick${filter === 'inbox' ? ' is-on' : ''}`}
              onClick={() => setFilter('inbox')}
            >
              {t('supplier.filterInbox', { count: inboxLeads.length })}
            </button>
            <button
              type="button"
              className={`chip pick${filter === 'mine' ? ' is-on' : ''}`}
              onClick={() => setFilter('mine')}
            >
              {t('supplier.filterMine', { count: mineCount })}
            </button>
            {isOwner
              ? members.map((m) => (
                  <button
                    key={m.user.id}
                    type="button"
                    className={`chip pick crm-member-chip${filter === m.user.id ? ' is-on' : ''}`}
                    onClick={() => setFilter(m.user.id)}
                  >
                    <span
                      className={`crm-member-online${isUserOnline(m.user.lastSeenAt) ? ' is-on' : ''}`}
                    />
                    {m.user.fullName}
                  </button>
                ))
              : null}
          </div>
        </div>

        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}

        <div className="kanban kanban-crm">
          {STAGES.map((key) => (
            <div key={key} className="column crm-col">
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
                    <span className="deal-date">{formatDate(lead.createdAt)}</span>
                  </div>
                  <div className="deal-title">{lead.request.title}</div>
                  <div className="deal-assignee">
                    {lead.assignee ? (
                      <>
                        <span className="deal-assignee-avatar-wrap">
                          <UserAvatar
                            name={lead.assignee.fullName}
                            avatarUrl={lead.assignee.avatarUrl}
                            className="deal-assignee-avatar"
                          />
                          <PresenceDot lastSeenAt={lead.assignee.lastSeenAt} />
                        </span>
                        <span>{lead.assignee.fullName}</span>
                      </>
                    ) : (
                      <span className="deal-unassigned">{t('supplier.needsManager')}</span>
                    )}
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
