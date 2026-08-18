import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { useLandingCta } from '../useLandingCta';

export function PhoneRequestPreview() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const ctaTo = useLandingCta();
  const cabinetHref = user?.role === 'SUPPLIER' ? '/supplier' : '/app';

  if (!loading && user) {
    return (
      <div className="hh-phone-preview">
        <h1 className="hh-phone-preview-title">{t('landing.phonePreviewTitle')}</h1>
        <p className="hh-phone-preview-lead">{t('landing.welcome')}</p>
        <form
          className="hh-phone-preview-form"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(cabinetHref);
          }}
        >
          <button className="hh-phone-preview-cta" type="submit">
            {t('landing.openApp')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="hh-phone-preview">
      <h1 className="hh-phone-preview-title">{t('landing.phonePreviewTitle')}</h1>
      <p className="hh-phone-preview-lead">{t('landing.welcome')}</p>

      <div className="hh-phone-preview-body">
        <p className="hh-phone-preview-example">{t('landing.phonePreviewExample')}</p>
        <span className="hh-phone-preview-city">{t('landing.phonePreviewCity')}</span>
      </div>

      <Link to={ctaTo} className="hh-phone-preview-cta">
        {t('landing.heroCta')}
      </Link>
      <p className="hh-phone-preview-note">{t('landing.phonePreviewNote')}</p>
    </div>
  );
}
