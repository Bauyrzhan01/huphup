import { geminiLogStore } from './gemini-log.store';

// The store is a module-level singleton shared across the whole test file,
// so each test runs on its own UTC day — pushing on a day nobody has used
// yet is what makes tokensToday() start back at 0 without a dedicated
// reset() hook, exercising the exact rollover logic under test.
let day = 1;
function freshDay() {
  const iso = `2030-01-${String(day).padStart(2, '0')}T10:00:00Z`;
  day += 1;
  jest.setSystemTime(new Date(iso));
}

describe('geminiLogStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sums prompt and output tokens across calls the same day', () => {
    freshDay();
    geminiLogStore.push({
      purpose: 'analyze',
      ok: true,
      status: 200,
      ms: 100,
      promptChars: 10,
      responseChars: 5,
      promptTokens: 100,
      outputTokens: 20,
    });
    geminiLogStore.push({
      purpose: 'clarify',
      ok: true,
      status: 200,
      ms: 90,
      promptChars: 8,
      responseChars: 4,
      promptTokens: 50,
      outputTokens: 10,
    });

    expect(geminiLogStore.tokensToday()).toBe(180);
  });

  it('treats a call with no token counts (a failed or skipped call) as zero', () => {
    freshDay();
    geminiLogStore.push({
      purpose: 'match',
      ok: false,
      status: 0,
      ms: 5,
      promptChars: 10,
      responseChars: 0,
      error: 'network error',
    });

    expect(geminiLogStore.tokensToday()).toBe(0);
  });

  it('resets the counter once the UTC day rolls over', () => {
    jest.setSystemTime(new Date('2031-06-30T23:59:30Z'));
    geminiLogStore.push({
      purpose: 'analyze',
      ok: true,
      status: 200,
      ms: 100,
      promptChars: 10,
      responseChars: 5,
      promptTokens: 500,
      outputTokens: 0,
    });
    expect(geminiLogStore.tokensToday()).toBe(500);

    // Same instant next day, before another push — tokensToday() itself
    // must notice the rollover, not just the next push().
    jest.setSystemTime(new Date('2031-07-01T00:00:05Z'));
    expect(geminiLogStore.tokensToday()).toBe(0);

    geminiLogStore.push({
      purpose: 'analyze',
      ok: true,
      status: 200,
      ms: 100,
      promptChars: 10,
      responseChars: 5,
      promptTokens: 30,
      outputTokens: 0,
    });
    expect(geminiLogStore.tokensToday()).toBe(30);
  });

  it('keeps the pass/fail counters and recent list working alongside tokensToday', () => {
    freshDay();
    const before = geminiLogStore.snapshot();

    geminiLogStore.push({
      purpose: 'analyze',
      ok: true,
      status: 200,
      ms: 10,
      promptChars: 1,
      responseChars: 1,
    });
    geminiLogStore.push({
      purpose: 'analyze',
      ok: false,
      status: 500,
      ms: 10,
      promptChars: 1,
      responseChars: 0,
      error: 'boom',
    });

    const after = geminiLogStore.snapshot();
    expect(after.totalSinceBoot - before.totalSinceBoot).toBe(2);
    expect(after.ok - before.ok).toBe(1);
    expect(after.fail - before.fail).toBe(1);
    expect(after.recent[0]).toMatchObject({ ok: false, error: 'boom' });
    expect(after.recent[1]).toMatchObject({ ok: true });
  });
});
