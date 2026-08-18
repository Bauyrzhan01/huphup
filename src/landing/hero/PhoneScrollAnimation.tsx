import type { ReactNode } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';
import type { HeroPointer } from './useHeroPointer';

function keepWidthX(rotateYDeg: number) {
  return 1 / Math.max(Math.cos((rotateYDeg * Math.PI) / 180), 0.35);
}

export function PhoneScrollAnimation({
  progress,
  pointer,
  mobile,
  lite,
  children,
}: {
  progress: MotionValue<number>;
  pointer: HeroPointer;
  mobile: boolean;
  lite: boolean;
  children: ReactNode;
}) {
  const y = useTransform(
    progress,
    lite
      ? [0, 0.35, 0.72, 1]
      : mobile
        ? [0, 0.5, 1]
        : [0, 0.14, 0.38, 0.62, 0.84, 1],
    lite
      ? ['0vh', '-8vh', '-28vh', '-44vh']
      : mobile
        ? ['0vh', '-1vh', '-2vh']
        : ['0vh', '-4vh', '-14vh', '-32vh', '-56vh', '-72vh'],
  );

  const rotateX = useTransform(
    progress,
    lite ? [0, 1] : mobile ? [0, 1] : [0, 0.22, 0.52, 0.78, 1],
    lite ? [4, -2] : mobile ? [3, 1] : [3, 1, -8, -16, -22],
  );

  const rotateY = useTransform(
    progress,
    lite ? [0, 1] : mobile ? [0, 1] : [0, 0.22, 0.52, 0.78, 1],
    lite ? [-6, 2] : mobile ? [-4, 2] : [-6, -3, 6, 16, 22],
  );

  const rotateZ = useTransform(
    progress,
    lite ? [0, 1] : mobile ? [0, 1] : [0, 0.22, 0.52, 0.78, 1],
    lite ? [-3, 1] : mobile ? [-2, 1] : [-3, -2, 3, 7, 10],
  );

  const scaleX = useTransform(rotateY, keepWidthX);

  const noPointer = lite || mobile;
  const mx = useTransform(pointer.nx, [-1, 1], noPointer ? [0, 0] : [-14, 14]);
  const my = useTransform(pointer.ny, [-1, 1], noPointer ? [0, 0] : [-8, 8]);

  return (
    <motion.div className="hh-phone-scroll hh-preserve" style={{ x: mx, y: my }}>
      <motion.div
        className="hh-preserve"
        style={{
          y,
          rotateX,
          rotateY,
          rotateZ,
          scaleX,
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
