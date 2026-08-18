import type { MotionValue } from 'framer-motion';
import { motion, useReducedMotion, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HeroPointer } from './useHeroPointer';

const CINEMA: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FROM = { opacity: 0, x: -28, y: 12, scale: 0.98 };
const TO = { opacity: 1, x: 0, y: 0, scale: 1 };
const ENTER = { duration: 1.2, ease: CINEMA };

export function Brand({
  progress,
  pointer,
  ctaTo,
  lite,
}: {
  progress: MotionValue<number>;
  pointer: HeroPointer;
  ctaTo: string;
  lite: boolean;
}) {
  const reduce = useReducedMotion();
  const scrollX = useTransform(
    progress,
    lite ? [0, 0.55, 1] : [0, 0.22, 0.52, 0.82],
    lite ? [0, -20, -36] : [0, -16, -52, -96],
  );
  const scrollY = useTransform(
    progress,
    lite ? [0, 0.55, 1] : [0, 0.22, 0.52, 0.82],
    lite ? [0, -24, -48] : [0, -20, -72, -128],
  );
  const opacity = useTransform(progress, [0, 0.48, 0.72, 0.9], [1, 1, 0.55, 0]);
  const scale = useTransform(progress, [0, 0.35, 0.85], lite ? [1, 1, 1] : [1, 0.99, 0.94]);
  const captionY = useTransform(progress, [0, 0.45, 0.85], lite ? [0, 0, 0] : [0, 8, 24]);
  const mx = useTransform(pointer.nx, [-1, 1], lite ? [0, 0] : [-10, 10]);
  const my = useTransform(pointer.ny, [-1, 1], lite ? [0, 0] : [-6, 6]);
  const { t } = useTranslation();
  const x = useTransform([scrollX, mx], ([sx, px]) => Number(sx) + Number(px));
  const y = useTransform([scrollY, my], ([sy, py]) => Number(sy) + Number(py));

  return (
    <motion.div className="hh-brand-slot" style={{ x, y, opacity, scale }}>
      <motion.div
        className="hh-brand-block"
        initial={reduce ? TO : FROM}
        animate={TO}
        transition={reduce ? { duration: 0 } : ENTER}
      >
        <h1 className="hh-brand">
          <span className="hh-brand-a">Hup</span>
          <span className="hh-brand-b">Hup</span>
        </h1>
        <motion.div className="hh-brand-meta" style={{ y: captionY }}>
          <span className="hh-brand-arrow" aria-hidden="true">
            ↘
          </span>
          <p className="hh-brand-caption">{t('landing.brandCaption')}</p>
        </motion.div>
        <p className="hh-brand-launch">{t('landing.brandLaunch')}</p>
        <Link to={ctaTo} className="hh-hero-cta">
          {t('landing.heroCta')}
          <span aria-hidden="true">→</span>
        </Link>
      </motion.div>
    </motion.div>
  );
}
