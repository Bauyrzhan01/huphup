import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { platformApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { LandingFooter } from '../sections/LandingFooter';
import '../sections/sections.css';
import { KazakhstanMap } from './KazakhstanMap';
import type { PlatformLive, PlatformLiveFeedItem } from './types';
import './live-platform.css';

const POLL_MS = 5_000;

function formatRelative(iso: string, locale: string) {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return locale.startsWith('kk') ? 'жаңа ғана' : 'только что';
  if (minutes < 60) return locale.startsWith('kk') ? `${minutes} мин бұрын` : `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale.startsWith('kk') ? `${hours} сағ бұрын` : `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return locale.startsWith('kk') ? `${days} күн бұрын` : `${days} дн назад`;
}

function feedKindLabel(kind: PlatformLiveFeedItem['kind'], t: (key: string) => string) {
  if (kind === 'request') return t('landing.live.kindRequest');
  if (kind === 'offer') return t('landing.live.kindOffer');
  return t('landing.live.kindCompany');
}

function AnimatedStat({ value, loading }: { value: number | undefined; loading: boolean }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (loading && value == null) return;
    const target = value ?? 0;
    let frame = 0;
    const start = display;
    const diff = target - start;
    if (diff === 0) {
      setDisplay(target);
      return;
    }
    const id = window.setInterval(() => {
      frame += 1;
      setDisplay(Math.round(start + (diff * frame) / 14));
      if (frame >= 14) window.clearInterval(id);
    }, 30);
    return () => window.clearInterval(id);
  }, [value, loading]);

  if (loading && value == null) return <>…</>;
  return <>{display}</>;
}

export function LiveLandingPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<PlatformLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [freshPulse, setFreshPulse] = useState(false);
  const cabinetHref = user?.role === 'SUPPLIER' ? '/supplier' : '/app';

  const load = useCallback(async () => {
    try {
      const snapshot = await platformApi.live();
      setData((prev) => {
        if (prev && snapshot.feed[0]?.id && prev.feed[0]?.id !== snapshot.feed[0]?.id) {
          setFreshPulse(true);
          window.setTimeout(() => setFreshPulse(false), 1600);
        }
        return snapshot;
      });
    } catch {
      /* keep last snapshot */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const requests = useMemo(
    () => (data?.feed ?? []).filter((item) => item.kind === 'request'),
    [data?.feed],
  );

  // Бэкенд отдаёт не больше feedLimit записей — не выдаём срез за весь объём.
  const truncatedFeed =
    typeof data?.feedTotal === 'number' && data.feedTotal > data.feed.length;

  const stats = data?.stats;

  return (
    <div className={`live-page${freshPulse ? ' is-fresh' : ''}`}>
      <section className="live-stage">
        <header className="live-header">
          <Link to="/" className="live-mark">
            HupHup
          </Link>
          <div className="live-header-actions">
            {user ? (
              <Link to={cabinetHref} className="live-header-btn live-header-btn--solid">
                {t('landing.openApp')}
              </Link>
            ) : (
              <>
                <Link to="/login" className="live-header-btn live-header-btn--ghost">
                  {t('landing.signIn')}
                </Link>
                <Link to="/register?next=/requests/new" className="live-header-btn live-header-btn--solid">
                  {t('landing.register')}
                </Link>
              </>
            )}
            <LanguageSwitcher compact />
          </div>
        </header>

        <div className="live-stage-main">
          <div className="live-stage-map">
            <KazakhstanMap
              cities={data?.cities ?? []}
              pulse={data?.pulse ?? null}
              flow={data?.flow ?? null}
              feed={data?.feed ?? []}
            />
          </div>

          <div className="live-hero-overlay">
            <p className="live-kicker">
              <span className="live-kicker-dot" />
              {t('landing.live.kicker')}
            </p>
            <h1 className="live-title">{t('landing.live.title')}</h1>
            <p className="live-lead">{t('landing.live.lead')}</p>

            {requests.length > 0 && (
              <div className="live-ticker live-ticker--all">
                <span className="live-ticker-badge">{t('landing.live.nowPlaying')}</span>
                <p className="live-ticker-code">
                  {t('landing.live.allActive', { count: requests.length })}
                </p>
                <ul className="live-ticker-list">
                  {requests.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      <b>{item.code}</b>
                      <span>{item.city ?? '—'}</span>
                    </li>
                  ))}
                </ul>
                {requests.length > 5 && (
                  <p className="live-ticker-meta">
                    {t('landing.live.andMore', { count: requests.length - 5 })}
                  </p>
                )}
              </div>
            )}

            <div className="live-hero-cta">
              <Link to="/register?next=/requests/new" className="live-cta">
                {t('landing.heroCta')}
              </Link>
              <Link to="/register?role=SUPPLIER" className="live-cta live-cta--ghost">
                {t('landing.heroSupplier')}
              </Link>
            </div>
            {data?.checkedAt && (
              <p className="live-updated">
                <span className="live-updated-dot" />
                {t('landing.live.updated', {
                  time: formatRelative(data.checkedAt, i18n.language),
                })}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="live-stats" aria-label={t('landing.live.statsLabel')}>
        <article className="live-stat">
          <p className="live-stat-value">
            <AnimatedStat value={stats?.requestsToday} loading={loading} />
          </p>
          <p className="live-stat-label">{t('landing.live.statRequests')}</p>
        </article>
        <article className="live-stat">
          <p className="live-stat-value">
            <AnimatedStat value={stats?.offersToday} loading={loading} />
          </p>
          <p className="live-stat-label">{t('landing.live.statOffers')}</p>
        </article>
        <article className="live-stat">
          <p className="live-stat-value">
            <AnimatedStat value={stats?.companies} loading={loading} />
          </p>
          <p className="live-stat-label">{t('landing.live.statCompanies')}</p>
        </article>
        <article className="live-stat">
          <p className="live-stat-value">
            <AnimatedStat value={stats?.online} loading={loading} />
          </p>
          <p className="live-stat-label">{t('landing.live.statOnline')}</p>
        </article>
        <article className="live-stat">
          <p className="live-stat-value">
            <AnimatedStat value={stats?.products} loading={loading} />
          </p>
          <p className="live-stat-label">{t('landing.live.statProducts')}</p>
        </article>
        <article className="live-stat">
          <p className="live-stat-value">
            <AnimatedStat value={stats?.acceptedTotal} loading={loading} />
          </p>
          <p className="live-stat-label">{t('landing.live.statAccepted')}</p>
        </article>
      </section>

      <section className="live-feed-section">
        <div className="live-feed-head">
          <h2>{t('landing.live.feedTitle')}</h2>
          {requests.length > 0 && (
            <span className="live-feed-count">
              {truncatedFeed
                ? t('landing.live.feedCountOf', {
                    shown: data?.feed.length ?? 0,
                    total: data?.feedTotal ?? 0,
                  })
                : t('landing.live.feedCount', { count: requests.length })}
            </span>
          )}
        </div>
        {loading && !data ? (
          <p className="live-feed-empty">{t('landing.live.loading')}</p>
        ) : !data?.feed.length ? (
          <p className="live-feed-empty">{t('landing.live.feedEmpty')}</p>
        ) : (
          <ul className="live-feed-list">
            {data.feed.map((item, index) => (
              <li
                key={`${item.kind}-${item.id}`}
                className="live-feed-item is-active"
                style={{ animationDelay: `${Math.min(index, 12) * 0.05}s` }}
              >
                <span className={`live-feed-badge live-feed-badge--${item.kind}`}>
                  {feedKindLabel(item.kind, t)}
                </span>
                <div className="live-feed-body">
                  <p className="live-feed-title">
                    {item.code ? `${item.code} · ` : ''}
                    {item.label}
                  </p>
                  <p className="live-feed-meta">
                    {item.city ? `${item.city} · ` : ''}
                    {formatRelative(item.at, i18n.language)}
                    {item.status ? ` · ${item.status}` : ''}
                  </p>
                </div>
                {item.kind === 'request' && (
                  <span className="live-feed-live">{t('landing.live.onMap')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <LandingFooter />
    </div>
  );
}
