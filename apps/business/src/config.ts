// Override per machine with EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WEB_URL in .env (full reload needed).
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://huphup-api.onrender.com/api/v1';
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://huphup-frontend.vercel.app';

/** Files stored by the API itself come back as "/api/v1/media/…". */
export function mediaUrl(url: string | null) {
  if (!url) return null;
  if (!url.startsWith('/')) return url;
  return `${API_URL.replace(/\/api\/v1\/?$/, '')}${url}`;
}
