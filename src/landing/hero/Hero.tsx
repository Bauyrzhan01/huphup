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

  return (
    <section ref={heroRef} className="hh-scroll">
      <div className="hh-hero hh-sticky">
        <HeroBackdrop progress={scrollYProgress} lite={profile.lite} />

        <header className="hh-hero-header">
          <Link to="/" className="hh-mark">
            HupHup
          </Link>
          <div className="hh-header-actions">
            {user ? (
              <Link to={cabinetHref} className="hh-header-btn hh-header-btn--solid">
                {t('landing.openApp')}
              </Link>
            ) : (
              <>
                <Link to="/login" className="hh-header-btn">
                  {t('landing.signIn')}
                </Link>
                <Link to="/register?next=/requests/new" className="hh-header-btn hh-header-btn--solid">
                  {t('landing.register')}
                </Link>
              </>
            )}
            <LanguageSwitcher compact />
          </div>
        </header>

        <div className="hh-stage">
          <Brand progress={scrollYProgress} pointer={pointer} ctaTo={ctaTo} lite={profile.lite} />

          <PhoneScrollAnimation progress={scrollYProgress} pointer={pointer} lite={profile.lite}>
            <PhoneAnimation>
              <Phone>
                <FrontGlass>
                  <PhoneRequestPreview />
                </FrontGlass>
              </Phone>
            </PhoneAnimation>
          </PhoneScrollAnimation>

          <Slogan progress={scrollYProgress} pointer={pointer} lite={profile.lite} />
        </div>
      </div>
    </section>
  );
}
