import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppLocale, useStatusLabel } from '../../i18n/useAppLocale';
import type { ApiHealth, CrmAnalytics, CrmLivePulse } from '../../types';

const ACT_LABELS: Record<string, string> = {
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

const STATUS_ORDER = ['NEW', 'VIEWED', 'OFFERED', 'SKIPPED'] as const;
const STATUS_COLORS: Record<string, string> = {
  NEW: '#111111',
  VIEWED: '#2563eb',
  OFFERED: '#10a37f',
  SKIPPED: '#a1a1aa',
};

function Delta({ value }: { value?: number | null }) {
  if (value == null) return <span className="dash-delta is-flat">—</span>;
  const up = value > 0;
  const down = value < 0;
  return (
    <span className={`dash-delta${up ? ' is-up' : down ? ' is-down' : ' is-flat'}`}>
      {up ? '↑' : down ? '↓' : ''} {Math.abs(value)}%
    </span>
  );
}

function Donut({ analytics }: { analytics: CrmAnalytics }) {
  const { t } = useTranslation();
  const leadLabel = useStatusLabel().lead;
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const total = Math.max(analytics.total, 0);
  const slices = STATUS_ORDER.map((status) => {
    const value = analytics.byStatus[status] ?? 0;
    const len = total ? (value / total) * c : 0;
    const slice = { status, value, len, offset };
    offset += len;
    return slice;
  });

  return (
    <div className="dash-donut-wrap">
      <svg viewBox="0 0 140 140" className="dash-donut">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#ececee" strokeWidth="14" />
        {total
          ? slices.map((slice) => (
              <circle
                key={slice.status}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={STATUS_COLORS[slice.status]}
                strokeWidth="14"
                strokeDasharray={`${slice.len} ${c - slice.len}`}
                strokeDashoffset={-slice.offset}
                transform="rotate(-90 70 70)"
              />
            ))
          : null}
        <text x="70" y="66" textAnchor="middle" className="dash-donut-num">
          {analytics.conversionRate}%
        </text>
        <text x="70" y="84" textAnchor="middle" className="dash-donut-cap">
          {t('supplier.dashConversion')}
        </text>
      </svg>
      <ul className="dash-legend">
        {STATUS_ORDER.map((status) => (
          <li key={status}>
            <i style={{ background: STATUS_COLORS[status] }} />
            {leadLabel(status)}
            <b>{analytics.byStatus[status] ?? 0}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(...values, 1);
  const w = 420;
  const h = 168;
  const gap = 5;
  const barW = (w - gap * (values.length + 1)) / values.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dash-chart">
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          x1="0"
          x2={w}
          y1={138 - p * 110}
          y2={138 - p * 110}
          stroke="#ececee"
          strokeWidth="1"
        />
      ))}
      {values.map((v, i) => {
        const bh = (v / max) * 110;
        const x = gap + i * (barW + gap);
        return (
          <rect
            key={labels[i] ?? i}
            x={x}
            y={138 - bh}
            width={barW}
            height={v ? Math.max(bh, 3) : 0}
            rx="5"
            fill="#111"
            opacity={v ? 1 : 0.12}
          />
        );
      })}
    </svg>
  );
}

function Lines({ a, b }: { a: number[]; b: number[] }) {
  const max = Math.max(...a, ...b, 1);
  const w = 640;
  const h = 168;
  const step = a.length > 1 ? w / (a.length - 1) : w;

  function path(values: number[]) {
    return values
      .map((v, i) => {
        const x = i * step;
        const y = 148 - (v / max) * 120;
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dash-chart">
      {[0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          x1="0"
          x2={w}
          y1={148 - p * 120}
          y2={148 - p * 120}
          stroke="#ececee"
          strokeWidth="1"
        />
      ))}
      <path d={path(a)} fill="none" stroke="#111" strokeWidth="2.2" strokeLinejoin="round" />
      <path d={path(b)} fill="none" stroke="#10a37f" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function formatUptime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function timeAgo(iso: string, t: (key: string, opts?: Record<string, unknown>) => string) {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 45) return t('supplier.dashLiveJustNow');
  if (sec < 3600) return t('supplier.dashLiveMins', { count: Math.floor(sec / 60) });
  return t('supplier.dashLiveHours', { count: Math.floor(sec / 3600) });
}

export function SupplierDashboard({
  analytics,
  health,
  live,
}: {
  analytics: CrmAnalytics | null;
  health: ApiHealth | null;
  live: CrmLivePulse | null;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useAppLocale();
  if (!analytics && !live && !health) {
    return <p className="meta">{t('common.loadingFromDb')}</p>;
  }

  const series = analytics?.series ?? [];
  const leads = series.map((s) => s.leads);
  const offerAmt = series.map((s) => s.offerAmount);
  const acceptedAmt = series.map((s) => s.acceptedAmount);
  const dbUp = health?.database === 'up';
  const apiOk = health?.status === 'ok';
  const counts = live?.counts;

  return (
    <div className="dash-grid">
      <section className="dash-live">
        <span className={`dash-live-dot${apiOk && dbUp ? '' : ' is-down'}`} />
        <div className="dash-live-item">
          <small>{t('supplier.dashLiveApi')}</small>
          <b>{health ? (apiOk ? t('supplier.dashLiveOk') : t('supplier.dashLiveDegraded')) : '—'}</b>
        </div>
        <div className="dash-live-item">
          <small>{t('supplier.dashLiveDb')}</small>
          <b>{health ? (dbUp ? t('supplier.dashLiveOk') : t('supplier.dashLiveDown')) : '—'}</b>
        </div>
        <div className="dash-live-item">
          <small>{t('supplier.dashLiveLatency')}</small>
          <b>{health?.dbLatencyMs != null ? `${health.dbLatencyMs} ms` : '—'}</b>
        </div>
        <div className="dash-live-item">
          <small>{t('supplier.dashLiveUptime')}</small>
          <b>{health ? formatUptime(health.uptimeSec) : '—'}</b>
        </div>
        <div className="dash-live-item">
          <small>{t('supplier.dashLiveRefresh')}</small>
          <b>{live?.checkedAt ? timeAgo(live.checkedAt, t) : t('supplier.dashLivePolling')}</b>
        </div>
      </section>

      {counts ? (
        <div className="dash-kpis dash-live-counts">
          <article className="dash-kpi">
            <small>{t('supplier.dashLiveProducts')}</small>
            <b>{counts.products}</b>
            <Link to="/supplier/products">{t('nav.products')}</Link>
          </article>
          <article className="dash-kpi">
            <small>{t('supplier.dashLiveTeam')}</small>
            <b>
              {counts.membersOnline}
              <span className="dash-kpi-sub"> / {counts.members}</span>
            </b>
            <span className="meta">{t('supplier.dashLiveOnline')}</span>
          </article>
          <article className="dash-kpi">
            <small>{t('supplier.dashLiveLeads24')}</small>
            <b>{counts.leadsLast24h}</b>
            <span className="meta">{t('supplier.dashLiveLeadsTotal', { count: counts.leads })}</span>
          </article>
          <article className="dash-kpi">
            <small>{t('supplier.dashLiveOffers')}</small>
            <b>{counts.pendingOffers}</b>
            <span className="meta">{t('supplier.dashLiveOffers24', { count: counts.offersLast24h })}</span>
          </article>
        </div>
      ) : null}

      <article className="dash-card">
        <header>
          <h3>{t('supplier.dashLiveFeed')}</h3>
          <span className="meta">{t('supplier.dashLiveFeedHint')}</span>
        </header>
        {live?.feed.length ? (
          <ul className="dash-feed">
            {live.feed.map((item) => (
              <li key={item.id}>
                <i />
                <div>
                  <b>{t(`supplier.${ACT_LABELS[item.type] ?? 'crmActStatus'}`)}</b>
                  <p>{item.message}</p>
                  {item.requestCode ? (
                    <Link to={`/supplier/leads?leadId=${item.leadId}`}>
                      {item.requestCode} · {item.requestTitle}
                    </Link>
                  ) : null}
                </div>
                <time>{timeAgo(item.at, t)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">{t('common.noDataInDb')}</p>
        )}
      </article>

      {analytics ? (
        <>
      <div className="dash-kpis">
        <article className="dash-kpi is-accent">
          <small>{t('supplier.dashLeads14')}</small>
          <b>{analytics.currentLeads ?? 0}</b>
          <Delta value={analytics.leadDeltaPct} />
        </article>
        <article className="dash-kpi">
          <small>{t('supplier.dashWon')}</small>
          <b>{formatMoney(analytics.acceptedAmount ?? 0)}</b>
          <Delta value={analytics.acceptedDeltaPct} />
        </article>
        <article className="dash-kpi">
          <small>{t('supplier.dashPending')}</small>
          <b>{formatMoney(analytics.pendingAmount ?? 0)}</b>
          <span className="meta">{t('supplier.dashPendingHint')}</span>
        </article>
        <article className="dash-kpi">
          <small>{t('supplier.myTasksTitle')}</small>
          <b>{analytics.openTasks ?? 0}</b>
          <Link to="/supplier/tasks">{t('nav.tasks')}</Link>
        </article>
      </div>

      <article className="dash-card dash-funnel">
        <header>
          <h3>{t('supplier.dashFunnel')}</h3>
          <Link className="dash-card-link" to="/supplier/deals">
            {t('supplier.dealsTitle')}
          </Link>
        </header>
        <Donut analytics={analytics} />
      </article>

      <article className="dash-card">
        <header>
          <h3>{t('supplier.dashLastDays')}</h3>
          <span className="meta">{t('supplier.dashLeadsHint')}</span>
        </header>
        {series.length ? (
          <Bars values={leads} labels={series.map((s) => s.date.slice(5))} />
        ) : (
          <p className="meta">{t('common.noDataInDb')}</p>
        )}
      </article>

      <article className="dash-card dash-wide">
        <header>
          <h3>{t('supplier.dashOffersFlow')}</h3>
          <span className="meta">{t('supplier.dashOffersHint')}</span>
        </header>
        {series.length ? (
          <>
            <div className="dash-line-legend">
              <span className="is-a">{t('supplier.dashOfferSum')}</span>
              <span className="is-b">{t('supplier.dashAcceptedSum')}</span>
            </div>
            <Lines a={offerAmt} b={acceptedAmt} />
          </>
        ) : (
          <p className="meta">{t('common.noDataInDb')}</p>
        )}
      </article>
        </>
      ) : null}
    </div>
  );
}
