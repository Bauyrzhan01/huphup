import { useRef } from 'react';
import { useScroll } from 'framer-motion';

/** Section-local scroll progress, 0 when entering viewport → 1 when leaving. No spring smoothing. */
export function useSectionScroll() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  return { ref, progress: scrollYProgress };
}
