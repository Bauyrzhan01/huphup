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
} from './cities';
import { MapFlowAnimation } from './MapFlowAnimation';
import type { PlatformLiveFeedItem, PlatformLiveFlow } from './types';

type Props = {
  cities: Array<{ name: string; count: number }>;
  pulse: PlatformLiveFeedItem | null;
  flow: PlatformLiveFlow | null;
  feed: PlatformLiveFeedItem[];
};

const REGION_FILLS = [
  'rgba(16, 163, 127, 0.055)',
  'rgba(17, 17, 17, 0.032)',
  'rgba(16, 163, 127, 0.038)',
];

export function KazakhstanMap({ cities, pulse, flow, feed }: Props) {
  const { t } = useTranslation();
  const [hubOpen, setHubOpen] = useState(false);

  const requests = useMemo(
    () => feed.filter((item) => item.kind === 'request'),
    [feed],
  );

  const activeCities = useMemo(() => resolveCityCounts(cities), [cities]);
  const mapCities = useMemo(() => {
    if (activeCities.length > 0) return activeCities;
    return MAP_FEATURE_CITIES.map((id) => {
      const city = MAP_CITIES.find((item) => item.id === id)!;
      return { ...city, count: 0 };
    });
  }, [activeCities]);

  const hotCityKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const request of requests) {
      const point = resolveCityPoint(request.city);
      if (point) keys.add(`${Math.round(point.x)}:${Math.round(point.y)}`);
    }
    return keys;
  }, [requests]);

  const phaseLabel =
    flow?.phase === 'processing'
      ? t('landing.live.phaseProcessing')
      : flow?.phase === 'delivery'
        ? t('landing.live.phaseDelivery')
        : t('landing.live.phaseLive');

  const totalRequests = requests.length || mapCities.reduce((sum, city) => sum + city.count, 0);

  return (
    <div className={`live-map-wrap${hubOpen ? ' live-map-wrap--open' : ''}`}>
      <div className="live-flow-status live-flow-status--live">
        <span className="live-flow-status-dot" />
        <span className="live-flow-status-text">
          {phaseLabel}
          {totalRequests > 0 ? ` · ${t('landing.live.allActive', { count: totalRequests })}` : ''}
        </span>
        {totalRequests > 0 && (
          <span className="live-flow-status-count">{totalRequests}</span>
        )}
      </div>

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
            <stop offset="0%" stopColor="#10a37f" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#10a37f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="live-city-pulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10a37f" stopOpacity="0.35" />
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

        <MapFlowAnimation flow={flow} feed={feed} />

        {mapCities.map((city, index) => {
          const isHot = hotCityKeys.has(`${Math.round(city.x)}:${Math.round(city.y)}`);
          return (
            <g
              key={`city-${city.id}`}
              className={`live-map-city${isHot ? ' is-hot' : ''}`}
              transform={`translate(${city.x}, ${city.y})`}
              style={{ animationDelay: `${index * 0.08}s` }}
            >
              {isHot && (
                <>
                  <circle className="live-map-origin-ring" r="16" />
                  <circle className="live-map-origin-ring live-map-origin-ring--late" r="16" />
                </>
              )}
              <circle className="live-map-city-pulse" r="22" fill="url(#live-city-pulse)" />
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
          );
        })}

        <circle
          className="live-map-hub-glow"
          cx={MAP_CENTER.x}
          cy={MAP_CENTER.y}
          r="78"
          fill="url(#live-hub-glow)"
        />
        <circle
          className="live-map-hub-ring live-map-hub-ring--always"
          cx={MAP_CENTER.x}
          cy={MAP_CENTER.y}
          r="48"
        />

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

      {!hubOpen && (
        <p className="live-map-hint">
          {totalRequests > 0
            ? t('landing.live.hubHintAll', { count: totalRequests })
            : t('landing.live.hubHint')}
        </p>
      )}

      {hubOpen && (
        <div className="live-flow-panel is-pinned">
          <button
            type="button"
            className="live-flow-panel-close"
            onClick={() => setHubOpen(false)}
            aria-label={t('landing.live.panelClose')}
          >
            ×
          </button>
          <p className="live-flow-card-kicker">{t('landing.live.flowLabel')}</p>
          <p className="live-flow-card-code">
            {t('landing.live.allActive', { count: totalRequests })}
          </p>
          <ul className="live-flow-request-list">
            {requests.slice(0, 8).map((item) => (
              <li key={item.id}>
                <b>{item.code}</b>
                <span>{item.label}</span>
                <small>{item.city ?? '—'}</small>
              </li>
            ))}
          </ul>
          {pulse && (
            <p className="live-flow-card-phase">
              {t('landing.live.latest')}: {pulse.code}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
