import { isOriginAllowed, parseCorsOrigins } from './cors';

describe('cors helper', () => {
  it('defaults to a wildcard when nothing is configured', () => {
    expect(parseCorsOrigins(undefined)).toEqual(['*']);
    expect(isOriginAllowed('https://evil.example', parseCorsOrigins())).toBe(
      true,
    );
  });

  it('splits and trims the configured list', () => {
    expect(parseCorsOrigins(' https://a.kz , https://b.kz ,, ')).toEqual([
      'https://a.kz',
      'https://b.kz',
    ]);
  });

  it('allows configured origins, previews and local dev only', () => {
    const allowed = parseCorsOrigins('https://app.huphup.kz');
    expect(isOriginAllowed('https://app.huphup.kz', allowed)).toBe(true);
    expect(isOriginAllowed('https://huphup-web.vercel.app', allowed)).toBe(
      true,
    );
    expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:5173', allowed)).toBe(true);
    expect(isOriginAllowed('https://evil.example', allowed)).toBe(false);
  });

  it('allows same-origin/non-browser requests without an Origin header', () => {
    expect(isOriginAllowed(undefined, ['https://app.huphup.kz'])).toBe(true);
  });
});
