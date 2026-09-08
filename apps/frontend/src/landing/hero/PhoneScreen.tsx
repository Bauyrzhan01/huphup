import type { ReactNode } from 'react';

export function FrontGlass({ children }: { children: ReactNode }) {
  return (
    <div className="hh-front-glass">
      <div className="hh-screen-content">{children}</div>
      <div className="hh-home-bar" aria-hidden="true" />
    </div>
  );
}

export function PhoneScreen({ children }: { children: ReactNode }) {
  return <FrontGlass>{children}</FrontGlass>;
}
