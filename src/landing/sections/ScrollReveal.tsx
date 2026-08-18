import type { CSSProperties, ReactNode } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';

type RevealFrom = {
  x?: number;
  y?: number;
  opacity?: number;
  scale?: number;
};

type RevealTag = 'div' | 'li' | 'article';

const motionTags = {
  div: motion.div,
  li: motion.li,
  article: motion.article,
} as const;

export function ScrollReveal({
  progress,
  range,
  lite,
  from,
  as = 'div',
  className,
  style,
  children,
}: {
  progress: MotionValue<number>;
  range: [number, number];
  lite: boolean;
  from?: RevealFrom;
  as?: RevealTag;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const f = from ?? { y: 28, opacity: 0 };
  const x = useTransform(progress, range, [lite ? 0 : (f.x ?? 0), 0]);
  const y = useTransform(progress, range, [lite ? 0 : (f.y ?? 0), 0]);
  const opacity = useTransform(progress, range, [lite ? 1 : (f.opacity ?? 0), 1]);
  const scale = useTransform(progress, range, [lite ? 1 : (f.scale ?? 1), 1]);

  const Component = motionTags[as];

  return (
    <Component className={className} style={{ x, y, opacity, scale, ...style }}>
      {children}
    </Component>
  );
}
