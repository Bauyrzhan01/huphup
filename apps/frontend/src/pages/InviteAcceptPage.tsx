import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { invitesApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import type { InvitePreview } from '../types';

export function InviteAcceptPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const { user, loading: authLoading, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    void invitesApi
      .get(token)
      .then(setInvite)
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('common.error')),
      )
      .finally(() => setLoading(false));
  }, [token, t]);

  async function accept() {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await invitesApi.accept(token);
      await refresh();
      setDone(true);
      navigate('/supplier', { replace: true });
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
      <div className="home-center" style={{ maxWidth: 480 }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 18 }}>
          <div className="logo">H</div>HupHup
        </div>
        <h1 style={{ fontSize: 28 }}>{t('team.invitePageTitle')}</h1>

        {loading || authLoading ? (
          <p className="assist-note">{t('common.loading')}</p>
        ) : (
          <div className="panel">
            {invite ? (
              <>
                <div className="kv">
                  <span>{t('team.inviteCompany')}</span>
                  <b>{invite.company.name}</b>
                </div>
                {invite.email ? (
                  <div className="kv">
                    <span>{t('team.inviteEmail')}</span>
                    <b>{invite.email}</b>
                  </div>
                ) : null}
                {invite.title ? (
                  <div className="kv">
                    <span>{t('team.inviteJobTitle')}</span>
                    <b>{invite.title}</b>
                  </div>
                ) : null}
                {invite.company.city ? (
                  <div className="kv">
                    <span>{t('supplier.companyCity')}</span>
                    <b>{invite.company.city}</b>
                  </div>
                ) : null}
                <div className="kv">
                  <span>{t('team.inviteExpires')}</span>
                  <b>{new Date(invite.expiresAt).toLocaleString()}</b>
                </div>
                {!invite.valid ? (
                  <p className="notice" style={{ marginTop: 12, color: '#b45309' }}>
                    {invite.used
                      ? t('team.inviteUsed')
                      : invite.expired
                        ? t('team.inviteExpired')
                        : t('team.inviteInvalid')}
                  </p>
                ) : null}
              </>
            ) : null}

            {error ? (
              <p className="notice" style={{ marginTop: 12, color: '#b45309' }}>
                {error}
              </p>
            ) : null}
            {user && invite?.email && user.email.toLowerCase() !== invite.email.toLowerCase() ? (
              <p className="notice" style={{ marginTop: 12, color: '#b45309' }}>
                {t('team.inviteWrongEmail', { email: invite.email })}
              </p>
            ) : null}

            <div className="actions">
              {!user ? (
                <>
                  <Link
                    className="ghost"
                    to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
                  >
                    {t('auth.signIn')}
                  </Link>
                  <Link
                    className="primary"
                    to={`/register?next=${encodeURIComponent(`/invite/${token}`)}${
                      invite?.email ? `&email=${encodeURIComponent(invite.email)}` : ''
                    }`}
                  >
                    {t('auth.signUp')}
                  </Link>
                </>
              ) : invite?.valid &&
                !done &&
                (!invite.email || user.email.toLowerCase() === invite.email.toLowerCase()) ? (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void accept()}
                >
                  {busy ? t('common.loading') : t('team.acceptInvite')}
                </button>
              ) : user &&
                invite?.email &&
                user.email.toLowerCase() !== invite.email.toLowerCase() ? (
                <button type="button" className="ghost" onClick={() => logout()}>
                  {t('common.logout')}
                </button>
              ) : user ? (
                <Link className="primary" to="/supplier">
                  {t('nav.crm')}
                </Link>
              ) : null}
            </div>
            <p className="assist-note" style={{ textAlign: 'left', marginTop: 12 }}>
              {t('team.invitePageHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
