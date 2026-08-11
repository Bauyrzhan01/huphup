import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export function useMobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('mobile-nav-open', open);
    return () => document.body.classList.remove('mobile-nav-open');
  }, [open]);

  return {
    open,
    openNav: () => setOpen(true),
    closeNav: () => setOpen(false),
  };
}
