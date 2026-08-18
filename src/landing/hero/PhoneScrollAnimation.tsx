import type { ReactNode } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';
import type { HeroPointer } from './useHeroPointer';

export function PhoneScrollAnimation({
  progress,
  pointer,
  lite,
  children,
}: {
  progress: MotionValue<number>;
  pointer: HeroPointer;
  lite: boolean;
  children: ReactNode;
}) {
  const y = useTransform(
    progress,
    lite ? [0, 0.35, 0.72, 1] : [0, 0.14, 0.38, 0.62, 0.84, 1],
    lite
      ? ['0vh', '-10vh', '-52vh', '-95vh']
      : ['0vh', '-6vh', '-22vh', '-48vh', '-92vh', '-128vh'],
  );

  const rotateX = useTransform(
    progress,
    lite ? [0, 1] : [0, 0.22, 0.52, 0.78, 1],
    lite ? [6, -8] : [6, 2, -12, -24, -34],
  );

  const rotateY = useTransform(
    progress,
    lite ? [0, 1] : [0, 0.22, 0.52, 0.78, 1],
    lite ? [-12, 6] : [-12, -6, 8, 24, 38],
  );

  const rotateZ = useTransform(
    progress,
    lite ? [0, 1] : [0, 0.22, 0.52, 0.78, 1],
    lite ? [-5, 2] : [-5, -3, 4, 10, 14],
  );

  const scale = useTransform(
    progress,
    lite ? [0, 0.3, 0.65, 1] : [0, 0.16, 0.42, 0.68, 0.88, 1],
    lite ? [1, 1.02, 1.04, 0.98] : [1, 1.03, 1.08, 1.12, 1.1, 1.04],
  );

  const mx = useTransform(pointer.nx, [-1, 1], lite ? [0, 0] : [-14, 14]);
  const my = useTransform(pointer.ny, [-1, 1], lite ? [0, 0] : [-8, 8]);

  return (
    <motion.div className="hh-phone-scroll hh-preserve" style={{ x: mx, y: my }}>
      <motion.div
        className="hh-preserve"
        style={{
          y,
          rotateX,
          rotateY,
          rotateZ,
          scale,
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
