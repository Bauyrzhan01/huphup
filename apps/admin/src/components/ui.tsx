export function formatMoney(value: string | number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function Money({ value, currency = 'KZT' }: { value: string; currency?: string }) {
  const negative = Number(value) < 0;
  return (
    <span className={negative ? 'money is-negative' : 'money'}>
      {formatMoney(value)} {currency}
    </span>
  );
}

export function Pager({
  page,
  totalPages,
  onChange,
  busy,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  busy?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="pager">
      <button
        type="button"
        className="ghost"
        disabled={busy || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Назад
      </button>
      <span className="pager-info">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        className="ghost"
        disabled={busy || page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Вперёд
      </button>
    </div>
  );
}

export function ErrorNote({ children }: { children: string }) {
  return <p className="note note-error">{children}</p>;
}

export function OkNote({ children }: { children: string }) {
  return <p className="note note-ok">{children}</p>;
}
