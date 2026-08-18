import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const CINEMA: [number, number, number, number] = [0.22, 1, 0.36, 1];

const ENTRANCE_FROM = {
  opacity: 0,
  scale: 0.72,
  y: 80,
  rotateX: 18,
  rotateY: -32,
  rotateZ: 8,
};

const ENTRANCE_TO = {
  opacity: 1,
  scale: 1,
  y: 0,
  rotateX: 6,
  rotateY: -12,
  rotateZ: -5,
};

const ENTRANCE_TRANSITION = {
  duration: 1.8,
  delay: 0.28,
  ease: CINEMA,
};

const FADE_FROM = { opacity: 0 };
const FADE_TO = { opacity: 1 };

export function PhoneEntranceAnimation({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="hh-preserve"
      initial={reduce ? ENTRANCE_TO : ENTRANCE_FROM}
      animate={ENTRANCE_TO}
      transition={reduce ? { duration: 0 } : ENTRANCE_TRANSITION}
      style={{ transformOrigin: '50% 54%', transformStyle: 'preserve-3d' }}
    >
      {children}
    </motion.div>
  );
}

export function PhoneAnimation({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <div className="hh-rig is-live">
      <motion.div
        className="hh-glow"
        initial={FADE_FROM}
        animate={FADE_TO}
        transition={reduce ? { duration: 0 } : ENTRANCE_TRANSITION}
      />
      <motion.div
        className="hh-floor-shadow"
        initial={FADE_FROM}
        animate={FADE_TO}
        transition={reduce ? { duration: 0 } : ENTRANCE_TRANSITION}
      />

      <div className="hh-phone-scale">
        <PhoneEntranceAnimation>{children}</PhoneEntranceAnimation>
      </div>
    </div>
  );
}
