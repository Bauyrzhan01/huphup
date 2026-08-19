import type { ReactNode } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';
import type { HeroPointer } from './useHeroPointer';

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
  const simple = lite || mobile;
  const y = useTransform(
    progress,
    simple ? [0, 1] : [0, 0.45, 1],
    simple ? ['0vh', '-6vh'] : ['0vh', '-18vh', '-40vh'],
  );
  const rotateY = useTransform(progress, [0, 1], simple ? [0, 0] : [-4, 10]);
  const mx = useTransform(pointer.nx, [-1, 1], simple ? [0, 0] : [-6, 6]);

  return (
    <motion.div
      className="hh-phone-scroll"
      style={{ x: mx, y, rotateY, transformPerspective: 1200 }}
    >
      {children}
    </motion.div>
  );
}
