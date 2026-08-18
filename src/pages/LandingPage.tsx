import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { RequestFlowContinue } from '../components/RequestFlowContinue';
import { Hero } from '../landing/hero';

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
  const { user } = useAuth();
  const appHref = user ? '/app' : '/register';

  return (
    <div className="landing">
      <Hero />

      <section className="landing-section landing-section-alt" id="how">
        <div className="landing-section-inner">
          <Reveal>
            <h2>{t('landing.howTitle')}</h2>
            <p className="landing-section-lead">{t('landing.howLead')}</p>
          </Reveal>
          <RequestFlowContinue />
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
