import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestsApi } from '../../api';
import { BuyerLayout } from '../../layouts/AppLayouts';
import type { RequestItem } from '../../types';

export function HomePage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    void requestsApi
      .list()
      .then((list) => setRecent(list.slice(0, 3)))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, []);

  function goRequest() {
    const text = q.trim();
    if (!text) return;
    sessionStorage.setItem('huphupDraft', text);
    navigate('/requests/new');
  }

  return (
    <BuyerLayout crumb={t('nav.businessCrumb')}>
      <section className="home-shell">
        <div className="home-center">
          <h1>{t('home.title')}</h1>
          <div className="composer">
            <textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('home.placeholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  goRequest();
                }
              }}
            />
            <div className="composer-footer">
              <div className="composer-tools">
                <button type="button" className="tool-pill">
                  {t('home.file')}
                </button>
                <button type="button" className="tool-pill">
                  {t('home.city')}
                </button>
                <button type="button" className="tool-pill">
                  {t('home.deadline')}
                </button>
              </div>
              <button type="button" className="send" onClick={goRequest} aria-label={t('common.send')}>
                <img src="/send-icon.png" alt="" className="send-icon" width={18} height={18} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="assist-note">{t('common.loading')}</div>
          ) : recent.length > 0 ? (
            <>
              <div className="assist-note" style={{ marginBottom: 8 }}>
                {t('home.recentTitle')}
              </div>
              <div className="suggestions">
                {recent.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="suggestion"
                    onClick={() => navigate(`/requests/${r.id}`)}
                  >
                    <b>{r.code}</b>
                    {r.title}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="panel home-empty-hint">
              <p>{t('home.emptyHint')}</p>
            </div>
          )}
        </div>
      </section>
    </BuyerLayout>
  );
}
