import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { offersApi, requestsApi } from '../../api';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { useAppLocale, useStatusLabel } from '../../i18n/useAppLocale';
import type { Offer, RequestItem } from '../../types';

export function RequestDetailPage() {
  const { t } = useTranslation();
  const { formatMoney } = useAppLocale();
  const statusLabel = useStatusLabel();
  const { id = '' } = useParams();
  const [request, setRequest] = useState<RequestItem | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [chatId, setChatId] = useState('');

  useEffect(() => {
    if (!id) return;
    void Promise.all([requestsApi.get(id), offersApi.byRequest(id)])
      .then(([req, offs]) => {
        setRequest(req);
        setOffers(offs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  async function accept(offerId: string) {
    try {
      const res = await offersApi.accept(offerId);
      setChatId(res.conversationId);
      setMsg(t('requests.acceptSuccess'));
      const [req, offs] = await Promise.all([
        requestsApi.get(id),
        offersApi.byRequest(id),
      ]);
      setRequest(req);
      setOffers(offs);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <BuyerLayout
      crumb={t('requests.detailCrumb', { code: request?.code ?? '...' })}
    >
      <div className="page">
        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}
        {msg ? (
          <div className="notice notice-success">
            <span>{msg}</span>
            {chatId ? (
              <Link className="primary" to={`/conversations?conversationId=${chatId}`}>
                {t('offers.openChat')}
              </Link>
            ) : null}
          </div>
        ) : null}
        {!request ? (
          <p className="assist-note">{t('common.loading')}</p>
        ) : (
          <>
            <div className="page-head">
              <div>
                <h1>{request.title}</h1>
                <p>
                  {request.code} · {request.city} · {statusLabel.request(request.status)}
                </p>
              </div>
              <Link className="ghost" to={`/offers?requestId=${request.id}`}>
                {t('requests.compareOffers')}
              </Link>
            </div>
            <div className="detail-grid">
              <div className="detail-main">
                <div className="panel">
                  <h3 className="section-title">{t('requests.description')}</h3>
                  <p style={{ margin: 0, lineHeight: 1.5 }}>{request.description}</p>
                </div>
                <div className="panel">
                  <h3 className="section-title">
                    {t('requests.offersSection', { count: offers.length })}
                  </h3>
                  <div className="offer-list">
                    {offers.map((o) => (
                      <div key={o.id} className="offer-row">
                        <div className="supplier-cell">
                          <div className="supplier-logo">
                            {o.company.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <b>{o.company.name}</b>
                            <div className="meta">
                              ★ {o.company.rating.toFixed(1)} · {o.company.city ?? t('common.empty')}
                              {o.company.verified ? <span className="verified"> ✓</span> : null}
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="label">{t('offers.total')}</div>
                          <div className="price">{formatMoney(o.price)}</div>
                        </div>
                        <div>
                          <div className="label">{t('offers.term')}</div>
                          <div className="value">
                            {o.deliveryDays
                              ? t('common.daysShort', { count: o.deliveryDays })
                              : t('common.empty')}
                          </div>
                        </div>
                        <div className="hide-md">
                          <span
                            className={`badge ${o.status === 'ACCEPTED' ? 'green' : 'blue'}`}
                          >
                            {statusLabel.offer(o.status)}
                          </span>
                        </div>
                        {o.status === 'PENDING' ? (
                          <button className="primary" onClick={() => void accept(o.id)}>
                            {t('common.choose')}
                          </button>
                        ) : (
                          <span className="ghost">{statusLabel.offer(o.status)}</span>
                        )}
                      </div>
                    ))}
                    {offers.length === 0 ? (
                      <p className="meta">{t('requests.noOffersYet')}</p>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="detail-side">
                <div className="panel">
                  <h3 className="section-title">{t('requests.params')}</h3>
                  <div className="kv">
                    <span>{t('requests.category')}</span>
                    <b>{request.category ?? t('common.empty')}</b>
                  </div>
                  <div className="kv">
                    <span>{t('requests.quantity')}</span>
                    <b>{request.quantity ?? t('common.empty')}</b>
                  </div>
                  <div className="kv">
                    <span>{t('requests.deadline')}</span>
                    <b>{request.deadline ?? t('common.empty')}</b>
                  </div>
                  <div className="kv">
                    <span>{t('requests.city')}</span>
                    <b>{request.city ?? t('common.empty')}</b>
                  </div>
                </div>
                <div className="panel" style={{ marginTop: 12 }}>
                  <h3 className="section-title">
                    {t('requests.matchedSuppliers', {
                      count: request.leads?.length ?? 0,
                    })}
                  </h3>
                  <p className="meta" style={{ marginTop: 0 }}>
                    {t('requests.matchedHint')}
                  </p>
                  {(request.leads ?? []).map((lead) => (
                    <div key={lead.id} className="kv">
                      <span>
                        {lead.company.name}
                        {lead.company.city ? ` · ${lead.company.city}` : ''}
                      </span>
                      <b>{Math.round(lead.score)}</b>
                    </div>
                  ))}
                  {(request.leads ?? []).length === 0 ? (
                    <p className="meta">{t('requests.noMatchedYet')}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </BuyerLayout>
  );
}
