import { useCallback, useEffect, useState } from 'react';
import { billingApi } from '../api';
import { ApiError } from '../api/client';
import { isAuthError, useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ErrorNote, OkNote } from '../components/ui';
import { BILLING_REASON_LABEL, BILLING_REASONS } from '../api/types';
import type { BillingReason, CompanyPriceRow, PlatformPriceRow } from '../api/types';

type PlatformDraft = {
  reason: BillingReason;
  enabled: boolean;
  amount: string;
  percent: string;
};

function draftFromRows(rows: PlatformPriceRow[]): PlatformDraft[] {
  const byReason = new Map(rows.map((r) => [r.reason, r]));
  return BILLING_REASONS.map((reason) => {
    const row = byReason.get(reason);
    return {
      reason,
      enabled: row?.enabled ?? false,
      amount: row?.amount ?? '0',
      percent: row?.percent ?? '',
    };
  });
}

/** DEAL_COMMISSION is charged as a percent of the deal, everything else as a flat amount. */
const PERCENT_BASED: BillingReason[] = ['DEAL_COMMISSION'];

export function PricingPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [drafts, setDrafts] = useState<PlatformDraft[]>([]);
  const [companies, setCompanies] = useState<CompanyPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [ovCompanyId, setOvCompanyId] = useState('');
  const [ovReason, setOvReason] = useState<BillingReason>('LEAD_UNLOCK');
  const [ovAmount, setOvAmount] = useState('');
  const [ovPercent, setOvPercent] = useState('');
  const [ovEnabled, setOvEnabled] = useState(true);

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

  const load = useCallback(() => {
    setLoading(true);
    billingApi
      .pricing()
      .then((res) => {
        setDrafts(draftFromRows(res.platform));
        setCompanies(res.companies);
        setError('');
      })
      .catch(handleError)
      .finally(() => setLoading(false));
  }, [handleError]);

  useEffect(() => {
    load();
  }, [load]);

  function updateDraft(reason: BillingReason, patch: Partial<PlatformDraft>) {
    setDrafts((prev) => prev.map((d) => (d.reason === reason ? { ...d, ...patch } : d)));
  }

  async function savePlatform() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await billingApi.updatePricing(
        drafts.map((d) => ({
          reason: d.reason,
          enabled: d.enabled,
          amount: Number(d.amount.replace(',', '.')) || 0,
          percent: d.percent ? Number(d.percent.replace(',', '.')) : undefined,
        })),
      );
      setNotice('Цены платформы сохранены.');
      load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function addOverride() {
    if (!ovCompanyId.trim()) {
      setError('Укажите ID компании — его видно на странице «Биллинг» в карточке компании');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await billingApi.updatePricing([
        {
          reason: ovReason,
          enabled: ovEnabled,
          amount: Number(ovAmount.replace(',', '.')) || 0,
          percent: ovPercent ? Number(ovPercent.replace(',', '.')) : undefined,
          companyId: ovCompanyId.trim(),
        },
      ]);
      setNotice('Индивидуальная цена сохранена.');
      setOvCompanyId('');
      setOvAmount('');
      setOvPercent('');
      load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Цены платформы</h1>
        <p className="page-sub">
          Выключенный повод остаётся бесплатным для всех. Изменения вступают в силу сразу,
          без деплоя.
        </p>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {notice ? <OkNote>{notice}</OkNote> : null}

      <div className="panel">
        <h2 className="panel-title">По умолчанию для всей площадки</h2>
        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Повод</th>
                <th>Включено</th>
                <th>Сумма (KZT)</th>
                <th>Процент</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.reason}>
                  <td>{BILLING_REASON_LABEL[d.reason]}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={(e) => updateDraft(d.reason, { enabled: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      value={d.amount}
                      onChange={(e) => updateDraft(d.reason, { amount: e.target.value })}
                      inputMode="decimal"
                      disabled={PERCENT_BASED.includes(d.reason)}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      value={d.percent}
                      onChange={(e) => updateDraft(d.reason, { percent: e.target.value })}
                      inputMode="decimal"
                      placeholder={PERCENT_BASED.includes(d.reason) ? '2.5' : '—'}
                      disabled={!PERCENT_BASED.includes(d.reason)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="form-row">
          <button type="button" disabled={busy || loading} onClick={() => void savePlatform()}>
            Сохранить цены платформы
          </button>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Индивидуальные цены по компаниям</h2>
        {!companies.length ? (
          <p className="muted">Пока ни одной индивидуальной цены не задано.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Компания</th>
                <th>Повод</th>
                <th>Включено</th>
                <th>Сумма</th>
                <th>Процент</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={`${c.companyId}:${c.reason}`}>
                  <td>{c.companyName}</td>
                  <td className="muted">{BILLING_REASON_LABEL[c.reason]}</td>
                  <td>{c.enabled ? 'да' : 'нет'}</td>
                  <td>{c.amount}</td>
                  <td className="muted">{c.percent ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="panel-subtitle">Добавить или изменить</h3>
        <div className="form-row">
          <input
            value={ovCompanyId}
            onChange={(e) => setOvCompanyId(e.target.value)}
            placeholder="ID компании"
          />
          <select value={ovReason} onChange={(e) => setOvReason(e.target.value as BillingReason)}>
            {BILLING_REASONS.map((r) => (
              <option key={r} value={r}>
                {BILLING_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={ovEnabled}
              onChange={(e) => setOvEnabled(e.target.checked)}
            />
            Включено
          </label>
          <input
            value={ovAmount}
            onChange={(e) => setOvAmount(e.target.value)}
            inputMode="decimal"
            placeholder="Сумма"
          />
          <input
            value={ovPercent}
            onChange={(e) => setOvPercent(e.target.value)}
            inputMode="decimal"
            placeholder="Процент (только для комиссии)"
          />
        </div>
        <div className="form-row">
          <button type="button" disabled={busy} onClick={() => void addOverride()}>
            Сохранить индивидуальную цену
          </button>
        </div>
      </div>
    </div>
  );
}
