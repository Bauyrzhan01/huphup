import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import './auth.css';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

export function AuthLayout({
  mode,
  title,
  lead,
  children,
}: {
  mode: AuthMode;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const isRegister = mode === 'register';

  return (
    <div className={`hh-auth hh-auth--${mode}`}>
      {!isRegister ? (
        <aside className="hh-auth-visual" aria-hidden="true">
          <div className="hh-auth-visual-glow" />
          <svg className="hh-auth-path" viewBox="0 0 720 900" preserveAspectRatio="xMidYMid slice">
            <path d="M-40 520 C80 490 160 560 240 530 C360 480 460 360 560 300 C640 250 700 420 640 560 C580 700 500 780 420 860" />
            <path d="M240 530 L80 620" />
            <path d="M560 300 L680 180" />
          </svg>
          <span className="hh-auth-watermark">{t('landing.bg01')}</span>
          <div className="hh-auth-visual-copy">
            <p className="hh-auth-kicker">HupHup</p>
            <p className="hh-auth-slogan">
              <span>{t('landing.sloganL1')}</span>
              <span>{t('landing.sloganL2')}</span>
              <em>{t('landing.sloganAccent')}</em>
            </p>
            <ul className="hh-auth-points">
              <li>{t('auth.point1')}</li>
              <li>{t('auth.point2')}</li>
              <li>{t('auth.point3')}</li>
            </ul>
          </div>
        </aside>
      ) : null}

      <div className="hh-auth-panel">
        <header className="hh-auth-header">
          <Link to="/" className="hh-auth-mark">
            HupHup
          </Link>
          <div className="hh-auth-header-actions">
            <LanguageSwitcher compact />
          </div>
        </header>

        <div className="hh-auth-body">
          <div className="hh-auth-card">
            <p className="hh-auth-card-kicker">{t(`auth.kicker.${mode}`)}</p>
            <h1 className="hh-auth-title">{title}</h1>
            <p className="hh-auth-lead">{lead}</p>
            {children}
          </div>
        </div>
      </div>

      {isRegister ? (
        <aside className="hh-auth-visual hh-auth-visual--dark" aria-hidden="true">
          <span className="hh-auth-watermark">{t('auth.registerWatermark')}</span>
          <div className="hh-auth-visual-copy">
            <p className="hh-auth-kicker">{t('auth.registerSideKicker')}</p>
            <p className="hh-auth-slogan">
              <span>{t('landing.finalL1')}</span>
              <span>
                {t('landing.finalL2')}
                <em>{t('landing.finalL2Em')}</em>
              </span>
            </p>
            <ol className="hh-auth-steps">
              <li>
                <span>01</span>
                {t('auth.registerStep1')}
              </li>
              <li>
                <span>02</span>
                {t('auth.registerStep2')}
              </li>
              <li>
                <span>03</span>
                {t('auth.registerStep3')}
              </li>
            </ol>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
