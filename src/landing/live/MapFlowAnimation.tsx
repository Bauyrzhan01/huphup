import { useMemo } from 'react';
import type { PlatformLiveFeedItem, PlatformLiveFlow } from './types';
import { MAP_CENTER, MAP_CITIES, resolveCityPoint } from './cities';

type Props = {
  flow: PlatformLiveFlow | null;
  feed: PlatformLiveFeedItem[];
};

type LineSpec = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone: 'inbound' | 'outbound';
  delay: number;
  dur: number;
  particles: number;
};

const DEFAULT_FANOUT = ['Астана', 'Шымкент', 'Павлодар', 'Актау', 'Атырау'];

function buildLines(flow: PlatformLiveFlow | null, feed: PlatformLiveFeedItem[]): LineSpec[] {
  const lines: LineSpec[] = [];
  const requests = feed.filter((item) => item.kind === 'request');

  // 1) Request cities → HupHup (inbound)
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
      x1: city.x,
      y1: city.y,
      x2: MAP_CENTER.x,
      y2: MAP_CENTER.y,
      tone: 'inbound',
      delay: index * 0.2,
      dur: 2.0 + (index % 3) * 0.2,
      particles: Math.min(1 + city.count, 4),
    });
  });

  if (requests.length === 0) return lines;

  // 2) HupHup → supplier / delivery cities (outbound) — always, after hub
  const originKeys = new Set(
    [...byCity.values()].map((city) => `${Math.round(city.x)}:${Math.round(city.y)}`),
  );

  const fanoutNames =
    flow?.deliveryCities?.length
      ? flow.deliveryCities
      : DEFAULT_FANOUT;

  const targets = new Map<string, { x: number; y: number; name: string }>();
  for (const name of fanoutNames) {
    const point = resolveCityPoint(name);
    if (!point) continue;
    const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
    if (originKeys.has(key)) continue;
    if (key === `${Math.round(MAP_CENTER.x)}:${Math.round(MAP_CENTER.y)}`) continue;
    targets.set(key, { ...point, name });
  }

  // Ensure at least 3 outbound destinations so the story continues past the hub
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
      x1: MAP_CENTER.x,
      y1: MAP_CENTER.y,
      x2: city.x,
      y2: city.y,
      tone: 'outbound',
      // Start slightly after inbound so motion reads: city → hub → suppliers
      delay: 0.9 + index * 0.22,
      dur: 2.3 + (index % 2) * 0.25,
      particles: 2,
    });
  });

  return lines;
}

export function MapFlowAnimation({ flow, feed }: Props) {
  const lines = useMemo(() => buildLines(flow, feed), [flow, feed]);

  if (!lines.length) return null;

  return (
    <g className="live-flow-layer" aria-hidden="true">
      {lines.map((line) => {
        const path = `M ${line.x1} ${line.y1} L ${line.x2} ${line.y2}`;
        return (
          <g key={line.id} className={`live-flow-line live-flow-line--${line.tone}`}>
            <path className="live-flow-track" d={path} />
            <path
              className="live-flow-active"
              d={path}
              style={{ animationDelay: `${line.delay}s` }}
            />
            {Array.from({ length: line.particles }, (_, particleIndex) => (
              <circle
                key={`${line.id}-p-${particleIndex}`}
                className={`live-flow-dot${particleIndex > 0 ? ' live-flow-dot--trail' : ''}`}
                r={particleIndex === 0 ? 5.5 : 3.2}
              >
                <animateMotion
                  dur={`${line.dur}s`}
                  repeatCount="indefinite"
                  begin={`${line.delay + particleIndex * 0.35}s`}
                  path={path}
                />
              </circle>
            ))}
          </g>
        );
      })}
    </g>
  );
}
