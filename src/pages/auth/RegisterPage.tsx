import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { PasswordInput } from '../../components/PasswordInput';
import { mapApiError } from '../../utils/apiErrors';
import { AuthLayout } from './AuthLayout';

export function RegisterPage() {
  const { t } = useTranslation();
  const { user, register, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/app';
  const [role, setRole] = useState<'BUYER' | 'SUPPLIER'>(
    params.get('role') === 'SUPPLIER' ? 'SUPPLIER' : 'BUYER',
  );
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.role === 'SUPPLIER' ? '/supplier' : next} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register({ email, password, fullName, role });
      navigate(role === 'SUPPLIER' ? '/supplier' : next);
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout mode="register" title={t('auth.register')} lead={t('auth.registerLead')}>
      <form className="hh-auth-form" onSubmit={onSubmit}>
        <div className="hh-auth-roles" role="radiogroup" aria-label={t('auth.roleLabel')}>
          <button
            type="button"
            role="radio"
            aria-checked={role === 'BUYER'}
            className={`hh-auth-role-card${role === 'BUYER' ? ' is-on' : ''}`}
            onClick={() => setRole('BUYER')}
          >
            <b>{t('auth.roleBuyer')}</b>
            <span>{t('auth.roleBuyerHint')}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={role === 'SUPPLIER'}
            className={`hh-auth-role-card${role === 'SUPPLIER' ? ' is-on' : ''}`}
            onClick={() => setRole('SUPPLIER')}
          >
            <b>{t('auth.roleSupplier')}</b>
            <span>{t('auth.roleSupplierHint')}</span>
          </button>
        </div>
        <div className="hh-auth-row">
          <div className="hh-auth-field">
            <label htmlFor="auth-name">{t('auth.nameOrCompany')}</label>
            <input
              id="auth-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
          <div className="hh-auth-field">
            <label htmlFor="auth-email">{t('auth.email')}</label>
            <input
              id="auth-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
            />
          </div>
        </div>
        <div className="hh-auth-field">
          <label htmlFor="auth-password">{t('auth.password')}</label>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <p className="hh-auth-hint">{t('auth.registerHint')}</p>
        {error ? <p className="hh-auth-error">{error}</p> : null}
        <button className="hh-auth-submit" disabled={busy}>
          {busy ? '…' : t('auth.signUp')}
        </button>
      </form>
      <p className="hh-auth-foot">
        {t('auth.hasAccount')}
        <Link to={`/login${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`}>
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
