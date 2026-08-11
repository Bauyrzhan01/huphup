import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { leadsApi, offersApi } from '../../api';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAppLocale, useStatusLabel } from '../../i18n/useAppLocale';
import type { Lead } from '../../types';

function scoreTone(score: number) {
  if (score >= 85) return 'high';
  if (score >= 70) return 'mid';
  return 'low';
}

export function SupplierLeadsPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();
  const statusLabel = useStatusLabel();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('3');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const stats = useMemo(
    () => ({
      total: leads.length,
      new: leads.filter((l) => l.status === 'NEW').length,
      viewed: leads.filter((l) => l.status === 'VIEWED').length,
      offered: leads.filter((l) => l.status === 'OFFERED').length,
    }),
    [leads],
  );

  async function load() {
    const list = await leadsApi.list();
    setLeads(list);
    setSelected((prev) => {
      if (!prev) return prev;
      return list.find((l) => l.id === prev.id) ?? prev;
    });
  }

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : t('supplier.loadLeadsError')),
    );
  }, [t]);

  async function openLead(lead: Lead) {
    setSelected(lead);
    setMsg('');
    setError('');
    try {
      await leadsApi.view(lead.id);
      await load();
    } catch {
      /* ignore */
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
      setError(err instanceof Error ? err.message : t('supplier.sendError'));
    } finally {
      setSending(false);
    }
  }

  const req = selected?.request;

  return (
    <SupplierLayout crumb={t('nav.newLeads')}>
      <div className="page leads-page">
        <div className="page-head">
          <div>
            <h1>{t('supplier.leadsTitle')}</h1>
            <p>{t('supplier.leadsSubtitle')}</p>
          </div>
        </div>

        <div className="stat-grid leads-stats">
          <div className="stat">
            <small>{t('supplier.statTotal')}</small>
            <b>{stats.total}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statNew')}</small>
            <b>{stats.new}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statViewed')}</small>
            <b>{stats.viewed}</b>
          </div>
          <div className="stat">
            <small>{t('supplier.statOffered')}</small>
            <b>{stats.offered}</b>
          </div>
        </div>

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
                      {lead.request.quantity || t('requests.quantity')}
                    </span>
                  </div>
                  <div className="lead-card-foot">
                    <div className={`score-pill score-${tone}`}>
                      <span className="score-ring" style={{ ['--p' as string]: `${Math.min(100, lead.score)}%` }} />
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
                        <span className={`badge ${selected.status === 'NEW' ? 'green' : selected.status === 'OFFERED' ? 'amber' : 'blue'}`}>
                          {statusLabel.lead(selected.status)}
                        </span>
                        <span className="chip soft">
                          {t('supplier.geminiMatched')}
                        </span>
                      </div>
                      <h2>{req.title}</h2>
                      <p className="lead-hero-desc">{req.description}</p>
                    </div>
                    <div className={`match-meter score-${scoreTone(selected.score)}`}>
                      <div className="match-meter-value">{Math.round(selected.score)}</div>
                      <div className="match-meter-label">{t('supplier.matchScore')}</div>
                      <div className="progress">
                        <span style={{ width: `${Math.min(100, selected.score)}%` }} />
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
                      <button className="primary" disabled={sending || selected.status === 'OFFERED'}>
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
                <div className="leads-placeholder-ico">◎</div>
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
