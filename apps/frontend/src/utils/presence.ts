/** Consider online if seen within this window (ms). */
export const ONLINE_WINDOW_MS = 90_000;

export function isUserOnline(
  lastSeenAt?: string | Date | null,
  now = Date.now(),
): boolean {
  if (!lastSeenAt) return false;
  const ts = lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts < ONLINE_WINDOW_MS;
}
