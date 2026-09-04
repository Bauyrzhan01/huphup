/**
 * Coerce an unknown value (LLM JSON, dynamic payloads) to a string.
 * Objects and arrays return the fallback instead of `[object Object]`.
 */
export function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

/**
 * Like {@link asText}, but also accepts values with a real `toString`
 * (Prisma `Decimal`, `Date`, `BigInt`) — used when rendering DB columns.
 */
export function toDisplayText(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') {
    const proto = value as { toString?: unknown };
    if (
      typeof proto.toString === 'function' &&
      proto.toString !== Object.prototype.toString
    ) {
      return (value as { toString(): string }).toString();
    }
    return fallback;
  }
  return asText(value, fallback);
}
