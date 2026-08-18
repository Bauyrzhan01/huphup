import type { ReactNode } from 'react';

const RINGS = 8;
const RING_Z0 = -5;
const RING_STEP = 1.25;

export function Body() {
  return <div className="hh-body" aria-hidden="true" />;
}

export function MetalFrame() {
  return (
    <>
      {Array.from({ length: RINGS }, (_, i) => (
        <div
          key={i}
          className={`hh-ring${i === 1 || i === RINGS - 2 ? ' hh-ring-highlight' : ''}`}
          style={{ transform: `translateZ(${RING_Z0 + i * RING_STEP}px)` }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

export function SideButtons() {
  return (
    <div className="hh-buttons" aria-hidden="true">
      <span className="hh-btn hh-btn-power" />
      <span className="hh-btn hh-btn-mute" />
      <span className="hh-btn hh-btn-vol-up" />
      <span className="hh-btn hh-btn-vol-down" />
    </div>
  );
}

export function DynamicIsland() {
  return (
    <div className="hh-island" aria-hidden="true">
      <span className="hh-island-cam" />
    </div>
  );
}

export function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="hh-phone" aria-label="HupHup">
      <Body />
      <MetalFrame />
      {children}
      <DynamicIsland />
      <SideButtons />
    </div>
  );
}
