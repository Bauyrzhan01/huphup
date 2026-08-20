const MAX = 100;

export type TrafficRow = {
  at: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  userId?: string;
};

const rows: TrafficRow[] = [];
let total = 0;
const byStatus = { '2xx': 0, '4xx': 0, '5xx': 0, other: 0 };

function bucket(status: number) {
  if (status >= 200 && status < 300) return '2xx' as const;
  if (status >= 400 && status < 500) return '4xx' as const;
  if (status >= 500) return '5xx' as const;
  return 'other' as const;
}

export const trafficStore = {
  push(row: Omit<TrafficRow, 'at'> & { at?: string }) {
    total += 1;
    byStatus[bucket(row.status)] += 1;
    rows.unshift({
      at: row.at ?? new Date().toISOString(),
      method: row.method,
      path: row.path,
      status: row.status,
      ms: row.ms,
      userId: row.userId,
    });
    if (rows.length > MAX) rows.pop();
  },
  snapshot() {
    const minuteAgo = Date.now() - 60_000;
    const hourAgo = Date.now() - 3600_000;
    return {
      totalSinceBoot: total,
      lastMinute: rows.filter((r) => new Date(r.at).getTime() >= minuteAgo)
        .length,
      lastHour: rows.filter((r) => new Date(r.at).getTime() >= hourAgo).length,
      byStatus: { ...byStatus },
      recent: rows.slice(0, 30),
    };
  },
};
