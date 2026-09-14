const MAX = 80;

export type GeminiCallRow = {
  at: string;
  purpose: string;
  ok: boolean;
  status: number;
  ms: number;
  promptChars: number;
  responseChars: number;
  promptTokens?: number;
  outputTokens?: number;
  error?: string;
};

const rows: GeminiCallRow[] = [];
let total = 0;
let okCount = 0;
let failCount = 0;

/** UTC calendar day, e.g. "2026-09-07" — the natural reset boundary for a daily budget. */
function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// Cumulative token usage for the current UTC day. In-memory like the rest of
// this store, so it resets whenever the process restarts — including Render
// free-plan spin-downs after 15 idle minutes. Treat the budget as a soft guard,
// not a billing ledger.
let tokenDayKey = utcDayKey();
let tokensUsedToday = 0;

// Mirrors GeminiService's own circuit-breaker fields so ops/monitor can show
// "Gemini is paused" without the ops module needing a dependency on
// GeminiService itself — same reasoning as the rest of this store.
let breakerOpenUntil = 0;
let consecutiveFailures = 0;

export const geminiLogStore = {
  push(row: Omit<GeminiCallRow, 'at'> & { at?: string }) {
    total += 1;
    if (row.ok) okCount += 1;
    else failCount += 1;

    const today = utcDayKey();
    if (today !== tokenDayKey) {
      tokenDayKey = today;
      tokensUsedToday = 0;
    }
    tokensUsedToday += (row.promptTokens ?? 0) + (row.outputTokens ?? 0);

    rows.unshift({
      at: row.at ?? new Date().toISOString(),
      purpose: row.purpose,
      ok: row.ok,
      status: row.status,
      ms: row.ms,
      promptChars: row.promptChars,
      responseChars: row.responseChars,
      promptTokens: row.promptTokens,
      outputTokens: row.outputTokens,
      error: row.error,
    });
    if (rows.length > MAX) rows.pop();
  },
  /** Prompt + output tokens billed since 00:00 UTC today. */
  tokensToday(): number {
    if (utcDayKey() !== tokenDayKey) return 0;
    return tokensUsedToday;
  },
  /** Called by GeminiService whenever its breaker state changes. */
  setBreakerState(nextConsecutiveFailures: number, nextOpenUntil: number) {
    consecutiveFailures = nextConsecutiveFailures;
    breakerOpenUntil = nextOpenUntil;
  },
  snapshot() {
    const minuteAgo = Date.now() - 60_000;
    const lastMinuteRows = rows.filter(
      (r) => new Date(r.at).getTime() >= minuteAgo,
    );
    const lat = rows.filter((r) => r.ok).map((r) => r.ms);
    const avgMs = lat.length
      ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)
      : null;
    const breakerOpen = breakerOpenUntil > Date.now();
    return {
      totalSinceBoot: total,
      ok: okCount,
      fail: failCount,
      lastMinute: lastMinuteRows.length,
      avgMs,
      tokensToday: geminiLogStore.tokensToday(),
      breakerOpen,
      breakerOpenUntil: breakerOpen
        ? new Date(breakerOpenUntil).toISOString()
        : null,
      consecutiveFailures,
      recent: rows.slice(0, 30),
    };
  },
};
