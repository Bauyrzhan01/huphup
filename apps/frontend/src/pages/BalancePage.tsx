import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react';
import { walletsApi } from '../api';
import { AppIcon } from '../components/AppIcon';
import { useAuth } from '../auth/AuthContext';
import { useWorkspaceMode } from '../hooks/useWorkspaceMode';
import { BuyerLayout, SupplierLayout } from '../layouts/AppLayouts';
import { useAppLocale } from '../i18n/useAppLocale';
import type { AdminWalletRow, Wallet, WalletTransaction } from '../types';
import { mapApiError } from '../utils/apiErrors';

const PAGE_SIZE = 20;

export function BalancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isSupplier } = useWorkspaceMode();
  const { formatMoney, formatDateTime } = useAppLocale();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [items, setItems] = useState<WalletTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAdmin = user?.role === 'ADMIN';
  const Layout = isSupplier ? SupplierLayout : BuyerLayout;
  // Покупки оплачиваются с личного кошелька, выплаты по сделкам идут на кошелёк компании.
  const scope = isSupplier ? 'company' : 'user';

  const load = useCallback(
    (nextPage: number) => {
      setLoading(true);
      void Promise.all([
        walletsApi.me(scope),
        walletsApi.myTransactions({ page: nextPage, limit: PAGE_SIZE, scope }),
      ])
        .then(([balance, history]) => {
          setWallet(balance);
          setItems(history.items);
          setTotalPages(history.totalPages);
          setTotal(history.total);
          setPage(history.page);
          setError('');
        })
        .catch((err) =>
          setError(mapApiError(err, t)),
        )
        .finally(() => setLoading(false));
    },
    [t, scope],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <Layout crumb={t('balance.title')}>
      <div className="page balance-page">
        <section className="panel balance-hero">
          <div>
            <p className="balance-hero-label">{t('balance.current')}</p>
            <p className="balance-hero-amount">
              {wallet ? formatMoney(wallet.balance) : '—'}
              {wallet ? (
                <span className="balance-hero-currency">{wallet.currency}</span>
              ) : null}
            </p>
            {wallet?.scope === 'company' && wallet.companyName ? (
              <p className="balance-hero-scope">
                {t('balance.companyWallet', { company: wallet.companyName })}
              </p>
            ) : null}
            <p className="balance-hero-hint">{t('balance.topUpHint')}</p>
          </div>
        </section>

        {error ? <p className="assist-note balance-error">{error}</p> : null}

        <section className="panel balance-history">
          <div className="balance-history-head">
            <h2 className="section-title">{t('balance.historyTitle')}</h2>
            {total > 0 ? (
              <span className="balance-count">
                {t('balance.operations', { count: total })}
              </span>
            ) : null}
          </div>

          {loading && !items.length ? (
            <p className="assist-note">{t('common.loading')}</p>
          ) : !items.length ? (
            error ? null : <p className="assist-note">{t('balance.historyEmpty')}</p>
          ) : (
            <>
              <ul className="balance-list">
                {items.map((row) => {
                  const credit = row.type === 'CREDIT';
                  return (
                    <li key={row.id} className="balance-row">
                      <span
                        className={`balance-icon${credit ? ' is-credit' : ' is-debit'}`}
                        aria-hidden="true"
                      >
                        <AppIcon
                          icon={credit ? ArrowDownLeft : ArrowUpRight}
                          className="ico"
                          size={18}
                        />
                      </span>
                      <div className="balance-row-body">
                        <p className="balance-row-title">
                          {credit ? t('balance.credit') : t('balance.debit')}
                        </p>
                        <p className="balance-row-meta">
                          {formatDateTime(row.createdAt)}
                          {row.comment ? ` · ${row.comment}` : ''}
                        </p>
                      </div>
                      <div className="balance-row-amounts">
                        <p
                          className={`balance-row-amount${credit ? ' is-credit' : ' is-debit'}`}
                        >
                          {credit ? '+' : '−'}
                          {/* сумма приходит знаковой (расход отрицателен) —
                              знак рисуем сами, поэтому берём модуль */}
                          {formatMoney(row.amount.replace('-', ''))}
                        </p>
                        <p className="balance-row-after">
                          {t('balance.after')} {formatMoney(row.balanceAfter)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {totalPages > 1 ? (
                <div className="balance-pager">
                  <button
                    type="button"
                    className="ghost"
                    disabled={page <= 1 || loading}
                    onClick={() => load(page - 1)}
                  >
                    {t('balance.prev')}
                  </button>
                  <span className="balance-pager-info">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="ghost"
                    disabled={page >= totalPages || loading}
                    onClick={() => load(page + 1)}
                  >
                    {t('balance.next')}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>

        {isAdmin ? <AdminWallets onChanged={() => load(page)} /> : null}
      </div>
    </Layout>
  );
}

/** Пополнение и списание по чужим кошелькам — только для роли ADMIN. */
function AdminWallets({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation();
  const { formatMoney } = useAppLocale();

  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<AdminWalletRow[]>([]);
  const [selected, setSelected] = useState<AdminWalletRow | null>(null);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const search = useCallback((q: string) => {
    void walletsApi
      .adminList({ q: q.trim() || undefined, limit: 10 })
      .then((res) => setRows(res.items))
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    search('');
  }, [search]);

  async function adjust(kind: 'credit' | 'debit') {
    if (!selected) return;
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError(t('balance.amountInvalid'));
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = { amount: value, comment: comment.trim() || undefined };
      const res =
        kind === 'credit'
          ? await walletsApi.adminCredit(selected.userId, body)
          : await walletsApi.adminDebit(selected.userId, body);

      setNotice(
        t('balance.adjusted', {
          email: selected.email,
          balance: formatMoney(res.balance),
        }),
      );
      setAmount('');
      setComment('');
      search(query);
      onChanged();
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel balance-admin">
      <h2 className="section-title">{t('balance.adminTitle')}</h2>
      <p className="assist-note balance-admin-hint">{t('balance.adminHint')}</p>

      <form
        className="balance-admin-search"
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('balance.searchPlaceholder')}
          aria-label={t('balance.searchPlaceholder')}
        />
        <button type="submit" className="ghost">
          <AppIcon icon={Search} className="ico" size={16} />
          {t('balance.search')}
        </button>
      </form>

      {rows.length ? (
        <ul className="balance-admin-list">
          {rows.map((row) => (
            <li key={row.walletId}>
              <button
                type="button"
                className={`balance-admin-row${selected?.userId === row.userId ? ' is-selected' : ''}`}
                onClick={() => setSelected(row)}
              >
                <span className="balance-admin-user">
                  <span className="balance-admin-name">{row.fullName}</span>
                  <span className="balance-admin-email">{row.email}</span>
                </span>
                <span className="balance-admin-amount">
                  {formatMoney(row.balance)} {row.currency}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="assist-note">{t('balance.adminEmpty')}</p>
      )}

      {selected ? (
        <div className="balance-admin-form">
          <p className="balance-admin-selected">
            {t('balance.selected')} <strong>{selected.email}</strong>
          </p>
          <div className="balance-admin-fields">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={t('balance.amount')}
              aria-label={t('balance.amount')}
            />
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('balance.comment')}
              aria-label={t('balance.comment')}
            />
          </div>
          <div className="balance-admin-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void adjust('credit')}
            >
              {t('balance.doCredit')}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => void adjust('debit')}
            >
              {t('balance.doDebit')}
            </button>
          </div>
        </div>
      ) : null}

      {notice ? <p className="assist-note balance-ok">{notice}</p> : null}
      {error ? <p className="assist-note balance-error">{error}</p> : null}
    </section>
  );
}
