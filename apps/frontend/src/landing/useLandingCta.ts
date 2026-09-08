import { useAuth } from '../auth/AuthContext';

export function useLandingCta() {
  const { user } = useAuth();
  if (!user) return '/register?next=/requests/new';
  if (user.role === 'SUPPLIER') return '/supplier';
  return '/requests/new';
}
