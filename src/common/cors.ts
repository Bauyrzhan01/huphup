/** Comma-separated CORS_ORIGINS -> list. `*` (default) means "allow everything". */
export function parseCorsOrigins(raw?: string): string[] {
  return (raw ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Single source of truth for the browser origins we accept — used by both the
 * HTTP layer (main.ts) and the WebSocket gateway so the two never drift apart.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowed: string[],
): boolean {
  if (!origin || allowed.includes('*')) return true;
  return (
    allowed.includes(origin) ||
    origin.endsWith('.vercel.app') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1')
  );
}
