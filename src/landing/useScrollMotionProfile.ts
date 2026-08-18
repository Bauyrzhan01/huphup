import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const MOBILE_MQ = '(max-width: 860px)';

export function useScrollMotionProfile() {
  const reducedMotion = useReducedMotion();
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return {
    reducedMotion: Boolean(reducedMotion),
    mobile,
    /** Только prefers-reduced-motion — не отключает 3D на мобильном */
    lite: Boolean(reducedMotion),
  };
}
