import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api';
import { PasswordInput } from '../../components/PasswordInput';
import { AuthLayout } from './AuthLayout';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authApi.resetPassword({ token: token.trim(), newPassword: password });
      setDone(true);
      window.setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout mode="reset" title={t('auth.resetTitle')} lead={t('auth.resetLead')}>
      {done ? (
        <p className="hh-auth-hint">{t('auth.resetSuccess')}</p>
      ) : (
        <form className="hh-auth-form" onSubmit={onSubmit}>
          <div className="hh-auth-field">
            <label htmlFor="auth-token">{t('auth.resetToken')}</label>
            <input
              id="auth-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>
          <div className="hh-auth-field">
            <label>{t('auth.newPassword')}</label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              required
            />
          </div>
          {error ? <p className="hh-auth-error">{error}</p> : null}
          <button className="hh-auth-submit" disabled={busy}>
            {busy ? '…' : t('auth.resetSubmit')}
          </button>
        </form>
      )}
      <p className="hh-auth-foot">
        <Link to="/login">{t('common.back')}</Link>
      </p>
    </AuthLayout>
  );
}
