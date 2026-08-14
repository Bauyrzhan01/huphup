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

function nextActionKey(lead: Lead) {
  if (lead.status === 'NEW' && !lead.assigneeId) return 'crmNextTake';
  if (lead.status === 'VIEWED') return 'crmNextOffer';
  if (lead.status === 'OFFERED') return 'crmNextWait';
  if (lead.status === 'SKIPPED') return 'crmNextSkipped';
  return 'crmNextTake';
}

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
  const inWork = useMemo(
    () => leads.filter((l) => l.status === 'VIEWED'),
    [leads],
  );
  const offered = useMemo(
    () => leads.filter((l) => l.status === 'OFFERED'),
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

  const columnMeta = {
    NEW: { title: t('supplier.colNew'), hint: t('supplier.colNewHint') },
    VIEWED: { title: t('supplier.colViewed'), hint: t('supplier.colViewedHint') },
    OFFERED: { title: t('supplier.colOffered'), hint: t('supplier.colOfferedHint') },
    SKIPPED: { title: t('supplier.colSkipped'), hint: t('supplier.colSkippedHint') },
  } as const;

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
      <div className="page crm-page">
        <div className="page-head">
          <div>
            <h1>{t('supplier.dealsTitle')}</h1>
            <p>{t('supplier.crmSubtitle')}</p>
          </div>
        </div>

        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}

        <div className="stat-grid crm-stats">
          <div className="stat">
            <small>{t('supplier.statInbox')}</small>
            <b>{inboxLeads.length}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statInWork')}</small>
            <b>{inWork.length}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statOffered')}</small>
            <b>{offered.length}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statTotal')}</small>
            <b>{loading ? '—' : leads.length}</b>
          </div>
        </div>

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

        <div className="kanban kanban-crm">
          {STAGES.map((key) => (
            <div key={key} className={`column crm-col crm-col-${key.toLowerCase()}`}>
              <div className="column-head">
                <div>
                  <b>{columnMeta[key].title}</b>
                  <p className="crm-col-hint">{columnMeta[key].hint}</p>
                </div>
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
                        <span className="deal-assignee-avatar-wrap">
                          <UserAvatar
                            name={lead.assignee.fullName}
                            avatarUrl={lead.assignee.avatarUrl}
                            className="deal-assignee-avatar"
                          />
                          <PresenceDot lastSeenAt={lead.assignee.lastSeenAt} />
                        </span>
                        <span className="deal-assignee-copy">
                          <b>{lead.assignee.fullName}</b>
                          <PresenceDot
                            lastSeenAt={lead.assignee.lastSeenAt}
                            showLabel
                            className="deal-presence-label"
                          />
                        </span>
                      </>
                    ) : (
                      <span className="deal-unassigned">{t('supplier.needsManager')}</span>
                    )}
                  </div>
                  <div className="deal-next">{t(`supplier.${nextActionKey(lead)}`)}</div>
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
