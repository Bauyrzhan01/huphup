import { useEffect, useMemo, useState } from 'react';
import type { PlatformLiveFeedItem, PlatformLiveFlow } from './types';
import { MAP_CENTER, resolveCityCounts, resolveCityPoint } from './cities';

type Props = {
  flow: PlatformLiveFlow | null;
  cities: Array<{ name: string; count: number }>;
  activeRequest: PlatformLiveFeedItem | null;
};

type LineSpec = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone: 'inbound' | 'outbound' | 'ambient';
  delay: number;
  dur: number;
};

function buildLines(
  flow: PlatformLiveFlow | null,
  cities: Array<{ name: string; count: number }>,
  activeRequest: PlatformLiveFeedItem | null,
): LineSpec[] {
  const lines: LineSpec[] = [];
  const mapped = resolveCityCounts(cities);

  // Ambient activity: every city with requests quietly streams toward the hub
  mapped.forEach((city, index) => {
    lines.push({
      id: `ambient-${city.id}`,
      x1: city.x,
      y1: city.y,
      x2: MAP_CENTER.x,
      y2: MAP_CENTER.y,
      tone: 'ambient',
      delay: index * 0.55,
      dur: 3.8 + (index % 3) * 0.4,
    });
  });

  const spotlightCity =
    resolveCityPoint(activeRequest?.city ?? flow?.originCity ?? null) ??
    (mapped[0] ? { x: mapped[0].x, y: mapped[0].y } : null);

  if (spotlightCity) {
    lines.push({
      id: `spotlight-${activeRequest?.id ?? 'flow'}`,
      x1: spotlightCity.x,
      y1: spotlightCity.y,
      x2: MAP_CENTER.x,
      y2: MAP_CENTER.y,
      tone: 'inbound',
      delay: 0,
      dur: 2.2,
    });
  }

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
        delay: index * 0.35,
        dur: 2.4,
      });
    });
  }

  return lines;
}

export function MapFlowAnimation({ flow, cities, activeRequest }: Props) {
  const lines = useMemo(
    () => buildLines(flow, cities, activeRequest),
    [flow, cities, activeRequest],
  );
  const [tick, setTick] = useState(0);

  // Force remount of motion particles when spotlight request changes
  useEffect(() => {
    setTick((n) => n + 1);
  }, [activeRequest?.id, flow?.code, flow?.phase]);

  if (!lines.length) return null;

  return (
    <g className="live-flow-layer" aria-hidden="true" key={tick}>
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
            <circle className="live-flow-dot" r={line.tone === 'ambient' ? 3.5 : 5.5}>
              <animateMotion
                dur={`${line.dur}s`}
                repeatCount="indefinite"
                begin={`${line.delay}s`}
                path={path}
              />
            </circle>
            {line.tone !== 'ambient' && (
              <circle className="live-flow-dot live-flow-dot--trail" r="3.2">
                <animateMotion
                  dur={`${line.dur}s`}
                  repeatCount="indefinite"
                  begin={`${line.delay + 0.28}s`}
                  path={path}
                />
              </circle>
            )}
          </g>
        );
      })}
    </g>
  );
}
