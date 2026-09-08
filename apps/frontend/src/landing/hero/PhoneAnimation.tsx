import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const CINEMA: [number, number, number, number] = [0.22, 1, 0.36, 1];

const ENTRANCE_FROM = {
  opacity: 0,
  y: 36,
  rotateY: -12,
};

const ENTRANCE_TO = {
  opacity: 1,
  y: 0,
  rotateY: 0,
};

const ENTRANCE_TRANSITION = {
  duration: 1.1,
  delay: 0.16,
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
    ? { opacity: 0, y: 16, rotateY: -6 }
    : ENTRANCE_FROM;
  const to = ENTRANCE_TO;
  const transition = mobile
    ? { duration: 0.7, delay: 0.08, ease: CINEMA }
    : reduce
      ? { duration: 0 }
      : ENTRANCE_TRANSITION;

  return (
    <motion.div
      className="hh-preserve"
      initial={reduce ? to : from}
      animate={to}
      transition={reduce ? { duration: 0 } : transition}
      style={{ transformOrigin: '50% 54%' }}
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
