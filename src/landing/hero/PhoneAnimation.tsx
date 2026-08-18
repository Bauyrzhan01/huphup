import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const CINEMA: [number, number, number, number] = [0.22, 1, 0.36, 1];

function keepWidthX(rotateYDeg: number) {
  return 1 / Math.max(Math.cos((rotateYDeg * Math.PI) / 180), 0.35);
}

const ENTRANCE_FROM = {
  opacity: 0,
  y: 80,
  rotateX: 18,
  rotateY: -32,
  rotateZ: 8,
  scaleX: keepWidthX(-32),
  scaleY: 1,
};

const ENTRANCE_TO = {
  opacity: 1,
  y: 0,
  rotateX: 0,
  rotateY: 0,
  rotateZ: 0,
  scaleX: 1,
  scaleY: 1,
};

const ENTRANCE_TRANSITION = {
  duration: 1.8,
  delay: 0.28,
  ease: CINEMA,
};

const FADE_FROM = { opacity: 0 };
const FADE_TO = { opacity: 1 };

export function PhoneEntranceAnimation({
  children,
  mobile,
}: {
  children: ReactNode;
  mobile?: boolean;
}) {
  const reduce = useReducedMotion();

  const from = mobile
    ? {
        opacity: 0,
        y: 20,
        rotateX: 8,
        rotateY: -14,
        rotateZ: 4,
        scaleX: keepWidthX(-14),
        scaleY: 1,
      }
    : ENTRANCE_FROM;
  const to = ENTRANCE_TO;
  const transition = mobile
    ? { duration: 1.1, delay: 0.12, ease: CINEMA }
    : reduce
      ? { duration: 0 }
      : ENTRANCE_TRANSITION;

  return (
    <motion.div
      className="hh-preserve"
      initial={reduce ? to : from}
      animate={to}
      transition={reduce ? { duration: 0 } : transition}
      style={{ transformOrigin: '50% 54%', transformStyle: 'preserve-3d' }}
    >
      {children}
    </motion.div>
  );
}

export function PhoneAnimation({
  children,
  mobile,
}: {
  children: ReactNode;
  mobile?: boolean;
}) {
  const reduce = useReducedMotion();
  const transition = mobile
    ? { duration: 1.1, delay: 0.12, ease: CINEMA }
    : reduce
      ? { duration: 0 }
      : ENTRANCE_TRANSITION;

  return (
    <div className={`hh-rig is-live${mobile ? ' hh-rig--mobile' : ''}`}>
      <motion.div
        className="hh-glow"
        initial={FADE_FROM}
        animate={FADE_TO}
        transition={reduce ? { duration: 0 } : transition}
      />
      <motion.div
        className="hh-floor-shadow"
        initial={FADE_FROM}
        animate={FADE_TO}
        transition={reduce ? { duration: 0 } : transition}
      />

      <div className="hh-phone-scale">
        <PhoneEntranceAnimation mobile={mobile}>{children}</PhoneEntranceAnimation>
      </div>
    </div>
  );
}
