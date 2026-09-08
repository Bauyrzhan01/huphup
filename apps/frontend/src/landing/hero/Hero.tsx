import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useScroll } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Brand } from './Brand';
import { HeroBackdrop } from './HeroBackdrop';
import { PhoneRequestPreview } from './PhoneRequestPreview';
import { useLandingCta } from '../useLandingCta';
import { Phone } from './Phone';
import { PhoneAnimation } from './PhoneAnimation';
import { PhoneScrollAnimation } from './PhoneScrollAnimation';
import { FrontGlass } from './PhoneScreen';
import { Slogan } from './Slogan';
import { useHeroPointer } from './useHeroPointer';
import { useScrollMotionProfile } from '../useScrollMotionProfile';
import './hero.css';

function PhoneBlock({
  progress,
  pointer,
  mobile,
  lite,
}: {
  progress: ReturnType<typeof useScroll>['scrollYProgress'];
  pointer: ReturnType<typeof useHeroPointer>;
  mobile: boolean;
  lite: boolean;
}) {
  return (
    <PhoneScrollAnimation progress={progress} pointer={pointer} mobile={mobile} lite={lite}>
      <PhoneAnimation mobile={mobile}>
        <Phone>
          <FrontGlass>
            <PhoneRequestPreview />
          </FrontGlass>
        </Phone>
      </PhoneAnimation>
    </PhoneScrollAnimation>
  );
}

export function Hero() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const pointer = useHeroPointer();
  const profile = useScrollMotionProfile();
  const cabinetHref = user?.role === 'SUPPLIER' ? '/supplier' : '/app';
  const ctaTo = useLandingCta();

  const shared = {
    progress: scrollYProgress,
    pointer,
    mobile: profile.mobile,
    lite: profile.lite,
  };

  return (
    <section
      ref={heroRef}
      className={`hh-scroll${profile.mobile ? ' hh-scroll--mobile' : ''}`}
    >
      <div className="hh-hero hh-sticky">
        <HeroBackdrop progress={scrollYProgress} mobile={profile.mobile} lite={profile.lite} />

        <header
          className={`hh-header absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4 sm:px-8${profile.mobile ? ' hh-header--mobile' : ''}`}
        >
          <Link to="/" className="hh-mark">
            HupHup
          </Link>
          <div className="hh-header-actions">
            {user ? (
              <Link to={cabinetHref} className="hh-header-btn hh-header-btn--solid">
                {t('landing.openApp')}
              </Link>
            ) : profile.mobile ? (
              <>
                <Link to="/register?next=/requests/new" className="hh-header-btn hh-header-btn--solid">
                  {t('landing.register')}
                </Link>
                <details className="hh-header-menu">
                  <summary className="hh-header-menu-btn" aria-label={t('landing.footerPlatform')}>
                    ···
                  </summary>
                  <div className="hh-header-menu-panel">
                    <Link to="/login">{t('landing.signIn')}</Link>
                    <Link to="/register?role=SUPPLIER">{t('landing.heroSupplier')}</Link>
                    <LanguageSwitcher compact />
                  </div>
                </details>
              </>
            ) : (
              <>
                <Link to="/login" className="hh-header-btn">
                  {t('landing.signIn')}
                </Link>
                <Link to="/register?next=/requests/new" className="hh-header-btn hh-header-btn--solid">
                  {t('landing.register')}
                </Link>
                <LanguageSwitcher compact />
              </>
            )}
            {profile.mobile && user && <LanguageSwitcher compact />}
          </div>
        </header>

        <div className="hh-stage">
          {profile.mobile ? (
            <>
              <Slogan {...shared} />
              <Brand {...shared} ctaTo={ctaTo} mobileLayout />
              <PhoneBlock {...shared} />
            </>
          ) : (
            <>
              <Slogan {...shared} />
              <PhoneBlock {...shared} />
              <Brand {...shared} ctaTo={ctaTo} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
