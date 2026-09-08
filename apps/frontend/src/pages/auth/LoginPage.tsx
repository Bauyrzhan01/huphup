import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { PasswordInput } from '../../components/PasswordInput';
import { mapApiError } from '../../utils/apiErrors';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { t } = useTranslation();
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/app';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.role === 'SUPPLIER' && next === '/app' ? '/supplier' : next} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const signed = await login(email, password);
      navigate(signed.role === 'SUPPLIER' && next === '/app' ? '/supplier' : next);
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout mode="login" title={t('auth.login')} lead={t('auth.loginLead')}>
      <form className="hh-auth-form" onSubmit={onSubmit}>
        <div className="hh-auth-field">
          <label htmlFor="auth-email">{t('auth.email')}</label>
          <input
            id="auth-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="username"
          />
        </div>
        <div className="hh-auth-field">
          <label htmlFor="auth-password">{t('auth.password')}</label>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
        </div>
        {error ? <p className="hh-auth-error">{error}</p> : null}
        <div className="hh-auth-links">
          <Link to="/forgot-password">{t('auth.forgotLink')}</Link>
        </div>
        <button className="hh-auth-submit" disabled={busy}>
          {busy ? '…' : t('auth.signIn')}
        </button>
      </form>
      <p className="hh-auth-foot">
        {t('landing.noAccount')}
        <Link to={`/register${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`}>
          {t('auth.noAccount')}
        </Link>
      </p>
    </AuthLayout>
  );
}
