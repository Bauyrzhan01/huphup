const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000/api/v1';

export { API_URL };

/** Media stored by the API itself comes back as "/api/v1/media/…". */
export function mediaUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('/') ? `${new URL(API_URL).origin}${url}` : url;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = 'huphup_admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  // FormData needs the browser-generated multipart boundary, so no JSON header for it.
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    const signal =
      options.signal ??
      (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
        ? AbortSignal.timeout(25000)
        : undefined);
    res = await fetch(`${API_URL}${path}`, { ...options, headers, signal });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ApiError(0, 'Превышено время ожидания ответа');
    }
    throw new ApiError(0, 'Нет связи с сервером');
  }

  if (!res.ok) {
    let message = `Ошибка запроса (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (data.message) message = data.message;
    } catch {
      /* тело не JSON — оставляем общий текст */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
