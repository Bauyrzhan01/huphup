import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { RequestFlowDemo } from '../components/RequestFlowDemo';

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`landing-reveal${shown ? ' is-visible' : ''} ${className}`.trim()}
      style={{ transitionDelay: shown ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const appHref = user ? '/app' : '/register';

  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden="true">
        <span className="landing-orb landing-orb-a" />
        <span className="landing-orb landing-orb-b" />
        <span className="landing-grid" />
      </div>

      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand">
            <span className="logo">H</span>
            <span>HupHup</span>
          </Link>
          <div className="landing-nav-actions">
            <LanguageSwitcher compact />
            {!loading && user ? (
              <Link className="primary" to="/app">
                {t('landing.openApp')}
              </Link>
            ) : (
              <>
                <Link className="ghost" to="/login">
                  {t('auth.signIn')}
                </Link>
                <Link className="primary" to="/register">
                  {t('landing.start')}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-inner">
          <p className="landing-kicker landing-hero-anim" style={{ animationDelay: '40ms' }}>
            HupHup
          </p>
          <h1 className="landing-hero-anim" style={{ animationDelay: '120ms' }}>
            {t('landing.heroTitle')}
          </h1>
          <p className="landing-lead landing-hero-anim" style={{ animationDelay: '220ms' }}>
            {t('landing.heroText')}
          </p>
          <div className="landing-cta landing-hero-anim" style={{ animationDelay: '320ms' }}>
            <Link className="primary landing-cta-main landing-pulse" to={appHref}>
              {user ? t('landing.openApp') : t('landing.startFree')}
            </Link>
            <a className="ghost" href="#how">
              {t('landing.howLink')}
            </a>
          </div>
        </div>
        <div className="landing-hero-visual landing-hero-anim" style={{ animationDelay: '200ms' }}>
          <RequestFlowDemo />
        </div>
      </section>

      <section className="landing-section landing-section-alt" id="how">
        <div className="landing-section-inner">
          <Reveal>
            <h2>{t('landing.howTitle')}</h2>
            <p className="landing-section-lead">{t('landing.howLead')}</p>
          </Reveal>
          <ol className="landing-flow">
            <Reveal delay={60}>
              <li className="landing-flow-step">
                <span className="landing-flow-num">1</span>
                <div className="landing-flow-copy">
                  <strong>{t('landing.step1Title')}</strong>
                  <span>{t('landing.step1Text')}</span>
                </div>
                <div className="landing-flow-visual" aria-hidden="true">
                  <div className="landing-flow-typewriter">
                    <span className="landing-flow-line" />
                    <span className="landing-flow-line is-short" />
                    <span className="landing-flow-cursor" />
                  </div>
                </div>
              </li>
            </Reveal>
            <Reveal delay={140}>
              <li className="landing-flow-step">
                <span className="landing-flow-num">2</span>
                <div className="landing-flow-copy">
                  <strong>{t('landing.step2Title')}</strong>
                  <span>{t('landing.step2Text')}</span>
                </div>
                <div className="landing-flow-visual" aria-hidden="true">
                  <div className="landing-flow-radar">
                    <span />
                    <span />
                    <span />
                    <i className="landing-flow-ping" />
                    <i className="landing-flow-ping is-b" />
                    <i className="landing-flow-ping is-c" />
                  </div>
                </div>
              </li>
            </Reveal>
            <Reveal delay={220}>
              <li className="landing-flow-step">
                <span className="landing-flow-num">3</span>
                <div className="landing-flow-copy">
                  <strong>{t('landing.step3Title')}</strong>
                  <span>{t('landing.step3Text')}</span>
                </div>
                <div className="landing-flow-visual" aria-hidden="true">
                  <div className="landing-flow-offers">
                    <span className="landing-flow-offer-bar" style={{ width: '88%' }} />
                    <span className="landing-flow-offer-bar" style={{ width: '72%' }} />
                    <span className="landing-flow-offer-bar" style={{ width: '64%' }} />
                  </div>
                </div>
              </li>
            </Reveal>
          </ol>
        </div>
      </section>

      <section className="landing-section" id="about">
        <div className="landing-section-inner">
          <Reveal>
            <h2>{t('landing.aboutTitle')}</h2>
            <p>{t('landing.aboutText')}</p>
          </Reveal>
        </div>
      </section>

      <section className="landing-section landing-section-alt" id="roles">
        <div className="landing-section-inner">
          <Reveal>
            <h2>{t('landing.rolesTitle')}</h2>
          </Reveal>
          <div className="landing-roles">
            <Reveal delay={80}>
              <div className="landing-role">
                <h3>{t('landing.buyerTitle')}</h3>
                <p>{t('landing.buyerText')}</p>
              </div>
            </Reveal>
            <Reveal delay={160}>
              <div className="landing-role">
                <h3>{t('landing.supplierTitle')}</h3>
                <p>{t('landing.supplierText')}</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-inner landing-final">
          <Reveal>
            <h2>{t('landing.finalTitle')}</h2>
            <p>{t('landing.finalText')}</p>
            <Link className="primary landing-cta-main landing-pulse" to={appHref}>
              {user ? t('landing.openApp') : t('landing.startFree')}
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span>© {new Date().getFullYear()} HupHup</span>
          <span>{t('landing.footerTag')}</span>
        </div>
      </footer>
    </div>
  );
}
