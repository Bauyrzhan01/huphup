import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi } from '../../api';
import { BuyerLayout } from '../../layouts/AppLayouts';
import type { Company } from '../../types';

const CITIES = ['', 'Алматы', 'Астана', 'Шымкент'];
const PAGE_SIZE = 12;

export function SuppliersPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Company[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(1);
  }, [q, city]);

  useEffect(() => {
    setLoading(true);
    void companiesApi
      .list({ q: q || undefined, city: city || undefined, page, limit: PAGE_SIZE })
      .then((res) => {
        setItems(res.items);
        setTotalPages(res.totalPages);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [q, city, page, t]);

  return (
    <BuyerLayout crumb={t('suppliers.title')}>
      <div className="page">
        <div className="page-head">
          <div>
            <h1>{t('suppliers.title')}</h1>
            <p>{t('suppliers.subtitle')}</p>
          </div>
        </div>
        <div className="toolbar">
          <input
            className="search"
            placeholder={t('suppliers.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="filter"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label={t('suppliers.cityFilter')}
          >
            {CITIES.map((c) => (
              <option key={c || 'all'} value={c}>
                {c || t('suppliers.allCities')}
              </option>
            ))}
          </select>
        </div>
        {error ? <p className="notice" style={{ color: '#b45309' }}>{error}</p> : null}
        {loading ? <p className="assist-note">{t('common.loading')}</p> : null}
        {!loading ? (
          <p className="meta" style={{ marginBottom: 12 }}>
            {t('suppliers.totalCount', { count: total })}
          </p>
        ) : null}
        <div className="supplier-grid">
          {items.map((c) => (
            <Link key={c.id} to={`/suppliers/${c.id}`} className="supplier-card supplier-card-link">
              <div className="supplier-logo">{c.name.slice(0, 2).toUpperCase()}</div>
              <h3>
                {c.name}
                {c.verified ? <span className="verified"> ✓</span> : null}
              </h3>
              <p>
                {c.description ||
                  `${c.city ?? t('common.empty')} · ${t('common.rating', { value: Number(c.rating).toFixed(1) })}`}
              </p>
              {c.categories.length > 0 ? (
                <div className="chips">
                  {c.categories.map((cat) => (
                    <span key={cat} className="chip">
                      {cat}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
        {!loading && items.length === 0 ? (
          <p className="assist-note">{t('suppliers.empty')}</p>
        ) : null}
        {totalPages > 1 ? (
          <div className="actions" style={{ marginTop: 20, justifyContent: 'center' }}>
            <button
              type="button"
              className="ghost"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('common.prevPage')}
            </button>
            <span className="meta">
              {t('common.pageOf', { page, total: totalPages })}
            </span>
            <button
              type="button"
              className="ghost"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('common.nextPage')}
            </button>
          </div>
        ) : null}
      </div>
    </BuyerLayout>
  );
}
