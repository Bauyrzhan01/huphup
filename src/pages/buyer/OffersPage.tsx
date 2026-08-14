import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { offersApi, requestsApi } from '../../api';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { RatingStar, VerifiedMark } from '../../components/RatingIcons';
import { useAppLocale, useStatusLabel } from '../../i18n/useAppLocale';
import type { Offer, RequestItem } from '../../types';

export function OffersPage() {
  const { t } = useTranslation();
  const { formatMoney, formatDateTime } = useAppLocale();
  const statusLabel = useStatusLabel();
  const [params] = useSearchParams();
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [selectedId, setSelectedId] = useState(params.get('requestId') ?? '');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  const [msg, setMsg] = useState('');
  const [chatId, setChatId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const requestIdFromUrl = params.get('requestId') ?? '';
    void Promise.all([
      requestsApi.list(),
      offersApi.mine(),
      requestIdFromUrl ? offersApi.byRequest(requestIdFromUrl) : Promise.resolve([] as Offer[]),
    ])
      .then(([list, mine, initialOffers]) => {
        const id = requestIdFromUrl || list[0]?.id || '';
        setRequests(list);
        setAllOffers(mine);
        setSelectedId(id);
        if (requestIdFromUrl) setOffers(initialOffers);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t, params]);

  useEffect(() => {
    if (!selectedId) {
      setOffers([]);
      return;
    }
    const requestIdFromUrl = params.get('requestId') ?? '';
    if (requestIdFromUrl && selectedId === requestIdFromUrl) return;
    void offersApi
      .byRequest(selectedId)
      .then(setOffers)
      .catch(() => setOffers([]));
  }, [selectedId, params]);

  const selected = useMemo(
    () => requests.find((r) => r.id === selectedId),
    [requests, selectedId],
  );

  const bestId = useMemo(() => {
    if (!offers.length) return null;
    return [...offers].sort((a, b) => Number(a.price) - Number(b.price))[0]?.id ?? null;
  }, [offers]);

  async function accept(offerId: string) {
    const res = await offersApi.accept(offerId);
    setChatId(res.conversationId);
    setMsg(t('offers.acceptSuccess'));
    const [offs, mine] = await Promise.all([
      offersApi.byRequest(selectedId),
      offersApi.mine(),
    ]);
    setOffers(offs);
    setAllOffers(mine);
  }

  async function reject(offerId: string) {
    await offersApi.reject(offerId);
    setMsg(t('offers.rejected'));
    const offs = await offersApi.byRequest(selectedId);
    setOffers(offs);
  }

  return (
    <BuyerLayout crumb={t('offers.title')}>
      <div className="page offers-page-compact">
        <div className="page-head">
          <div>
            <h1>{t('offers.title')}</h1>
            <p>
              {loading
                ? t('offers.subtitleLoading')
                : selected
                  ? t('offers.subtitleSelected', {
                      title: selected.title,
                      count: offers.length,
                    })
                  : t('offers.subtitleTotal', { count: allOffers.length })}
            </p>
          </div>
          {selected ? (
            <Link className="ghost" to={`/requests/${selected.id}`}>
              {t('offers.toRequest')}
            </Link>
          ) : null}
        </div>

        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}
        {msg ? (
          <div className="notice notice-success">
            <span>{msg}</span>
            {chatId ? (
              <Link className="primary" to={`/conversations?workspace=buyer&conversationId=${chatId}`}>
                {t('offers.openChat')}
              </Link>
            ) : null}
          </div>
        ) : null}

        {requests.length === 0 ? (
          <div className="panel chat-empty-state">
            <b>{t('offers.noRequests')}</b>
            <Link className="primary" to="/app">
              {t('requests.newShort')}
            </Link>
          </div>
        ) : (
          <div className="offers-workspace">
            <aside className="card chat-rail">
              <div className="leads-rail-head">
                <b>{t('offers.requestsList')}</b>
                <span>{requests.length}</span>
              </div>
              {requests.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`chat-item${selectedId === r.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className="chat-item-body" style={{ width: '100%' }}>
                    <div className="chat-item-top">
                      <b>{r.title}</b>
                      <span className={`badge ${r.status === 'PUBLISHED' ? 'green' : 'blue'}`}>
                        {statusLabel.request(r.status)}
                      </span>
                    </div>
                    <div className="chat-item-meta">
                      <span className="lead-code">{r.code}</span>
                      <span className="meta">
                        {t('offers.countShort', { count: r._count?.offers ?? 0 })}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </aside>

            <section className="offers-main">
              {selected ? (
                <div className="panel" style={{ marginBottom: 14 }}>
                  <div className="lead-hero-chips">
                    <span className="chip-strong">{selected.code}</span>
                    <span className="chip soft">{selected.city ?? t('common.empty')}</span>
                  </div>
                  <h2 style={{ margin: '8px 0 6px', fontSize: 22 }}>{selected.title}</h2>
                  <p className="meta" style={{ margin: 0, lineHeight: 1.5 }}>
                    {selected.description}
                  </p>
                </div>
              ) : null}

              <div className="offer-cards">
                {offers.map((o) => (
                  <div key={o.id} className={`offer-card${o.id === bestId ? ' is-best' : ''}`}>
                    <div className="offer-card-top">
                      <div className="supplier-cell">
                        <div className="supplier-logo">
                          {o.company.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <b>{o.company.name}</b>
                          <div className="meta">
                            <span className="inline-rating"><RatingStar size={13} /> {o.company.rating.toFixed(1)}</span> ·{' '}
                            {o.company.city ?? t('common.empty')}
                            {o.company.verified ? (
                              <span className="verified"><VerifiedMark size={14} /></span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <span className={`badge ${o.id === bestId ? 'green' : 'blue'}`}>
                        {o.id === bestId
                          ? t('offers.bestPrice')
                          : statusLabel.offer(o.status)}
                      </span>
                    </div>
                    <div className="lead-info-grid request-card-grid">
                      <div className="lead-info-cell">
                        <small>{t('offers.total')}</small>
                        <b className="price">{formatMoney(o.price)}</b>
                      </div>
                      <div className="lead-info-cell">
                        <small>{t('offers.term')}</small>
                        <b>
                          {o.deliveryDays != null
                            ? t('common.days', { count: o.deliveryDays })
                            : t('common.empty')}
                        </b>
                      </div>
                      <div className="lead-info-cell">
                        <small>{t('offers.received')}</small>
                        <b>
                          {o.createdAt
                            ? formatDateTime(o.createdAt)
                            : t('common.empty')}
                        </b>
                      </div>
                    </div>
                    {o.comment ? (
                      <p className="offer-comment">{o.comment}</p>
                    ) : null}
                    <div className="actions" style={{ marginTop: 12 }}>
                      {o.status === 'PENDING' ? (
                        <>
                          <button className="primary" onClick={() => void accept(o.id)}>
                            {t('common.choose')}
                          </button>
                          <button className="ghost" onClick={() => void reject(o.id)}>
                            {t('offers.reject')}
                          </button>
                        </>
                      ) : (
                        <span className="ghost">{statusLabel.offer(o.status)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {offers.length === 0 ? (
                  <div className="panel chat-empty-state" style={{ minHeight: 220 }}>
                    <b>{t('offers.noOffersForRequest')}</b>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        )}
      </div>
    </BuyerLayout>
  );
}
