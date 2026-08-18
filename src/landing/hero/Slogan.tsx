import type { MotionValue } from 'framer-motion';
import { motion, useReducedMotion, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { HeroPointer } from './useHeroPointer';

const CINEMA: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FROM = { opacity: 0, x: 20, y: -8, scale: 0.98 };
const TO = { opacity: 1, x: 0, y: 0, scale: 1 };
const ENTER = { duration: 1.2, delay: 0.2, ease: CINEMA };

export function Slogan({
  progress,
  pointer,
  lite,
}: {
  progress: MotionValue<number>;
  pointer: HeroPointer;
  lite: boolean;
}) {
  const reduce = useReducedMotion();
  const { t } = useTranslation();

  const scrollX = useTransform(
    progress,
    lite ? [0, 0.55, 1] : [0, 0.22, 0.52, 0.82],
    lite ? [0, 18, 32] : [0, 20, 64, 108],
  );
  const scrollY = useTransform(
    progress,
    lite ? [0, 0.55, 1] : [0, 0.22, 0.52, 0.82],
    lite ? [0, 28, 52] : [0, 24, 80, 142],
  );
  const opacity = useTransform(progress, [0, 0.48, 0.72, 0.9], [1, 1, 0.55, 0]);
  const headlineScale = useTransform(progress, [0, 0.28, 0.72], lite ? [1, 1, 1] : [1, 1.03, 0.96]);
  const arrowY = useTransform(progress, [0, 0.5, 0.85], lite ? [0, 0, 0] : [0, 12, 28]);
  const mx = useTransform(pointer.nx, [-1, 1], lite ? [0, 0] : [10, -10]);
  const my = useTransform(pointer.ny, [-1, 1], lite ? [0, 0] : [6, -6]);
  const x = useTransform([scrollX, mx], ([sx, px]) => Number(sx) + Number(px));
  const y = useTransform([scrollY, my], ([sy, py]) => Number(sy) + Number(py));

  return (
    <motion.div className="hh-slogan-slot" style={{ x, y, opacity }}>
      <motion.div
        className="hh-slogan-block"
        initial={reduce ? TO : FROM}
        animate={TO}
        transition={reduce ? { duration: 0 } : ENTER}
      >
        <motion.p className="hh-slogan" style={{ scale: headlineScale }}>
          <span className="hh-slogan-l1">{t('landing.sloganL1')}</span>
          <span className="hh-slogan-l2">{t('landing.sloganL2')}</span>
          <span className="hh-slogan-l3">{t('landing.sloganAccent')}</span>
        </motion.p>
        <motion.span className="hh-slogan-arrow" style={{ y: arrowY }} aria-hidden="true">
          ↘
        </motion.span>
      </motion.div>
    </motion.div>
  );
}
