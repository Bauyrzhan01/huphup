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

export const geminiLogStore = {
  push(row: Omit<GeminiCallRow, 'at'> & { at?: string }) {
    total += 1;
    if (row.ok) okCount += 1;
    else failCount += 1;
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
  snapshot() {
    const minuteAgo = Date.now() - 60_000;
    const lastMinuteRows = rows.filter(
      (r) => new Date(r.at).getTime() >= minuteAgo,
    );
    const lat = rows.filter((r) => r.ok).map((r) => r.ms);
    const avgMs = lat.length
      ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)
      : null;
    return {
      totalSinceBoot: total,
      ok: okCount,
      fail: failCount,
      lastMinute: lastMinuteRows.length,
      avgMs,
      recent: rows.slice(0, 30),
    };
  },
};
