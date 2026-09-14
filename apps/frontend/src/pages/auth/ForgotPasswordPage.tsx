import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api';
import { AuthLayout } from './AuthLayout';
import { mapApiError } from '../../utils/apiErrors';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetToken, setResetToken] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResetToken('');
    try {
      const res = await authApi.forgotPassword(email.trim());
      if (res.resetToken) setResetToken(res.resetToken);
    } catch (err) {
      setError(mapApiError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout mode="forgot" title={t('auth.forgotTitle')} lead={t('auth.forgotHint')}>
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
        {error ? <p className="hh-auth-error">{error}</p> : null}
        {resetToken ? (
          <div className="hh-auth-hint">
            <p>{t('auth.resetTokenDev')}</p>
            <code style={{ wordBreak: 'break-all' }}>{resetToken}</code>
            <button
              type="button"
              className="hh-auth-submit"
              style={{ marginTop: 12 }}
              onClick={() =>
                navigate(`/reset-password?token=${encodeURIComponent(resetToken)}`)
              }
            >
              {t('auth.goReset')}
            </button>
          </div>
        ) : null}
        <button className="hh-auth-submit" disabled={busy}>
          {busy ? '…' : t('auth.sendReset')}
        </button>
      </form>
      <p className="hh-auth-foot">
        <Link to="/login">{t('common.back')}</Link>
      </p>
    </AuthLayout>
  );
}
