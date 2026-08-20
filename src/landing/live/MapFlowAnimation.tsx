import { useMemo } from 'react';
import type { PlatformLiveFlow } from './types';
import { MAP_CENTER, resolveCityPoint, resolveCityPoints } from './cities';

type Props = {
  flow: PlatformLiveFlow | null;
};

type LineSpec = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone: 'inbound' | 'outbound';
  delay: number;
};

function buildLines(flow: PlatformLiveFlow | null): LineSpec[] {
  if (!flow || flow.phase === 'idle') return [];

  if (flow.phase === 'processing') {
    const origin = resolveCityPoint(flow.originCity) ?? { x: 723, y: 445 };
    return [
      {
        id: 'processing-main',
        x1: origin.x,
        y1: origin.y,
        x2: MAP_CENTER.x,
        y2: MAP_CENTER.y,
        tone: 'inbound',
        delay: 0,
      },
    ];
  }

  const targets = resolveCityPoints(flow.deliveryCities);
  return targets.map((city, index) => ({
    id: `delivery-${city.id}`,
    x1: MAP_CENTER.x,
    y1: MAP_CENTER.y,
    x2: city.x,
    y2: city.y,
    tone: 'outbound' as const,
    delay: index * 0.45,
  }));
}

export function MapFlowAnimation({ flow }: Props) {
  const lines = useMemo(() => buildLines(flow), [flow]);

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
            <circle className="live-flow-dot" r="5.5" style={{ animationDelay: `${line.delay}s` }}>
              <animateMotion
                dur="2.6s"
                repeatCount="indefinite"
                begin={`${line.delay}s`}
                path={path}
              />
            </circle>
            <circle
              className="live-flow-dot live-flow-dot--trail"
              r="3.5"
              style={{ animationDelay: `${line.delay + 0.35}s` }}
            >
              <animateMotion
                dur="2.6s"
                repeatCount="indefinite"
                begin={`${line.delay + 0.35}s`}
                path={path}
              />
            </circle>
          </g>
        );
      })}
    </g>
  );
}
