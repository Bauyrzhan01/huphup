import { describe, expect, it } from 'vitest';
import apiErrorsSource from '../utils/apiErrors.ts?raw';
import kk from './locales/kk.json';
import ru from './locales/ru.json';

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' ? flatKeys(value as Record<string, unknown>, path) : [path];
  });
}

describe('locales', () => {
  it('ru and kk have exactly the same keys', () => {
    const ruKeys = new Set(flatKeys(ru));
    const kkKeys = new Set(flatKeys(kk));
    expect([...ruKeys].filter((k) => !kkKeys.has(k))).toEqual([]);
    expect([...kkKeys].filter((k) => !ruKeys.has(k))).toEqual([]);
  });

  it('every key used by mapApiError exists in both languages', () => {
    const used = [
      ...new Set(
        [...apiErrorsSource.matchAll(/'((?:apiErrors|products|requests|common)\.[A-Za-z]+)'/g)].map((m) => m[1]),
      ),
    ];
    expect(used.length).toBeGreaterThan(20);
    const ruKeys = new Set(flatKeys(ru));
    const kkKeys = new Set(flatKeys(kk));
    expect(used.filter((k) => !ruKeys.has(k))).toEqual([]);
    expect(used.filter((k) => !kkKeys.has(k))).toEqual([]);
  });
});
