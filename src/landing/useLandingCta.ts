import { useAuth } from '../auth/AuthContext';

export function useLandingCta() {
  const { user } = useAuth();
  if (!user) return '/register?next=/requests/new';
  return user.role === 'SUPPLIER' ? '/supplier' : '/app';
}
