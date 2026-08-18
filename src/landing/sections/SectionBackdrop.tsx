import { motion, useTransform, type MotionValue } from 'framer-motion';

export type SectionBackdropVariant = 'connect' | 'path' | 'final';

type VariantSpec = {
  path: string;
  spokes: [string, string][];
  glowTop?: string;
};

const VARIANTS: Record<SectionBackdropVariant, VariantSpec> = {
  connect: {
    path: 'M-60 520 C160 480 300 620 480 560 C660 500 820 360 980 320 C1120 288 1280 400 1240 580 C1180 760 1020 860 880 920',
    spokes: [
      ['480 560', '140 600'],
      ['480 560', '980 320'],
      ['980 320', '1100 780'],
    ],
    glowTop: '44%',
  },
  path: {
    path: 'M120 80 C280 160 420 240 560 340 C700 440 840 560 960 680 C1060 780 1140 860 1200 940',
    spokes: [
      ['560 340', '80 280'],
      ['960 680', '1320 620'],
    ],
    glowTop: '38%',
  },
  final: {
    path: 'M1280 120 C1080 220 920 300 760 400 C600 500 480 620 400 740 C320 860 280 940 260 1020',
    spokes: [
      ['760 400', '1320 180'],
      ['400 740', '120 820'],
      ['760 400', '760 860'],
    ],
    glowTop: '50%',
  },
};

export function SectionBackdrop({
  variant,
  progress,
  lite,
}: {
  variant: SectionBackdropVariant;
  progress: MotionValue<number>;
  lite: boolean;
}) {
  const spec = VARIANTS[variant];

  const glowY = useTransform(progress, [0, 1], [0, lite ? 14 : 28]);
  const pathY = useTransform(progress, [0, 1], [0, lite ? 28 : 56]);
  const pathDraw = useTransform(progress, [0.08, 0.55, 1], [0.38, 0.78, 1]);
  const spokeDraw = useTransform(progress, [0.12, 0.48, 0.82], [0.28, 0.72, 1]);

  return (
    <div className={`hh-bg hh-sec-bg hh-sec-bg--${variant}`} aria-hidden="true">
      <motion.div
        className="hh-bg-glow"
        style={{ y: glowY, ...(spec.glowTop ? { top: spec.glowTop } : {}) }}
      >
        <div className="hh-bg-glow-core" />
      </motion.div>

      <motion.div className="hh-bg-system" style={{ y: pathY }}>
        <svg className="hh-bg-svg" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice">
          <motion.path
            className="hh-bg-path"
            d={spec.path}
            fill="none"
            pathLength={1}
            style={{ pathLength: pathDraw }}
          />
          {spec.spokes.map(([from, to]) => {
            const [x1, y1] = from.split(' ');
            const d = `M${x1} ${y1} L${to}`;
            return (
              <motion.path
                key={d}
                className="hh-bg-spoke"
                d={d}
                fill="none"
                pathLength={1}
                style={{ pathLength: spokeDraw }}
              />
            );
          })}
        </svg>
      </motion.div>
    </div>
  );
}
