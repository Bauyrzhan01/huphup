import { useEffect } from 'react';
import { useMotionValue, useSpring, type MotionValue } from 'framer-motion';

const SPRING = { stiffness: 120, damping: 28, mass: 0.8 };

export type HeroPointer = {
  nx: MotionValue<number>;
  ny: MotionValue<number>;
};

export function useHeroPointer(): HeroPointer {
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const sx = useSpring(nx, SPRING);
  const sy = useSpring(ny, SPRING);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;

    function onMove(e: PointerEvent) {
      nx.set((e.clientX / window.innerWidth - 0.5) * 2);
      ny.set((e.clientY / window.innerHeight - 0.5) * 2);
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [nx, ny]);

  return { nx: sx, ny: sy };
}
