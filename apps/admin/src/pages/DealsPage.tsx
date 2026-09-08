import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { dealsApi } from '../api';
import { ApiError } from '../api/client';
import { isAuthError, useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ErrorNote, Money, OkNote, formatDateTime } from '../components/ui';
import { DEAL_STATUS_LABEL } from '../api/types';
import type { Deal, DealStatus, DisputeTriage } from '../api/types';

const STATUS_FILTERS: Array<{ value: DealStatus | ''; label: string }> = [
  { value: '', label: 'Все' },
  { value: 'DISPUTED', label: 'Споры' },
  { value: 'HELD', label: 'На удержании' },
  { value: 'SHIPPED', label: 'Отгружено' },
  { value: 'AWAITING_PAYMENT', label: 'Ждут оплату' },
  { value: 'RELEASED', label: 'Выданы' },
  { value: 'REFUNDED', label: 'Возвращены' },
];

const RECOMMENDATION_LABEL: Record<string, string> = {
  RELEASE: 'Выдать поставщику',
  REFUND: 'Вернуть покупателю',
  NEEDS_INFO: 'Нужны дополнительные факты',
};

export function DealsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<DealStatus | ''>('DISPUTED');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<Deal | null>(null);
  const [triage, setTriage] = useState<DisputeTriage | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [refundReason, setRefundReason] = useState('');

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
    dealsApi
      .list(status || undefined)
      .then((res) => {
        setDeals(res);
        setError('');
      })
      .catch(handleError)
      .finally(() => setLoading(false));
  }, [status, handleError]);

  useEffect(() => {
    load();
  }, [load]);

  function select(deal: Deal) {
    setSelected(deal);
    setTriage(null);
    setNotice('');
    setRefundReason('');
  }

  function askTriage() {
    if (!selected) return;
    setTriageLoading(true);
    dealsApi
      .aiSummary(selected.id)
      .then(setTriage)
      .catch(handleError)
      .finally(() => setTriageLoading(false));
  }

  async function release() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const updated = await dealsApi.release(selected.id);
      setNotice('Деньги выданы поставщику.');
      setSelected(updated);
      load();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  async function refund() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const updated = await dealsApi.refund(selected.id, refundReason.trim() || undefined);
      setNotice('Деньги возвращены покупателю.');
      setSelected(updated);
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
        <h1>Сейф-сделки</h1>
        <p className="page-sub">
          Деньги покупателя лежат у площадки до подтверждения получения.
        </p>
      </div>

      <div className="search-row">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`chip${status === f.value ? ' is-active' : ''}`}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="deals-columns">
        <div className="panel deals-list-panel">
          {loading ? (
            <p className="muted">Загрузка…</p>
          ) : !deals.length ? (
            <p className="muted">Сделок с таким статусом нет.</p>
          ) : (
            <ul className="deal-rows">
              {deals.map((deal) => (
                <li
                  key={deal.id}
                  className={`deal-row${selected?.id === deal.id ? ' is-selected' : ''}`}
                  onClick={() => select(deal)}
                >
                  <div className="cell-title">{deal.request.title}</div>
                  <div className="cell-sub">{deal.company.name}</div>
                  <div className="deal-row-foot">
                    <span className={`pill status-${deal.status.toLowerCase()}`}>
                      {DEAL_STATUS_LABEL[deal.status]}
                    </span>
                    <Money value={deal.amount} currency={deal.currency} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected ? (
          <div className="panel deal-detail-panel">
            <h2 className="panel-title">{selected.request.title}</h2>
            <p className="muted">{selected.request.code} · {selected.company.name}</p>
            <p className="muted">
              Сумма: <Money value={selected.amount} currency={selected.currency} />
              {Number(selected.commission) > 0 ? (
                <> · комиссия {selected.commission}, к выплате {selected.payout}</>
              ) : null}
            </p>
            <p>
              Статус: <span className={`pill status-${selected.status.toLowerCase()}`}>
                {DEAL_STATUS_LABEL[selected.status]}
              </span>
            </p>
            {selected.autoReleaseAt ? (
              <p className="muted">Автовыпуск: {formatDateTime(selected.autoReleaseAt)}</p>
            ) : null}
            {selected.disputeReason ? (
              <div className="dispute-box">
                <div className="dispute-box-label">Причина спора</div>
                {selected.disputeReason}
              </div>
            ) : null}

            {selected.status === 'DISPUTED' ? (
              <>
                <button
                  type="button"
                  className="ghost"
                  disabled={triageLoading}
                  onClick={askTriage}
                >
                  <Sparkles size={16} className="ico" />
                  {triageLoading ? 'Разбираю…' : 'Разбор ИИ'}
                </button>

                {triage ? (
                  triage.available ? (
                    <div className="triage-box">
                      <div className="triage-rec">
                        {RECOMMENDATION_LABEL[triage.triage.recommendation]}
                      </div>
                      <p>{triage.triage.summary}</p>
                      <p className="muted">{triage.triage.reasoning}</p>
                      <p className="triage-caveat">
                        Это подсказка, не решение. Финальный выбор — за вами.
                      </p>
                    </div>
                  ) : (
                    <p className="muted">{triage.reason}</p>
                  )
                ) : null}
              </>
            ) : null}

            {(selected.status === 'SHIPPED' || selected.status === 'DISPUTED') ? (
              <div className="deal-actions">
                <button type="button" disabled={busy} onClick={() => void release()}>
                  Выдать поставщику
                </button>
                <div className="form-row">
                  <input
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Причина возврата (необязательно)"
                  />
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => void refund()}
                  >
                    Вернуть покупателю
                  </button>
                </div>
              </div>
            ) : null}

            {notice ? <OkNote>{notice}</OkNote> : null}
          </div>
        ) : (
          <div className="panel deal-detail-panel">
            <p className="muted">Выберите сделку слева.</p>
          </div>
        )}
      </div>
    </div>
  );
}
