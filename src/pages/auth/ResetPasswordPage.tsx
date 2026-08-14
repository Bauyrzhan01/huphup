import { useState, type FormEvent } from 'react';

import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useTranslation } from 'react-i18next';

import { authApi } from '../../api';

import { LanguageSwitcher } from '../../components/LanguageSwitcher';

import { PasswordInput } from '../../components/PasswordInput';



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

    <div className="home-shell auth-shell">

      <div className="auth-lang">

        <LanguageSwitcher compact />

      </div>

      <div className="home-center" style={{ maxWidth: 420 }}>

        <h1 style={{ fontSize: 28 }}>{t('auth.resetTitle')}</h1>

        {done ? (

          <p className="notice">{t('auth.resetSuccess')}</p>

        ) : (

          <form className="panel" onSubmit={onSubmit}>

            <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>

              <div className="field">

                <label>{t('auth.resetToken')}</label>

                <input

                  value={token}

                  onChange={(e) => setToken(e.target.value)}

                  required

                />

              </div>

              <div className="field">

                <label>{t('auth.newPassword')}</label>

                <PasswordInput

                  value={password}

                  onChange={setPassword}

                  autoComplete="new-password"

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

              <Link className="ghost" to="/login">

                {t('common.back')}

              </Link>

              <button className="primary" disabled={busy}>

                {busy ? '...' : t('auth.resetSubmit')}

              </button>

            </div>

          </form>

        )}

      </div>

    </div>

  );

}

