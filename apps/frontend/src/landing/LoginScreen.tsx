import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { mapApiError } from '../utils/apiErrors';

export function LoginScreen() {
  const { t } = useTranslation();
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const cabinetHref = user?.role === 'SUPPLIER' ? '/supplier' : '/app';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const next = await login(email, password);
      navigate(next.role === 'SUPPLIER' ? '/supplier' : '/app');
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (!loading && user) {
    return (
      <div className="hh-login">
        <h1 className="hh-login-title">{t('landing.signIn')}</h1>
        <p className="hh-login-welcome">{t('landing.welcome')}</p>
        <form
          className="hh-login-form"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(cabinetHref);
          }}
        >
          <button className="hh-login-submit" type="submit">
            {t('landing.openApp')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="hh-login">
      <h1 className="hh-login-title">{t('landing.signIn')}</h1>
      <p className="hh-login-welcome">{t('landing.welcome')}</p>

      <form className="hh-login-form" onSubmit={onSubmit}>
        <div className="hh-login-field">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="text"
            inputMode="email"
            autoComplete="username"
            placeholder={t('landing.emailOrPhone')}
            aria-label={t('landing.emailOrPhone')}
            required
          />
        </div>
        <div className="hh-login-field">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder={t('landing.password')}
            aria-label={t('landing.password')}
            required
          />
          <button
            type="button"
            className="hh-login-eye"
            aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4M6.7 6.7C4.6 8.1 3 10.2 2 12s3.5 7 10 7c1.8 0 3.4-.4 4.8-1.1M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a16.2 16.2 0 0 1-4.1 5.1"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            )}
          </button>
        </div>

        {error ? <p className="hh-login-error">{error}</p> : null}

        <button className="hh-login-submit" disabled={busy}>
          {busy ? '…' : t('landing.signIn')}
        </button>

        <p className="hh-login-foot">
          {t('landing.noAccount')}
          <Link to="/register?next=/requests/new" className="hh-login-register">
            {t('landing.register')}
          </Link>
        </p>
      </form>
    </div>
  );
}
