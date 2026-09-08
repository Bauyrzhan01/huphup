import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getToken } from '../api/client';
import { Layout } from './Layout';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!getToken() || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
}
