import type { MotionValue } from 'framer-motion';
import { motion, useReducedMotion, useTransform } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { HeroPointer } from './useHeroPointer';

const CINEMA: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FROM = { opacity: 0, y: 12 };
const TO = { opacity: 1, y: 0 };
const ENTER = { duration: 0.9, delay: 0.08, ease: CINEMA };

export function Slogan({
  progress,
  pointer,
  mobile,
  lite,
}: {
  progress: MotionValue<number>;
  pointer: HeroPointer;
  mobile: boolean;
  lite: boolean;
}) {
  const reduce = useReducedMotion();
  const { t } = useTranslation();

  const scrollY = useTransform(
    progress,
    mobile || lite ? [0, 1] : [0, 0.55, 1],
    mobile || lite ? [0, 0] : [0, -10, -24],
  );
  const noPointer = lite || mobile;
  const mx = useTransform(pointer.nx, [-1, 1], noPointer ? [0, 0] : [6, -6]);
  const my = useTransform(pointer.ny, [-1, 1], noPointer ? [0, 0] : [4, -4]);
  const y = useTransform([scrollY, my], ([sy, py]) => Number(sy) + Number(py));

  return (
    <motion.div className="hh-slogan-slot" style={{ x: mx, y, opacity: 1 }}>
      <motion.div
        className="hh-slogan-block"
        initial={reduce ? TO : FROM}
        animate={TO}
        transition={reduce ? { duration: 0 } : ENTER}
      >
        <h1 className="hh-slogan">
          <span className="hh-slogan-l1">{t('landing.sloganL1')}</span>
          <span className="hh-slogan-l2">{t('landing.sloganL2')}</span>
          <span className="hh-slogan-l3">{t('landing.sloganAccent')}</span>
        </h1>
      </motion.div>
    </motion.div>
  );
}
