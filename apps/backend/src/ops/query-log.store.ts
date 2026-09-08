const MAX = 80;

export type QueryLogRow = {
  at: string;
  ms: number;
  sql: string;
};

const rows: QueryLogRow[] = [];
let paused = 0;
let total = 0;

function clipSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 180);
}

export const queryLogStore = {
  pause() {
    paused += 1;
  },
  resume() {
    paused = Math.max(0, paused - 1);
  },
  push(ms: number, sql: string) {
    total += 1;
    if (paused > 0) return;
    rows.unshift({
      at: new Date().toISOString(),
      ms,
      sql: clipSql(sql),
    });
    if (rows.length > MAX) rows.pop();
  },
  snapshot() {
    const minuteAgo = Date.now() - 60_000;
    return {
      totalSinceBoot: total,
      lastMinute: rows.filter((r) => new Date(r.at).getTime() >= minuteAgo)
        .length,
      recent: rows.slice(0, 24),
    };
  },
};
