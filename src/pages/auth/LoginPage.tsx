import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { PasswordInput } from '../../components/PasswordInput';

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
    return <Navigate to={next} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home-shell auth-shell">
      <div className="auth-lang">
        <LanguageSwitcher compact />
      </div>
      <div className="home-center" style={{ maxWidth: 420 }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 18 }}>
          <div className="logo">H</div>HupHup
        </div>
        <h1 style={{ fontSize: 28 }}>{t('auth.login')}</h1>
        <form className="panel" onSubmit={onSubmit}>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="field">
              <label>{t('auth.email')}</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label>{t('auth.password')}</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                required
              />
            </div>
          </div>
          {error ? (
            <p className="notice" style={{ marginTop: 12, color: '#b45309' }}>
              {error}
            </p>
          ) : null}
          <div className="actions">
            <Link className="ghost" to={`/register${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`}>
              {t('auth.noAccount')}
            </Link>
            <button className="primary" disabled={busy}>
              {busy ? '...' : t('auth.signIn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
