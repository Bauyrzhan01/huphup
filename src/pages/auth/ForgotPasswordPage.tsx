import { useState, type FormEvent } from 'react';

import { Link, useNavigate } from 'react-router-dom';

import { useTranslation } from 'react-i18next';

import { authApi } from '../../api';

import { LanguageSwitcher } from '../../components/LanguageSwitcher';



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

      if (res.resetToken) {

        setResetToken(res.resetToken);

      }

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

        <h1 style={{ fontSize: 28 }}>{t('auth.forgotTitle')}</h1>

        <p className="meta">{t('auth.forgotHint')}</p>

        <form className="panel" onSubmit={onSubmit}>

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

          {error ? (

            <p className="notice" style={{ marginTop: 12, color: '#b45309' }}>

              {error}

            </p>

          ) : null}

          {resetToken ? (

            <div className="notice" style={{ marginTop: 12 }}>

              <p>{t('auth.resetTokenDev')}</p>

              <code style={{ wordBreak: 'break-all' }}>{resetToken}</code>

              <div className="actions" style={{ marginTop: 12 }}>

                <button

                  type="button"

                  className="primary"

                  onClick={() =>

                    navigate(`/reset-password?token=${encodeURIComponent(resetToken)}`)

                  }

                >

                  {t('auth.goReset')}

                </button>

              </div>

            </div>

          ) : null}

          <div className="actions">

            <Link className="ghost" to="/login">

              {t('common.back')}

            </Link>

            <button className="primary" disabled={busy}>

              {busy ? '...' : t('auth.sendReset')}

            </button>

          </div>

        </form>

      </div>

    </div>

  );

}

