import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { walletsApi } from '../api';
import { ApiError } from '../api/client';
import { isAuthError, useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ErrorNote, Money, OkNote, Pager, formatDateTime } from '../components/ui';
import type { AdminWalletRow, WalletTx } from '../api/types';

/**
 * Legacy per-user wallets (/admin/wallets) — the first balance system the
 * platform shipped, before companies got their own wallets under Billing.
 * Kept as its own tool so it's obvious which system an action touches.
 */
export function WalletsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminWalletRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<AdminWalletRow | null>(null);
  const [tx, setTx] = useState<WalletTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);

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
      walletsApi
        .list({ q: q.trim() || undefined, page: nextPage, limit: 20 })
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

  function openWallet(row: AdminWalletRow) {
    setSelected(row);
    setAmount('');
    setComment('');
    setNotice('');
    setTxLoading(true);
    walletsApi
      .transactions(row.userId, { limit: 20 })
      .then((res) => setTx(res.items))
      .catch(handleError)
      .finally(() => setTxLoading(false));
  }

  async function run(kind: 'credit' | 'debit') {
    if (!selected) return;
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Сумма должна быть больше нуля');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result =
        kind === 'credit'
          ? await walletsApi.credit(selected.userId, value, comment.trim() || undefined)
          : await walletsApi.debit(selected.userId, value, comment.trim() || undefined);
      setNotice(
        `Готово. Баланс ${selected.email}: ${result.balance} ${result.currency}.`,
      );
      setAmount('');
      setComment('');
      openWallet({ ...selected, balance: result.balance });
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
        <h1>Кошельки пользователей</h1>
        <p className="page-sub">
          Личный баланс каждого пользователя. Кошельки компаний — в разделе «Биллинг».
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
          placeholder="Почта или имя"
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
                <th>Пользователь</th>
                <th>Роль</th>
                <th>Баланс</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.walletId}
                  className={selected?.walletId === row.walletId ? 'is-selected' : ''}
                  onClick={() => openWallet(row)}
                >
                  <td>
                    <div className="cell-title">{row.fullName}</div>
                    <div className="cell-sub">{row.email}</div>
                  </td>
                  <td>{row.role}</td>
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
            {selected.fullName} · {selected.email}
          </h2>
          <p className="muted">
            Текущий баланс: <Money value={selected.balance} currency={selected.currency} />
          </p>

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
              placeholder="Комментарий (например, номер платёжки)"
            />
          </div>
          <div className="form-row">
            <button type="button" disabled={busy} onClick={() => void run('credit')}>
              Пополнить
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => void run('debit')}
            >
              Списать
            </button>
          </div>

          {notice ? <OkNote>{notice}</OkNote> : null}

          <h3 className="panel-subtitle">История операций</h3>
          {txLoading ? (
            <p className="muted">Загрузка…</p>
          ) : !tx.length ? (
            <p className="muted">Операций пока не было.</p>
          ) : (
            <ul className="tx-list">
              {tx.map((row) => (
                <li key={row.id} className="tx-row">
                  <span className={row.type === 'CREDIT' ? 'tx-sign is-credit' : 'tx-sign is-debit'}>
                    {row.type === 'CREDIT' ? '+' : '−'}
                    {row.amount}
                  </span>
                  <span className="tx-comment">{row.comment ?? '—'}</span>
                  <span className="muted">{formatDateTime(row.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
