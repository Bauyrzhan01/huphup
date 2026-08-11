import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { offersApi } from '../../api';
import { SupplierLayout } from '../../layouts/AppLayouts';
import { useAppLocale, useStatusLabel } from '../../i18n/useAppLocale';
import type { Offer } from '../../types';

export function SupplierOffersPage() {
  const { t } = useTranslation();
  const { formatMoney, formatDateTime } = useAppLocale();
  const statusLabel = useStatusLabel();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const list = await offersApi.forCompany();
    setOffers(list);
  }

  useEffect(() => {
    void load()
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  async function withdraw(id: string) {
    if (!window.confirm(t('supplier.withdrawConfirm'))) return;
    try {
      await offersApi.withdraw(id);
      setMsg(t('supplier.withdrawn'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <SupplierLayout crumb={t('supplier.offersCrumb')}>
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t('supplier.offersTitle')}</h1>
            <p>{t('supplier.offersSubtitle', { count: offers.length })}</p>
          </div>
        </div>

        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}
        {msg ? <p className="notice">{msg}</p> : null}
        {loading ? <p className="assist-note">{t('common.loading')}</p> : null}

        <div className="card">
          <div className="request-list">
            {offers.map((o) => (
              <div key={o.id} className="request-item">
                <div>
                  <div className="request-title">{o.request?.title ?? '—'}</div>
                  <div className="meta">
                    {o.request?.code ?? '—'} · {o.request?.city ?? t('common.empty')}
                  </div>
                </div>
                <div>
                  <div className="label">{t('offers.total')}</div>
                  <div className="price">{formatMoney(o.price)}</div>
                </div>
                <div>
                  <div className="label">{t('offers.received')}</div>
                  <div className="value">
                    {o.createdAt ? formatDateTime(o.createdAt) : t('common.empty')}
                  </div>
                </div>
                <div>
                  <span
                    className={`badge ${o.status === 'ACCEPTED' ? 'green' : o.status === 'PENDING' ? 'blue' : 'amber'}`}
                  >
                    {statusLabel.offer(o.status)}
                  </span>
                </div>
                <div className="actions" style={{ margin: 0 }}>
                  {o.status === 'PENDING' ? (
                    <button type="button" className="ghost" onClick={() => void withdraw(o.id)}>
                      {t('supplier.withdrawOffer')}
                    </button>
                  ) : o.request?.id ? (
                    <Link className="ghost" to="/supplier/leads">
                      {t('supplier.viewLead')}
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {!loading && offers.length === 0 ? (
            <p className="meta" style={{ padding: 18 }}>
              {t('supplier.noOffersSent')}
            </p>
          ) : null}
        </div>
      </div>
    </SupplierLayout>
  );
}
