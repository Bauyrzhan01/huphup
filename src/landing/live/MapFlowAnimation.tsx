import { useMemo } from 'react';
import type { PlatformLiveFeedItem, PlatformLiveFlow } from './types';
import { MAP_CENTER, resolveCityPoint } from './cities';

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

function buildLines(flow: PlatformLiveFlow | null, feed: PlatformLiveFeedItem[]): LineSpec[] {
  const lines: LineSpec[] = [];
  const requests = feed.filter((item) => item.kind === 'request');

  // One active inbound stream per request city — all at once
  const byCity = new Map<string, { x: number; y: number; count: number; codes: string[] }>();
  for (const request of requests) {
    const point = resolveCityPoint(request.city);
    if (!point) continue;
    const key = `${point.x},${point.y}`;
    const prev = byCity.get(key);
    if (prev) {
      prev.count += 1;
      if (request.code) prev.codes.push(request.code);
    } else {
      byCity.set(key, {
        x: point.x,
        y: point.y,
        count: 1,
        codes: request.code ? [request.code] : [],
      });
    }
  }

  [...byCity.entries()].forEach(([key, city], index) => {
    lines.push({
      id: `request-city-${key}`,
      x1: city.x,
      y1: city.y,
      x2: MAP_CENTER.x,
      y2: MAP_CENTER.y,
      tone: 'inbound',
      delay: index * 0.25,
      dur: 2.1 + (index % 3) * 0.25,
      particles: Math.min(1 + city.count, 5),
    });
  });

  if (flow?.phase === 'delivery') {
    flow.deliveryCities.forEach((name, index) => {
      const point = resolveCityPoint(name);
      if (!point) return;
      lines.push({
        id: `delivery-${name}-${index}`,
        x1: MAP_CENTER.x,
        y1: MAP_CENTER.y,
        x2: point.x,
        y2: point.y,
        tone: 'outbound',
        delay: index * 0.3,
        dur: 2.3,
        particles: 2,
      });
    });
  }

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
