import { api } from './client';

export type Banner = {
  id: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  bgColor: string;
  ctaText: string | null;
  ctaUrl: string | null;
};

export function fetchBanners(params: {
  audience: 'BUYER' | 'SUPPLIER';
  city?: string;
  /** CARD is the carousel on the home screen, POPUP the modal over it. */
  placement?: 'CARD' | 'POPUP';
}) {
  const q = new URLSearchParams({ audience: params.audience });
  if (params.city) q.set('city', params.city);
  if (params.placement) q.set('placement', params.placement);
  return api<Banner[]>(`/banners?${q.toString()}`);
}
