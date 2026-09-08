import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { billingApi } from '../api';
import { ApiError } from '../api/client';
import { isAuthError, useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ErrorNote, Money, OkNote, Pager, formatDateTime } from '../components/ui';
import type { BillingWalletRow } from '../api/types';

/**
 * Company + personal wallets, the newer system that also backs escrow
 * deals and priced actions. Separate page from /wallets on purpose — the
 * two are genuinely different backend tools, not one thing with two views.
 */
export function BillingPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<BillingWalletRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<BillingWalletRow | null>(null);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

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
        .wallets({ q: q.trim() || undefined, page: nextPage, limit: 20 })
        .then((res) => {
          setRows(res.items);
          setTotalPages(res.totalPages);
          setPage(res.page);
          setError('');
        })
        .catch(handleError)
        .finally(() => setLoading(false));
    },
    [q, handleError],
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(row: BillingWalletRow) {
    setSelected(row);
    setAmount('');
    setComment('');
    setNotice('');
  }

  function ownerOf(row: BillingWalletRow) {
    return row.companyId ? { companyId: row.companyId } : { userId: row.userId! };
  }

  async function run(kind: 'topup' | 'debit') {
    if (!selected) return;
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value === 0) {
      setError('Введите ненулевую сумму');
      return;
    }
    if (kind === 'debit' && !comment.trim()) {
      setError('Списание требует комментария — зачем и по чьему решению');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result =
        kind === 'topup'
          ? await billingApi.topUp(ownerOf(selected), Math.abs(value), comment.trim() || undefined)
          : await billingApi.adjust(ownerOf(selected), -Math.abs(value), comment.trim());

      setNotice(
        `Готово${result.duplicate ? ' (операция уже была выполнена ранее — повтор не засчитан)' : ''}. Баланс: ${result.balance}.`,
      );
      setAmount('');
      setComment('');
      load(page);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Биллинг: компании и покупатели</h1>
        <p className="page-sub">
          Кошельки, которыми пользуются сейф-сделки и платные действия площадки.
        </p>
      </div>

      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          load(1);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Компания, почта или имя"
        />
        <button type="submit" className="ghost">
          <Search size={16} className="ico" />
          Найти
        </button>
      </form>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="panel">
        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : !rows.length ? (
          <p className="muted">Кошельки не найдены.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Владелец</th>
                <th>Тип</th>
                <th>Баланс</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={selected?.id === row.id ? 'is-selected' : ''}
                  onClick={() => select(row)}
                >
                  <td>
                    <div className="cell-title">
                      {row.company?.name ?? row.user?.fullName ?? '—'}
                    </div>
                    <div className="cell-sub">
                      {row.company ? row.company.city ?? '—' : row.user?.email}
                    </div>
                  </td>
                  <td>{row.company ? 'Компания' : 'Пользователь'}</td>
                  <td>
                    <Money value={row.balance} currency={row.currency} />
                  </td>
                  <td className="muted">{formatDateTime(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pager page={page} totalPages={totalPages} onChange={load} busy={loading} />
      </div>

      {selected ? (
        <div className="panel">
          <h2 className="panel-title">
            {selected.company?.name ?? selected.user?.fullName}
          </h2>
          <p className="muted">
            Текущий баланс: <Money value={selected.balance} currency={selected.currency} />
          </p>
          {selected.companyId ? (
            <p className="muted mono-id">
              ID компании (для индивидуальных цен): {selected.companyId}
            </p>
          ) : null}

          <div className="form-row">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Сумма"
            />
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Комментарий"
            />
          </div>
          <div className="form-row">
            <button type="button" disabled={busy} onClick={() => void run('topup')}>
              Пополнить
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => void run('debit')}
            >
              Списать (с комментарием)
            </button>
          </div>

          {notice ? <OkNote>{notice}</OkNote> : null}
        </div>
      ) : null}
    </div>
  );
}
