import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const MOBILE_MQ = '(max-width: 860px)';

export function useScrollMotionProfile() {
  const reducedMotion = useReducedMotion();
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches,
  );
  const [lowPower, setLowPower] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);

    const cores = navigator.hardwareConcurrency || 8;
    const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    setLowPower(cores <= 4 || saveData);

    return () => mq.removeEventListener('change', onChange);
  }, []);

  return {
    reducedMotion: Boolean(reducedMotion),
    mobile,
    lite: Boolean(reducedMotion) || lowPower,
  };
}
