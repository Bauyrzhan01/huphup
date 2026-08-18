import type { MotionValue } from 'framer-motion';
import { motion, useReducedMotion, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import type { HeroPointer } from './useHeroPointer';

const CINEMA: [number, number, number, number] = [0.22, 1, 0.36, 1];

const FROM = { opacity: 0, y: 16 };
const TO = { opacity: 1, y: 0 };
const ENTER = { duration: 0.9, ease: CINEMA };

export function Brand({
  progress,
  pointer,
  ctaTo,
  mobile,
  mobileLayout,
  lite,
}: {
  progress: MotionValue<number>;
  pointer: HeroPointer;
  ctaTo: string;
  mobile: boolean;
  mobileLayout?: boolean;
  lite: boolean;
}) {
  const reduce = useReducedMotion();
  const staticMobile = mobile || mobileLayout;
  const { user } = useAuth();
  const { t } = useTranslation();

  const scrollY = useTransform(
    progress,
    staticMobile ? [0, 1] : lite ? [0, 1] : [0, 0.55, 1],
    staticMobile ? [0, 0] : lite ? [0, 0] : [0, -12, -28],
  );
  const noPointer = lite || staticMobile;
  const mx = useTransform(pointer.nx, [-1, 1], noPointer ? [0, 0] : [-6, 6]);
  const my = useTransform(pointer.ny, [-1, 1], noPointer ? [0, 0] : [-4, 4]);
  const x = mx;
  const y = useTransform([scrollY, my], ([sy, py]) => Number(sy) + Number(py));

  return (
    <motion.div className="hh-brand-slot" style={{ x, y, opacity: 1 }}>
      <motion.div
        className="hh-brand-block"
        initial={reduce ? TO : FROM}
        animate={TO}
        transition={reduce ? { duration: 0 } : ENTER}
      >
        <p className="hh-brand-caption">{t('landing.brandCaption')}</p>
        <p className="hh-brand-launch">{t('landing.brandLaunch')}</p>
        <Link to={ctaTo} className="hh-hero-cta">
          {t('landing.heroCta')}
          <span aria-hidden="true">→</span>
        </Link>
        {!user && (
          <Link to="/register?role=SUPPLIER" className="hh-hero-supplier">
            {t('landing.heroSupplier')}
          </Link>
        )}
      </motion.div>
    </motion.div>
  );
}
