import { motion, useTransform, type MotionValue } from 'framer-motion';
import { useTranslation } from 'react-i18next';

function Node({
  index,
  label,
  left,
  top,
  opacity,
  y,
}: {
  index: string;
  label: string;
  left: string;
  top: string;
  opacity: MotionValue<number>;
  y: MotionValue<number>;
}) {
  return (
    <motion.div className="hh-node" style={{ left, top, opacity, y }}>
      <span className="hh-node-dot" />
      <span className="hh-node-index">{index}</span>
      <span className="hh-node-label">{label}</span>
    </motion.div>
  );
}

export function HeroBackdrop({
  progress,
  lite,
}: {
  progress: MotionValue<number>;
  lite: boolean;
}) {
  const { t } = useTranslation();

  const glowY = useTransform(progress, [0, 1], [0, lite ? 12 : 24]);
  const pathY = useTransform(progress, [0, 1], [0, lite ? 28 : 56]);
  const typeY = useTransform(progress, [0, 1], [0, lite ? -40 : -96]);
  const ghostY = useTransform(progress, [0, 1], [0, lite ? 16 : 36]);

  const pathDraw = useTransform(progress, [0, 0.35, 0.85, 1], [0.56, 0.72, 0.96, 1]);
  const spokeDraw = useTransform(progress, [0.05, 0.28, 0.62], [0.35, 0.68, 1]);

  const n1 = useTransform(progress, [0, 0.18, 0.55, 0.9], [1, 1, 0.7, 0.45]);
  const n2 = useTransform(progress, [0.06, 0.22, 0.48], [0.15, 1, 1]);
  const n3 = useTransform(progress, [0.18, 0.38, 0.62], [0.1, 1, 1]);
  const n4 = useTransform(progress, [0.32, 0.52, 0.78], [0.08, 1, 1]);

  const n1y = useTransform(progress, [0, 1], [0, lite ? 8 : 18]);
  const n2y = useTransform(progress, [0, 1], [0, lite ? 12 : 28]);
  const n3y = useTransform(progress, [0, 1], [0, lite ? 6 : 14]);
  const n4y = useTransform(progress, [0, 1], [0, lite ? 16 : 32]);

  const typeOpacity = useTransform(progress, [0, 0.45, 0.85], [1, 0.75, 0.35]);

  return (
    <div className="hh-bg" aria-hidden="true">
      <motion.div className="hh-bg-glow" style={{ y: glowY }}>
        <div className="hh-bg-glow-core" />
      </motion.div>

      <motion.div className="hh-bg-system" style={{ y: pathY }}>
        <svg className="hh-bg-svg" viewBox="0 0 1440 1100" preserveAspectRatio="xMidYMid slice">
          <motion.path
            className="hh-bg-path"
            d="M-80 590 C140 560 240 640 320 610 C460 560 580 500 720 478 C880 452 1040 300 1180 290 C1280 282 1100 640 1020 780 C960 880 880 980 860 1120"
            fill="none"
            pathLength={1}
            style={{ pathLength: pathDraw }}
          />
          <motion.path
            className="hh-bg-spoke"
            d="M720 478 L180 600"
            fill="none"
            pathLength={1}
            style={{ pathLength: spokeDraw }}
          />
          <motion.path
            className="hh-bg-spoke"
            d="M720 478 L1160 300"
            fill="none"
            pathLength={1}
            style={{ pathLength: spokeDraw }}
          />
          <motion.path
            className="hh-bg-spoke"
            d="M720 478 L980 900"
            fill="none"
            pathLength={1}
            style={{ pathLength: spokeDraw }}
          />
        </svg>

        <Node
          index="01"
          label={t('landing.bg01')}
          left="12.5%"
          top="54.5%"
          opacity={n1}
          y={n1y}
        />
        <Node index="02" label={t('landing.bg02')} left="22%" top="55.5%" opacity={n2} y={n2y} />
        <Node index="03" label={t('landing.bg03')} left="82%" top="26.4%" opacity={n3} y={n3y} />
        <Node index="04" label={t('landing.bg04')} left="70.8%" top="81%" opacity={n4} y={n4y} />
      </motion.div>

      <motion.div className="hh-bg-ghosts" style={{ y: ghostY }}>
        <div className="hh-ghost hh-ghost-a">
          <span className="hh-ghost-title">{t('landing.bgGhost')}</span>
          <span className="hh-ghost-lines" />
        </div>
        <div className="hh-ghost hh-ghost-b">
          <span className="hh-ghost-title">{t('landing.bg03')}</span>
          <span className="hh-ghost-lines" />
        </div>
      </motion.div>

      <motion.div className="hh-bg-type" style={{ y: typeY, opacity: typeOpacity }}>
        <span className="hh-bg-word hh-bg-word-request">{t('landing.bg01')}</span>
        <span className="hh-bg-word hh-bg-word-result">{t('landing.bg04')}</span>
      </motion.div>
    </div>
  );
}
