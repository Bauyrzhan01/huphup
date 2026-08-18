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
        <h2 className="hh-phone-preview-title">{t('home.title')}</h2>
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
      <h2 className="hh-phone-preview-title">{t('home.title')}</h2>
      <p className="hh-phone-preview-lead">{t('home.placeholder')}</p>

      <div className="hh-phone-preview-body">
        <p className="hh-phone-preview-example">{t('landing.phonePreviewExample')}</p>
        <div className="hh-phone-preview-pills">
          <span className="hh-phone-preview-city">{t('landing.phonePreviewCity')}</span>
          <span className="hh-phone-preview-city">{t('home.deadline')}</span>
        </div>
      </div>

      <Link to={ctaTo} className="hh-phone-preview-cta">
        {t('landing.heroCta')}
      </Link>
      <p className="hh-phone-preview-note">{t('landing.phonePreviewNote')}</p>
    </div>
  );
}
