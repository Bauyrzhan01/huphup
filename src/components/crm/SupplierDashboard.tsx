import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppLocale, useStatusLabel } from '../../i18n/useAppLocale';
import type { CrmAnalytics } from '../../types';

const STATUS_ORDER = ['NEW', 'VIEWED', 'OFFERED', 'SKIPPED'] as const;
const STATUS_COLORS: Record<string, string> = {
  NEW: '#5b4dff',
  VIEWED: '#f5c542',
  OFFERED: '#22c55e',
  SKIPPED: '#ef4444',
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
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eee" strokeWidth="16" />
        {total
          ? slices.map((slice) => (
              <circle
                key={slice.status}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={STATUS_COLORS[slice.status]}
                strokeWidth="16"
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
  const w = 360;
  const h = 160;
  const gap = 4;
  const barW = (w - gap * (values.length + 1)) / values.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dash-chart" preserveAspectRatio="none">
      {values.map((v, i) => {
        const bh = (v / max) * 120;
        const x = gap + i * (barW + gap);
        return (
          <rect
            key={labels[i]}
            x={x}
            y={130 - bh}
            width={barW}
            height={Math.max(bh, v ? 2 : 0)}
            rx="4"
            fill="#22c55e"
            opacity={v ? 1 : 0.25}
          />
        );
      })}
    </svg>
  );
}

function Lines({
  a,
  b,
}: {
  a: number[];
  b: number[];
}) {
  const max = Math.max(...a, ...b, 1);
  const w = 360;
  const h = 160;
  const step = a.length > 1 ? w / (a.length - 1) : w;

  function path(values: number[]) {
    return values
      .map((v, i) => {
        const x = i * step;
        const y = 140 - (v / max) * 120;
        return `${i === 0 ? 'M' : 'L'}${x},${y}`;
      })
      .join(' ');
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dash-chart" preserveAspectRatio="none">
      <path d={path(a)} fill="none" stroke="#5b4dff" strokeWidth="2.5" />
      <path d={path(b)} fill="none" stroke="#c4b5fd" strokeWidth="2.5" />
    </svg>
  );
}

export function SupplierDashboard({ analytics }: { analytics: CrmAnalytics | null }) {
  const { t } = useTranslation();
  const { formatMoney } = useAppLocale();
  if (!analytics) {
    return <p className="meta">{t('common.loadingFromDb')}</p>;
  }

  const series = analytics.series ?? [];
  const leads = series.map((s) => s.leads);
  const offerAmt = series.map((s) => s.offerAmount);
  const acceptedAmt = series.map((s) => s.acceptedAmount);

  return (
    <div className="dash-grid">
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
          <Link to="/supplier/deals">{t('supplier.dealsTitle')}</Link>
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

      <article className="dash-card">
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
    </div>
  );
}
