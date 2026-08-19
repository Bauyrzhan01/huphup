import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi, crmApi, leadsApi } from '../../api';
import { CrmAnalyticsBar } from '../../components/crm/CrmAnalyticsBar';
import { CrmKanbanBoard } from '../../components/crm/CrmKanbanBoard';
import { CrmListView } from '../../components/crm/CrmListView';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAuth } from '../../auth/AuthContext';
import { useAppLocale } from '../../i18n/useAppLocale';
import { isUserOnline } from '../../utils/presence';
import type { CompanyMember, CrmAnalytics, CrmStage, Lead } from '../../types';

type AssigneeFilter = 'all' | 'inbox' | 'mine' | string;
type ViewMode = 'kanban' | 'list';

export function SupplierCrmPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatDate, formatDateTime } = useAppLocale();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [analytics, setAnalytics] = useState<CrmAnalytics | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [filter, setFilter] = useState<AssigneeFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [list, company, stageList, stats] = await Promise.all([
      leadsApi.list(),
      companiesApi.me().catch(() => null),
      crmApi.stages().catch(() => [] as CrmStage[]),
      crmApi.analytics().catch(() => null),
    ]);
    setLeads(list);
    setStages(stageList);
    setAnalytics(stats);
    if (company) {
      setIsOwner(Boolean(company.isOwner));
      setMembers(company.members ?? []);
    }
  }, []);

  useEffect(() => {
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 40_000);
    return () => window.clearInterval(timer);
  }, [refresh, t]);

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

  const columns = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const stage of stages) {
      map[stage.status] = filtered.filter((l) => l.status === stage.status);
    }
    return map;
  }, [filtered, stages]);

  const stageLabel = useCallback(
    (status: string) =>
      stages.find((s) => s.status === status)?.label ?? status,
    [stages],
  );

  const mineCount = leads.filter((l) => l.assigneeId === user?.id).length;

  async function onDrop(leadId: string, status: string) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === status) return;
    try {
      await leadsApi.updateStatus(leadId, status);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function bulkSkip() {
    if (!selectedIds.length) return;
    try {
      await leadsApi.bulk({ ids: selectedIds, action: 'skip' });
      setSelectedIds([]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.length === filtered.length ? [] : filtered.map((l) => l.id),
    );
  }

  return (
    <SupplierLayout
      crumb={t('supplier.dealsTitle')}
      actions={
        <div className="crm-head-actions">
          {isOwner ? (
            <Link className="ghost" to="/supplier/crm/settings">
              {t('supplier.crmSettings')}
            </Link>
          ) : null}
          <Link className="ghost" to="/supplier/leads">
            {t('supplier.newLeadsAction')}
          </Link>
        </div>
      }
    >
      <div className="page crm-page">
        <CrmAnalyticsBar analytics={analytics} />

        <div className="crm-toolbar">
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
          <div className="crm-view-toggle">
            <button
              type="button"
              className={`chip pick${viewMode === 'kanban' ? ' is-on' : ''}`}
              onClick={() => setViewMode('kanban')}
            >
              {t('supplier.viewKanban')}
            </button>
            <button
              type="button"
              className={`chip pick${viewMode === 'list' ? ' is-on' : ''}`}
              onClick={() => setViewMode('list')}
            >
              {t('supplier.viewList')}
            </button>
          </div>
        </div>

        {viewMode === 'list' && selectedIds.length > 0 ? (
          <div className="crm-bulk-bar">
            <span>{t('supplier.selectedCount', { count: selectedIds.length })}</span>
            <button type="button" className="ghost" onClick={() => void bulkSkip()}>
              {t('supplier.bulkSkip')}
            </button>
          </div>
        ) : null}

        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}

        {viewMode === 'kanban' ? (
          <CrmKanbanBoard
            stages={stages}
            columns={columns}
            loading={loading}
            onDrop={(id, status) => void onDrop(id, status)}
            formatDate={formatDate}
          />
        ) : (
          <CrmListView
            leads={filtered}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onToggleAll={toggleSelectAll}
            formatDateTime={formatDateTime}
            stageLabel={stageLabel}
          />
        )}
      </div>
    </SupplierLayout>
  );
}
