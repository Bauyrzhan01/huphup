import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { dealsApi } from '../api';
import { AppIcon } from '../components/AppIcon';
import { useAuth } from '../auth/AuthContext';
import { BuyerLayout, SupplierLayout } from '../layouts/AppLayouts';
import { useAppLocale } from '../i18n/useAppLocale';
import type { Deal, DealStatus } from '../types';
import { mapApiError } from '../utils/apiErrors';

/** Порядок соответствует машине состояний на бэкенде. */
const STATUS_TONE: Record<DealStatus, string> = {
  AWAITING_PAYMENT: 'is-waiting',
  HELD: 'is-held',
  SHIPPED: 'is-shipped',
  RELEASED: 'is-done',
  REFUNDED: 'is-refunded',
  DISPUTED: 'is-disputed',
};

export function DealsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatMoney, formatDateTime } = useAppLocale();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const isSupplier = user?.role === 'SUPPLIER';
  const Layout = isSupplier ? SupplierLayout : BuyerLayout;

  const load = useCallback(() => {
    setLoading(true);
    void dealsApi
      .list()
      .then((items) => {
        setDeals(items);
        setError('');
      })
      .catch((err) =>
        setError(mapApiError(err, t)),
      )
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(dealId: string, action: () => Promise<Deal>) {
    setBusyId(dealId);
    setError('');
    try {
      const updated = await action();
      setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusyId('');
    }
  }

  function askReason(promptKey: string) {
    const reason = window.prompt(t(promptKey));
    return reason?.trim() ?? '';
  }

  return (
    <Layout crumb={t('deals.title')}>
      <div className="page deals-page">
        <section className="panel deals-intro">
          <span className="deals-intro-icon" aria-hidden="true">
            <AppIcon icon={ShieldCheck} className="ico" size={20} />
          </span>
          <div>
            <h2 className="section-title">{t('deals.introTitle')}</h2>
            <p className="deals-intro-text">{t('deals.introText')}</p>
          </div>
        </section>

        {error ? <p className="assist-note deals-error">{error}</p> : null}

        {loading && !deals.length ? (
          <p className="assist-note">{t('common.loading')}</p>
        ) : !deals.length ? (
          error ? null : <p className="assist-note">{t('deals.empty')}</p>
        ) : (
          <ul className="deals-list">
            {deals.map((deal) => {
              const busy = busyId === deal.id;
              const buyerSide = deal.side === 'buyer';

              return (
                <li key={deal.id} className="panel deal-card">
                  <div className="deal-head">
                    <div className="deal-head-main">
                      <p className="deal-code">{deal.request.code}</p>
                      <p className="deal-title">{deal.request.title}</p>
                      <p className="deal-party">
                        {buyerSide
                          ? deal.company.name
                          : (deal.buyer?.fullName ?? t('deals.buyer'))}
                        {deal.request.city ? ` · ${deal.request.city}` : ''}
                      </p>
                    </div>
                    <div className="deal-head-amount">
                      <p className="deal-amount">
                        {formatMoney(deal.amount)} {deal.currency}
                      </p>
                      <span className={`deal-status ${STATUS_TONE[deal.status]}`}>
                        {t(`deals.status.${deal.status}`)}
                      </span>
                    </div>
                  </div>

                  <p className="deal-hint">
                    {t(`deals.hint.${deal.status}`, {
                      date: deal.autoReleaseAt
                        ? formatDateTime(deal.autoReleaseAt)
                        : '',
                    })}
                  </p>

                  {deal.disputeReason ? (
                    <p className="deal-dispute">
                      {t('deals.disputeReason')}: {deal.disputeReason}
                    </p>
                  ) : null}

                  {Number(deal.commission) > 0 ? (
                    <p className="deal-payout">
                      {t('deals.payout')}: {formatMoney(deal.payout)}{' '}
                      {deal.currency} ({t('deals.commission')}{' '}
                      {formatMoney(deal.commission)})
                    </p>
                  ) : null}

                  <div className="deal-actions">
                    {buyerSide && deal.status === 'AWAITING_PAYMENT' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(deal.id, () => dealsApi.pay(deal.id))}
                      >
                        {t('deals.pay')}
                      </button>
                    ) : null}

                    {!buyerSide && deal.status === 'HELD' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(deal.id, () => dealsApi.ship(deal.id))}
                      >
                        {t('deals.ship')}
                      </button>
                    ) : null}

                    {buyerSide && deal.status === 'SHIPPED' ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(deal.id, () => dealsApi.confirm(deal.id))
                        }
                      >
                        {t('deals.confirm')}
                      </button>
                    ) : null}

                    {buyerSide && deal.status === 'HELD' ? (
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => {
                          const reason = askReason('deals.cancelPrompt');
                          void run(deal.id, () => dealsApi.cancel(deal.id, reason));
                        }}
                      >
                        {t('deals.cancel')}
                      </button>
                    ) : null}

                    {deal.status === 'SHIPPED' || deal.status === 'HELD' ? (
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => {
                          const reason = askReason('deals.disputePrompt');
                          if (reason.length < 5) return;
                          void run(deal.id, () => dealsApi.dispute(deal.id, reason));
                        }}
                      >
                        {t('deals.dispute')}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Layout>
  );
}
