import { useMemo } from 'react';
import type { PlatformLiveFeedItem, PlatformLiveFlow } from './types';
import { MAP_CENTER, MAP_CITIES, resolveCityPoint } from './cities';

type Props = {
  flow: PlatformLiveFlow | null;
  feed: PlatformLiveFeedItem[];
};

type LineSpec = {
  id: string;
  path: string;
  tone: 'inbound' | 'outbound';
  delay: number;
  dur: number;
  particles: number;
};

const DEFAULT_FANOUT = ['Астана', 'Шымкент', 'Павлодар', 'Актау', 'Атырау'];

/** Soft quadratic curve between two points (bulge away from hub axis). */
function curvePath(x1: number, y1: number, x2: number, y2: number, bulge = 0.18) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * len * bulge;
  const ny = (dx / len) * len * bulge;
  const cx = mx + nx;
  const cy = my + ny;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function buildLines(flow: PlatformLiveFlow | null, feed: PlatformLiveFeedItem[]): LineSpec[] {
  const lines: LineSpec[] = [];
  const requests = feed.filter((item) => item.kind === 'request');

  const byCity = new Map<string, { x: number; y: number; count: number }>();
  for (const request of requests) {
    const point = resolveCityPoint(request.city);
    if (!point) continue;
    const key = `${point.x},${point.y}`;
    const prev = byCity.get(key);
    if (prev) prev.count += 1;
    else byCity.set(key, { x: point.x, y: point.y, count: 1 });
  }

  [...byCity.entries()].forEach(([key, city], index) => {
    lines.push({
      id: `inbound-${key}`,
      path: curvePath(city.x, city.y, MAP_CENTER.x, MAP_CENTER.y, 0.14 + (index % 3) * 0.03),
      tone: 'inbound',
      delay: index * 0.35,
      dur: 3.2 + (index % 3) * 0.35,
      particles: Math.min(1 + Math.ceil(city.count / 3), 2),
    });
  });

  if (requests.length === 0) return lines;

  const originKeys = new Set(
    [...byCity.values()].map((city) => `${Math.round(city.x)}:${Math.round(city.y)}`),
  );

  const fanoutNames = flow?.deliveryCities?.length ? flow.deliveryCities : DEFAULT_FANOUT;
  const targets = new Map<string, { x: number; y: number; name: string }>();

  for (const name of fanoutNames) {
    const point = resolveCityPoint(name);
    if (!point) continue;
    const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
    if (originKeys.has(key)) continue;
    if (key === `${Math.round(MAP_CENTER.x)}:${Math.round(MAP_CENTER.y)}`) continue;
    targets.set(key, { ...point, name });
  }

  if (targets.size < 3) {
    for (const city of MAP_CITIES) {
      const key = `${Math.round(city.x)}:${Math.round(city.y)}`;
      if (originKeys.has(key)) continue;
      if (key === `${Math.round(MAP_CENTER.x)}:${Math.round(MAP_CENTER.y)}`) continue;
      targets.set(key, { x: city.x, y: city.y, name: city.label });
      if (targets.size >= 4) break;
    }
  }

  [...targets.values()].forEach((city, index) => {
    lines.push({
      id: `outbound-${city.name}-${index}`,
      path: curvePath(MAP_CENTER.x, MAP_CENTER.y, city.x, city.y, 0.12 + (index % 3) * 0.025),
      tone: 'outbound',
      // Clear second beat: hub processes, then fans out
      delay: 1.4 + index * 0.4,
      dur: 3.4 + (index % 2) * 0.3,
      particles: 1,
    });
  });

  return lines;
}

export function MapFlowAnimation({ flow, feed }: Props) {
  const lines = useMemo(() => buildLines(flow, feed), [flow, feed]);

  if (!lines.length) return null;

  return (
    <g className="live-flow-layer" aria-hidden="true">
      {lines.map((line) => (
        <g key={line.id} className={`live-flow-line live-flow-line--${line.tone}`}>
          <path className="live-flow-track" d={line.path} />
          <path
            className="live-flow-active"
            d={line.path}
            style={{ animationDelay: `${line.delay}s` }}
          />
          {Array.from({ length: line.particles }, (_, particleIndex) => (
            <circle
              key={`${line.id}-p-${particleIndex}`}
              className={`live-flow-dot${particleIndex > 0 ? ' live-flow-dot--trail' : ''}`}
              r={particleIndex === 0 ? 4.2 : 2.6}
            >
              <animateMotion
                dur={`${line.dur}s`}
                repeatCount="indefinite"
                begin={`${line.delay + particleIndex * 0.55}s`}
                path={line.path}
                calcMode="spline"
                keyTimes="0;1"
                keySplines="0.4 0 0.2 1"
              />
            </circle>
          ))}
        </g>
      ))}
    </g>
  );
}
