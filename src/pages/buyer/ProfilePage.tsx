import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { notificationsApi, usersApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { PasswordInput } from '../../components/PasswordInput';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { useAppLocale, useRoleLabel } from '../../i18n/useAppLocale';
import type { NotificationItem } from '../../types';

export function ProfilePage() {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();
  const roleLabel = useRoleLabel();
  const { user, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    void notificationsApi.list().then(setNotifications).catch(() => setNotifications([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName);
    setPhone(user.phone ?? '');
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setSaving(true);
    try {
      await usersApi.updateMe({
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
      });
      await refresh();
      setMsg(t('profile.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwdError('');
    setPwdMsg('');
    setPwdSaving(true);
    try {
      await usersApi.changePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setPwdMsg(t('profile.passwordSaved'));
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPwdSaving(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const subtitle = [
    user?.role ? roleLabel(user.role) : null,
    user?.company?.city ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <BuyerLayout crumb={t('profile.title')}>
      <div className="page narrow">
        <div className="profile-hero">
          <div className="avatar">
            {(fullName || user?.fullName || 'U')
              .split(' ')
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{fullName || user?.fullName}</h2>
            <p>{subtitle || user?.email}</p>
          </div>
        </div>

        <form className="panel" onSubmit={onSubmit}>
          <div className="section-title">{t('profile.personalData')}</div>
          <div className="form-grid">
            <div className="field">
              <label>{t('profile.fullName')}</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="field">
              <label>{t('profile.phone')}</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                placeholder="+7 700 000 00 00"
                autoComplete="tel"
              />
            </div>
            <div className="field">
              <label>{t('profile.email')}</label>
              <input value={user?.email ?? ''} readOnly disabled className="input-readonly" />
            </div>
            <div className="field">
              <label>{t('profile.role')}</label>
              <input
                value={user?.role ? roleLabel(user.role) : t('common.empty')}
                readOnly
                disabled
                className="input-readonly"
              />
            </div>
            <div className="field full">
              <label>{t('profile.company')}</label>
              <input
                value={user?.company?.name ?? t('profile.noCompany')}
                readOnly
                disabled
                className="input-readonly"
              />
            </div>
          </div>
          {error ? (
            <p className="notice" style={{ marginTop: 12, color: '#b45309' }}>
              {error}
            </p>
          ) : null}
          {msg ? <p className="notice" style={{ marginTop: 12 }}>{msg}</p> : null}
          <div className="actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? t('profile.saving') : t('common.save')}
            </button>
          </div>
        </form>

        <form className="panel" style={{ marginTop: 18 }} onSubmit={onChangePassword}>
          <div className="section-title">{t('profile.changePassword')}</div>
          <div className="form-grid">
            <div className="field">
              <label>{t('profile.currentPassword')}</label>
              <PasswordInput
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="field">
              <label>{t('profile.newPassword')}</label>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                required
              />
            </div>
          </div>
          {pwdError ? (
            <p className="notice" style={{ marginTop: 12, color: '#b45309' }}>
              {pwdError}
            </p>
          ) : null}
          {pwdMsg ? <p className="notice" style={{ marginTop: 12 }}>{pwdMsg}</p> : null}
          <div className="actions">
            <button type="submit" className="primary" disabled={pwdSaving}>
              {pwdSaving ? t('profile.saving') : t('profile.updatePassword')}
            </button>
          </div>
        </form>

        <h3 className="section-title" style={{ marginTop: 22 }}>
          {t('profile.notifications', { count: notifications.length })}
        </h3>
        <div className="card request-list">
          {notifications.length === 0 ? (
            <div className="request-item">
              <div className="request-title">{t('profile.noNotifications')}</div>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                className="request-item"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() =>
                  void notificationsApi.read(n.id).then(() =>
                    setNotifications((prev) =>
                      prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
                    ),
                  )
                }
              >
                <div>
                  <div className="request-title">{n.title}</div>
                  <div className="meta">
                    {n.body || n.type} · {formatDateTime(n.createdAt)}
                  </div>
                </div>
                <span className={`badge ${n.isRead ? 'blue' : 'green'}`}>
                  {n.isRead ? t('profile.read') : t('profile.new')}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="panel profile-account" style={{ marginTop: 18 }}>
          <div className="section-title">{t('profile.account')}</div>
          <p className="meta" style={{ margin: '0 0 14px' }}>
            {t('profile.logoutHint')}
          </p>
          <div className="actions" style={{ marginTop: 0 }}>
            <Link className="ghost" to="/app">
              {t('common.home')}
            </Link>
            <button type="button" className="ghost" onClick={handleLogout}>
              {t('common.logout')}
            </button>
          </div>
        </div>
      </div>
    </BuyerLayout>
  );
}
