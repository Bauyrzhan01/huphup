import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { PasswordInput } from '../../components/PasswordInput';

export function RegisterPage() {
  const { t } = useTranslation();
  const { user, register, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/app';
  const [fullName, setFullName] = useState('');
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
      await register({ email, password, fullName });
      navigate(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.registerError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home-shell auth-shell">
      <div className="auth-lang">
        <LanguageSwitcher compact />
      </div>
      <div className="home-center" style={{ maxWidth: 480 }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 18 }}>
          <div className="logo">H</div>HupHup
        </div>
        <h1 style={{ fontSize: 28 }}>{t('auth.register')}</h1>
        <form className="panel" onSubmit={onSubmit}>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="field">
              <label>{t('auth.nameOrCompany')}</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="field">
              <label>{t('auth.email')}</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
              />
            </div>
            <div className="field">
              <label>{t('auth.password')}</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>
          <p className="assist-note" style={{ textAlign: 'left', marginTop: 12 }}>
            {t('auth.registerHint')}
          </p>
          {error ? (
            <p className="notice" style={{ marginTop: 12, color: '#b45309' }}>
              {error}
            </p>
          ) : null}
          <div className="actions">
            <Link className="ghost" to={`/login${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`}>
              {t('auth.hasAccount')}
            </Link>
            <button className="primary" disabled={busy}>
              {busy ? '...' : t('auth.signUp')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
