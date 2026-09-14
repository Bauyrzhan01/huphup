import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Inbox } from 'lucide-react';
import { companiesApi, leadsApi, offersApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { AppIcon } from '../../components/AppIcon';
import { UserAvatar } from '../../components/UserAvatar';
import { PresenceDot } from '../../components/PresenceDot';
import { LeadActivityTimeline } from '../../components/crm/LeadActivityTimeline';
import { LeadNotesPanel } from '../../components/crm/LeadNotesPanel';
import { LeadNextStepPanel } from '../../components/crm/LeadNextStepPanel';
import { LeadTasksPanel } from '../../components/crm/LeadTasksPanel';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAppLocale, useStatusLabel } from '../../i18n/useAppLocale';
import type { CompanyMember, Lead, LeadActivity, LeadNote, LeadTask } from '../../types';
import { mapApiError } from '../../utils/apiErrors';

function scoreTone(score: number) {
  if (score >= 85) return 'high';
  if (score >= 70) return 'mid';
  return 'low';
}

export function SupplierLeadsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatDateTime } = useAppLocale();
  const statusLabel = useStatusLabel();
  const [searchParams, setSearchParams] = useSearchParams();
  const leadFromUrl = searchParams.get('leadId');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('3');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [crmBusy, setCrmBusy] = useState(false);

  async function load() {
    const [list, company] = await Promise.all([
      leadsApi.list(),
      companiesApi.me().catch(() => null),
    ]);
    setLeads(list);
    if (company) {
      setIsOwner(Boolean(company.isOwner));
      setMembers(company.members ?? []);
    }
    setSelected((prev) => {
      const preferId = leadFromUrl || prev?.id;
      if (!preferId) return prev;
      return list.find((l) => l.id === preferId) ?? prev;
    });
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(mapApiError(err, t)),
    );
  }, [t]);

  useEffect(() => {
    if (!selected?.id) {
      setActivities([]);
      setNotes([]);
      setTasks([]);
      return;
    }
    void Promise.all([
      leadsApi.activities(selected.id),
      leadsApi.notes(selected.id),
      leadsApi.tasks(selected.id).catch(() => [] as LeadTask[]),
    ])
      .then(([a, n, taskList]) => {
        setActivities(a);
        setNotes(n);
        setTasks(taskList);
      })
      .catch(() => {
        setActivities([]);
        setNotes([]);
        setTasks([]);
      });
  }, [selected?.id]);

  async function reloadCrmData(leadId: string) {
    const [a, n, taskList] = await Promise.all([
      leadsApi.activities(leadId),
      leadsApi.notes(leadId),
      leadsApi.tasks(leadId).catch(() => [] as LeadTask[]),
    ]);
    setActivities(a);
    setNotes(n);
    setTasks(taskList);
  }

  useEffect(() => {
    if (!leadFromUrl || leads.length === 0) return;
    const found = leads.find((l) => l.id === leadFromUrl);
    if (found && selected?.id !== found.id) {
      void openLead(found, false);
    }
  }, [leadFromUrl, leads]);

  async function openLead(lead: Lead, writeUrl = true) {
    setSelected(lead);
    setMsg('');
    setError('');
    if (writeUrl) {
      setSearchParams({ leadId: lead.id }, { replace: true });
    }
    try {
      await leadsApi.view(lead.id);
      await load();
    } catch {
      /* ignore */
    }
  }

  async function claimLead() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await leadsApi.claim(selected.id);
      setMsg(t('supplier.leadClaimed'));
      await load();
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function reassignLead(assigneeId: string) {
    if (!selected || !assigneeId) return;
    setBusy(true);
    setError('');
    try {
      await leadsApi.reassign(selected.id, assigneeId);
      setMsg(t('supplier.leadReassigned'));
      await load();
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function skipLead() {
    if (!selected || !window.confirm(t('supplier.skipConfirm'))) return;
    try {
      await leadsApi.skip(selected.id);
      setMsg(t('supplier.leadSkipped'));
      setSelected(null);
      setSearchParams({}, { replace: true });
      await load();
    } catch (err) {
      setError(mapApiError(err, t));
    }
  }

  async function sendOffer(e: FormEvent) {
    e.preventDefault();
    if (!selected || sending) return;
    setError('');
    setSending(true);
    try {
      await offersApi.create({
        requestId: selected.request.id,
        price: Number(price),
        deliveryDays: Number(days) || undefined,
        comment: comment || undefined,
      });
      setMsg(t('supplier.offerSent'));
      setPrice('');
      setComment('');
      await load();
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setSending(false);
    }
  }

  const req = selected?.request;
  const canClaim =
    selected &&
    !selected.assigneeId &&
    selected.status !== 'SKIPPED' &&
    selected.status !== 'OFFERED';
  const assignedToOther =
    selected?.assigneeId && selected.assigneeId !== user?.id;

  return (
    <SupplierLayout crumb={t('nav.newLeads')}>
      <div className="page leads-page">
        {error ? (
          <p className="notice" style={{ color: '#b45309' }}>
            {error}
          </p>
        ) : null}
        {msg ? <p className="notice">{msg}</p> : null}

        <div className="leads-workspace">
          <aside className="leads-rail card">
            <div className="leads-rail-head">
              <b>{t('supplier.inbox')}</b>
              <span>{t('supplier.inboxCount', { count: leads.length })}</span>
            </div>
            {leads.map((lead) => {
              const active = selected?.id === lead.id;
              const tone = scoreTone(lead.score);
              return (
                <button
                  key={lead.id}
                  type="button"
                  className={`lead-card${active ? ' is-active' : ''}`}
                  onClick={() => void openLead(lead)}
                >
                  <div className="lead-card-top">
                    <span className="lead-code">{lead.request.code}</span>
                    <span
                      className={`badge ${
                        lead.status === 'NEW'
                          ? 'green'
                          : lead.status === 'OFFERED'
                            ? 'amber'
                            : 'blue'
                      }`}
                    >
                      {statusLabel.lead(lead.status)}
                    </span>
                  </div>
                  <div className="lead-card-title">{lead.request.title}</div>
                  <div className="lead-card-meta">
                    <span>{lead.request.city || t('common.empty')}</span>
                    <span>·</span>
                    <span>
                      {lead.assignee?.fullName || t('supplier.unassigned')}
                    </span>
                  </div>
                  <div className="lead-card-foot">
                    <div className={`score-pill score-${tone}`}>
                      <span
                        className="score-ring"
                        style={{ ['--p' as string]: `${Math.min(100, lead.score)}%` }}
                      />
                      <b>{Math.round(lead.score)}</b>
                      <small>{t('supplier.matchScore')}</small>
                    </div>
                    <span className="lead-time">
                      {formatDateTime(lead.createdAt)}
                    </span>
                  </div>
                </button>
              );
            })}
            {leads.length === 0 ? (
              <div className="leads-empty">
                <b>{t('supplier.noLeads')}</b>
                <p>{t('supplier.noLeadsHint')}</p>
              </div>
            ) : null}
          </aside>

          <section className="leads-detail">
            {selected && req ? (
              <>
                <div className="panel lead-hero">
                  <div className="lead-hero-top">
                    <div>
                      <div className="lead-hero-chips">
                        <span className="chip-strong">{req.code}</span>
                        <span
                          className={`badge ${selected.status === 'NEW' ? 'green' : selected.status === 'OFFERED' ? 'amber' : 'blue'}`}
                        >
                          {statusLabel.lead(selected.status)}
                        </span>
                        <span className="chip soft">
                          {t('supplier.geminiMatched')}
                        </span>
                      </div>
                      <h2>{req.title}</h2>
                      <p className="lead-hero-desc">{req.description}</p>
                      {selected.matchReason ? (
                        <p className="meta lead-match-reason">{selected.matchReason}</p>
                      ) : null}
                      {selected.matchedProduct ? (
                        <p className="meta lead-matched-product">
                          {t('supplier.matchedProduct')}:{' '}
                          <b>{selected.matchedProduct.name}</b>
                          {selected.matchedProduct.priceFrom != null
                            ? ` · ${selected.matchedProduct.priceFrom} ${selected.matchedProduct.currency ?? 'KZT'}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                    <div className={`match-meter score-${scoreTone(selected.score)}`}>
                      <div className="match-meter-value">
                        {Math.round(selected.score)}
                      </div>
                      <div className="match-meter-label">
                        {t('supplier.matchScore')}
                      </div>
                      <div className="progress">
                        <span
                          style={{ width: `${Math.min(100, selected.score)}%` }}
                        />
                      </div>
                      <p>{t('supplier.matchHint')}</p>
                    </div>
                  </div>

                  <div className="lead-info-grid">
                    <div className="lead-info-cell">
                      <small>{t('requests.city')}</small>
                      <b>{req.city || t('common.empty')}</b>
                    </div>
                    <div className="lead-info-cell">
                      <small>{t('requests.category')}</small>
                      <b>{req.category || t('common.empty')}</b>
                    </div>
                    <div className="lead-info-cell">
                      <small>{t('requests.quantity')}</small>
                      <b>{req.quantity || t('common.empty')}</b>
                    </div>
                    <div className="lead-info-cell">
                      <small>{t('requests.deadline')}</small>
                      <b>{req.deadline || t('requests.clarify')}</b>
                    </div>
                    <div className="lead-info-cell">
                      <small>{t('supplier.requestStatus')}</small>
                      <b>{statusLabel.request(req.status)}</b>
                    </div>
                    <div className="lead-info-cell">
                      <small>{t('supplier.receivedAt')}</small>
                      <b>{formatDateTime(selected.createdAt)}</b>
                    </div>
                  </div>

                  <div className="lead-assignee-panel">
                    <div className="lead-assignee-main">
                      {selected.assignee ? (
                        <span className="lead-assignee-avatar-wrap">
                          <UserAvatar
                            name={selected.assignee.fullName}
                            avatarUrl={selected.assignee.avatarUrl}
                            className="lead-assignee-avatar"
                          />
                          <PresenceDot lastSeenAt={selected.assignee.lastSeenAt} />
                        </span>
                      ) : (
                        <div className="lead-assignee-avatar is-empty">?</div>
                      )}
                      <div>
                        <small>{t('supplier.assignee')}</small>
                        <b>
                          {selected.assignee?.fullName || t('supplier.unassigned')}
                        </b>
                        {selected.assignee ? (
                          <PresenceDot
                            lastSeenAt={selected.assignee.lastSeenAt}
                            showLabel
                            className="lead-assignee-presence"
                          />
                        ) : null}
                        {selected.claimedAt ? (
                          <p className="meta" style={{ margin: '4px 0 0' }}>
                            {t('supplier.claimedAt', {
                              date: formatDateTime(selected.claimedAt),
                            })}
                          </p>
                        ) : null}
                        {selected.lastActor ? (
                          <p className="meta" style={{ margin: '4px 0 0' }}>
                            {t('supplier.lastActor', {
                              name: selected.lastActor.fullName,
                            })}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="lead-assignee-actions">
                      {canClaim ? (
                        <button
                          type="button"
                          className="primary"
                          disabled={busy}
                          onClick={() => void claimLead()}
                        >
                          {t('supplier.claimLead')}
                        </button>
                      ) : null}
                      {isOwner && selected.status !== 'SKIPPED' ? (
                        <select
                          className="filter"
                          disabled={busy}
                          value={selected.assigneeId ?? ''}
                          onChange={(e) => {
                            if (e.target.value) void reassignLead(e.target.value);
                          }}
                          aria-label={t('supplier.reassignLead')}
                        >
                          <option value="">{t('supplier.reassignPick')}</option>
                          {members.map((m) => (
                            <option key={m.user.id} value={m.user.id}>
                              {m.user.fullName}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                    {assignedToOther ? (
                      <p className="meta lead-assignee-note">
                        {t('supplier.assignedToOther', {
                          name: selected.assignee?.fullName,
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="panel lead-crm-side">
                  <LeadNextStepPanel
                    lead={selected}
                    busy={crmBusy}
                    onSave={async (text, at) => {
                      setCrmBusy(true);
                      try {
                        await leadsApi.setNextStep(selected.id, { text, at: at || undefined });
                        await load();
                        await reloadCrmData(selected.id);
                      } finally {
                        setCrmBusy(false);
                      }
                    }}
                  />
                  <LeadTasksPanel
                    tasks={tasks}
                    members={members}
                    busy={crmBusy}
                    onAdd={async (input) => {
                      setCrmBusy(true);
                      try {
                        await leadsApi.addTask(selected.id, input);
                        await reloadCrmData(selected.id);
                      } finally {
                        setCrmBusy(false);
                      }
                    }}
                    onUpdate={async (taskId, body) => {
                      setCrmBusy(true);
                      try {
                        await leadsApi.updateTask(selected.id, taskId, body);
                        await reloadCrmData(selected.id);
                      } finally {
                        setCrmBusy(false);
                      }
                    }}
                  />
                  <LeadNotesPanel
                    notes={notes}
                    busy={crmBusy}
                    onAdd={async (body) => {
                      setCrmBusy(true);
                      try {
                        await leadsApi.addNote(selected.id, body);
                        await reloadCrmData(selected.id);
                      } finally {
                        setCrmBusy(false);
                      }
                    }}
                  />
                  <LeadActivityTimeline items={activities} />
                </div>

                <div className="panel offer-compose">
                  <div className="offer-compose-head">
                    <div>
                      <h3 className="section-title">{t('supplier.offerTitle')}</h3>
                      <p className="meta" style={{ margin: 0 }}>
                        {t('supplier.offerSubtitle')}
                      </p>
                    </div>
                  </div>
                  <form onSubmit={(e) => void sendOffer(e)}>
                    <div className="form-grid">
                      <div className="field">
                        <label>{t('supplier.price')}</label>
                        <input
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          type="number"
                          min={0}
                          placeholder="450000"
                          required
                        />
                      </div>
                      <div className="field">
                        <label>{t('supplier.termDays')}</label>
                        <input
                          value={days}
                          onChange={(e) => setDays(e.target.value)}
                          type="number"
                          min={0}
                        />
                      </div>
                      <div className="field full">
                        <label>{t('supplier.comment')}</label>
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder={t('supplier.commentPlaceholder')}
                        />
                      </div>
                    </div>
                    <div className="actions">
                      {selected.status !== 'OFFERED' &&
                      selected.status !== 'SKIPPED' ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void skipLead()}
                        >
                          {t('supplier.skipLead')}
                        </button>
                      ) : null}
                      <button
                        className="primary"
                        disabled={
                          sending ||
                          selected.status === 'OFFERED' ||
                          selected.status === 'SKIPPED'
                        }
                      >
                        {selected.status === 'OFFERED'
                          ? t('supplier.alreadyOffered')
                          : sending
                            ? t('supplier.sending')
                            : t('supplier.sendOffer')}
                      </button>
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <div className="panel leads-placeholder">
                <div className="leads-placeholder-ico">
                  <AppIcon icon={Inbox} size={32} strokeWidth={1.5} />
                </div>
                <b>{t('supplier.selectLead')}</b>
                <p>{t('supplier.selectLeadHint')}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </SupplierLayout>
  );
}
