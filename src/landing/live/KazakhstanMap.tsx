import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KAZAKHSTAN_MAP } from './kazakhstan-map-data';
import {
  MAP_CENTER,
  MAP_CITIES,
  MAP_FEATURE_CITIES,
  MAP_VIEWBOX,
  resolveCityCounts,
  resolveCityPoint,
  resolveCityPoints,
} from './cities';
import { MapFlowAnimation } from './MapFlowAnimation';
import type { PlatformLiveFeedItem, PlatformLiveFlow } from './types';

type Props = {
  cities: Array<{ name: string; count: number }>;
  pulse: PlatformLiveFeedItem | null;
  flow: PlatformLiveFlow | null;
};

const REGION_FILLS = [
  'rgba(16, 163, 127, 0.045)',
  'rgba(17, 17, 17, 0.028)',
  'rgba(16, 163, 127, 0.03)',
];

export function KazakhstanMap({ cities, pulse, flow }: Props) {
  const { t } = useTranslation();
  const [hubOpen, setHubOpen] = useState(false);

  const activeCities = useMemo(() => resolveCityCounts(cities), [cities]);
  const featuredCities = useMemo(() => {
    const fromData = activeCities.filter((city) =>
      MAP_FEATURE_CITIES.includes(city.id as (typeof MAP_FEATURE_CITIES)[number]),
    );
    if (fromData.length > 0) return fromData;
    return MAP_FEATURE_CITIES.map((id) => {
      const city = MAP_CITIES.find((item) => item.id === id)!;
      return { ...city, count: 0 };
    });
  }, [activeCities]);

  const flowOrigin = resolveCityPoint(flow?.originCity ?? pulse?.city ?? null);
  const flowTargets = useMemo(
    () => resolveCityPoints(flow?.deliveryCities ?? []),
    [flow?.deliveryCities],
  );

  const cardCode = pulse?.code ?? flow?.code ?? 'HH-—';
  const cardLabel = pulse?.label ?? flow?.label ?? t('landing.live.flowWaiting');
  const cardCity = pulse?.city ?? flow?.originCity ?? '—';

  const phaseLabel =
    flow?.phase === 'processing'
      ? t('landing.live.phaseProcessing')
      : flow?.phase === 'delivery'
        ? t('landing.live.phaseDelivery')
        : null;

  return (
    <div className={`live-map-wrap${hubOpen ? ' live-map-wrap--open' : ''}`}>
      {phaseLabel && (
        <div className={`live-flow-status live-flow-status--${flow?.phase}`}>
          <span className="live-flow-status-dot" />
          {phaseLabel}
          {flow?.code ? ` · ${flow.code}` : ''}
        </div>
      )}

      <svg
        className="live-map-svg"
        viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`}
        role="img"
        aria-label={t('landing.live.mapLabel')}
      >
        <defs>
          <filter id="live-map-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#111" floodOpacity="0.08" />
          </filter>
          <radialGradient id="live-hub-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10a37f" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10a37f" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="live-map-regions" filter="url(#live-map-soft-shadow)">
          {KAZAKHSTAN_MAP.states.map((state, index) => (
            <path
              key={state.code}
              d={state.path}
              className="live-region"
              style={{ fill: REGION_FILLS[index % REGION_FILLS.length] }}
            />
          ))}
        </g>

        <MapFlowAnimation flow={flow} />

        {flowOrigin && flow?.phase === 'processing' && (
          <g className="live-map-origin" transform={`translate(${flowOrigin.x}, ${flowOrigin.y})`}>
            <circle className="live-map-origin-ring" r="16" />
            <circle className="live-map-origin-dot" r="7" />
          </g>
        )}

        {featuredCities.map((city) => (
          <g key={`city-${city.id}`} className="live-map-city" transform={`translate(${city.x}, ${city.y})`}>
            <circle className="live-map-city-halo" r={city.count > 4 ? 18 : 14} />
            <circle className="live-map-city-dot" r={city.count > 4 ? 8 : 6.5} />
            <text className="live-map-city-label" y="-18">
              {city.label}
            </text>
            {city.count > 0 && (
              <text className="live-map-city-count" y="24">
                {city.count}
              </text>
            )}
          </g>
        ))}

        {flow?.phase === 'delivery' &&
          flowTargets.map((city) => (
            <g
              key={`target-${city.id}`}
              className="live-map-target"
              transform={`translate(${city.x}, ${city.y})`}
            >
              <circle className="live-map-target-ring" r="14" />
            </g>
          ))}

        <circle className="live-map-hub-glow" cx={MAP_CENTER.x} cy={MAP_CENTER.y} r="72" fill="url(#live-hub-glow)" />

        {hubOpen && (
          <circle className="live-map-hub-ring" cx={MAP_CENTER.x} cy={MAP_CENTER.y} r="52" />
        )}

        <g
          className="live-map-hub-group"
          transform={`translate(${MAP_CENTER.x}, ${MAP_CENTER.y})`}
          onClick={() => setHubOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setHubOpen((open) => !open);
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={hubOpen}
          aria-label={t('landing.live.hubAria')}
        >
          <circle className="live-map-hub" r="40" />
          <text className="live-map-hub-text" y="5">
            HupHup
          </text>
        </g>
      </svg>

      {!hubOpen && <p className="live-map-hint">{t('landing.live.hubHint')}</p>}

      {hubOpen && (
        <div className="live-flow-panel" key={pulse?.id ?? flow?.code ?? 'idle'}>
          <button
            type="button"
            className="live-flow-panel-close"
            onClick={() => setHubOpen(false)}
            aria-label={t('landing.live.panelClose')}
          >
            ×
          </button>
          <p className="live-flow-card-kicker">{t('landing.live.flowLabel')}</p>
          <p className="live-flow-card-code">{cardCode}</p>
          <p className="live-flow-card-title">{cardLabel}</p>
          <p className="live-flow-card-city">{cardCity}</p>
          {phaseLabel && <p className="live-flow-card-phase">{phaseLabel}</p>}
        </div>
      )}
    </div>
  );
}
