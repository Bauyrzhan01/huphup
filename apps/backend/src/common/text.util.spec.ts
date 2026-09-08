import { asText, toDisplayText } from './text.util';

describe('asText', () => {
  it('keeps primitives', () => {
    expect(asText('hello')).toBe('hello');
    expect(asText(42)).toBe('42');
    expect(asText(true)).toBe('true');
  });

  it('never renders [object Object]', () => {
    expect(asText({ a: 1 })).toBe('');
    expect(asText([1, 2])).toBe('');
    expect(asText(null)).toBe('');
    expect(asText(undefined, 'fallback')).toBe('fallback');
  });
});

describe('toDisplayText', () => {
  it('uses a real toString when the value has one', () => {
    const decimalLike = { toString: () => '1500.00' };
    expect(toDisplayText(decimalLike)).toBe('1500.00');
    expect(toDisplayText(new Date('2026-01-01T00:00:00Z'))).toContain('2026');
  });

  it('falls back for plain objects and nullish values', () => {
    expect(toDisplayText({ a: 1 })).toBe('');
    expect(toDisplayText(null, 'KZT')).toBe('KZT');
    expect(toDisplayText(undefined, 'KZT')).toBe('KZT');
  });
});
