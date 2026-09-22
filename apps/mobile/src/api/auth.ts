import { api } from './client';

export type UserRole = 'BUYER' | 'SUPPLIER' | 'ADMIN';

export type User = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: UserRole;
  company: { id: string; name: string; city: string | null; logoUrl: string | null } | null;
};

type AuthResponse = { accessToken: string; user: User };

export const authApi = {
  login: (email: string, password: string) =>
    api<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (input: { fullName: string; email: string; password: string }) =>
    api<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  me: () => api<User>('/users/me'),
};
