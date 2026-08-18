import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function LandingFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="hh-footer">
      <div className="hh-footer-inner">
        <div className="hh-footer-top">
          <div className="hh-footer-col hh-footer-col--brand">
            <p className="hh-footer-logo">HupHup</p>
            <p className="hh-footer-tagline">{t('landing.footerTagline')}</p>
          </div>

          <div className="hh-footer-col">
            <p className="hh-footer-heading">{t('landing.footerStatus')}</p>
            <p className="hh-footer-status">{t('landing.footerStatusText')}</p>
          </div>

          <div className="hh-footer-col">
            <p className="hh-footer-heading">{t('landing.footerPlatform')}</p>
            <nav className="hh-footer-nav" aria-label={t('landing.footerPlatform')}>
              <Link to="/login">{t('landing.signIn')}</Link>
              <Link to="/register?next=/requests/new">{t('landing.register')}</Link>
            </nav>
          </div>
        </div>

        <div className="hh-footer-bottom">
          <p className="hh-footer-copy">{t('landing.footerCopy', { year })}</p>
          <p className="hh-footer-temp">{t('landing.footerTemp')}</p>
        </div>
      </div>
    </footer>
  );
}
