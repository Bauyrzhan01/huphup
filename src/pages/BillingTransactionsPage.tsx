import { useCallback, useEffect, useState } from 'react';
import { billingApi } from '../api';
import { ApiError } from '../api/client';
import { isAuthError, useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ErrorNote, Money, Pager, formatDateTime } from '../components/ui';
import { BILLING_REASON_LABEL, BILLING_REASONS } from '../api/types';
import type { BillingReason, BillingTx } from '../api/types';

export function BillingTransactionsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [reason, setReason] = useState<BillingReason | ''>('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<BillingTx[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleError = useCallback(
    (err: unknown) => {
      if (isAuthError(err)) {
        logout();
        navigate('/login', { replace: true });
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    },
    [logout, navigate],
  );

  const load = useCallback(
    (nextPage: number) => {
      setLoading(true);
      billingApi
        .transactions({ reason: reason || undefined, page: nextPage, limit: 25 })
        .then((res) => {
          setRows(res.items);
          setTotalPages(res.totalPages);
          setTotal(res.total);
          setPage(res.page);
          setError('');
        })
        .catch(handleError)
        .finally(() => setLoading(false));
    },
    [reason, handleError],
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Все операции площадки</h1>
        <p className="page-sub">{total} операций{reason ? ` · ${BILLING_REASON_LABEL[reason]}` : ''}</p>
      </div>

      <div className="search-row">
        <select value={reason} onChange={(e) => setReason(e.target.value as BillingReason | '')}>
          <option value="">Все поводы</option>
          {BILLING_REASONS.map((r) => (
            <option key={r} value={r}>
              {BILLING_REASON_LABEL[r]}
            </option>
          ))}
        </select>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="panel">
        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : !rows.length ? (
          <p className="muted">Операций не найдено.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Повод</th>
                <th>Сумма</th>
                <th>Остаток после</th>
                <th>Комментарий</th>
                <th>Кто</th>
                <th>Когда</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className={`pill ${row.type === 'CHARGE' ? 'is-debit' : 'is-credit'}`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="muted">{row.reason ? BILLING_REASON_LABEL[row.reason] : '—'}</td>
                  <td>
                    <Money value={row.amount} />
                  </td>
                  <td className="muted">{row.balanceAfter}</td>
                  <td className="cell-sub">{row.comment ?? '—'}</td>
                  <td className="muted">{row.createdBy?.fullName ?? 'система'}</td>
                  <td className="muted">{formatDateTime(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager page={page} totalPages={totalPages} onChange={load} busy={loading} />
      </div>
    </div>
  );
}
