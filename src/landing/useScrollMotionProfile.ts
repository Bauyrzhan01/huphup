import { useEffect, useState } from 'react';

export function useScrollMotionProfile() {
  const [lite, setLite] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const narrow = window.matchMedia('(max-width: 760px)');

    function update() {
      setLite(reduced.matches || coarse.matches || narrow.matches);
    }

    update();
    reduced.addEventListener('change', update);
    coarse.addEventListener('change', update);
    narrow.addEventListener('change', update);
    return () => {
      reduced.removeEventListener('change', update);
      coarse.removeEventListener('change', update);
      narrow.removeEventListener('change', update);
    };
  }, []);

  return { lite };
}
