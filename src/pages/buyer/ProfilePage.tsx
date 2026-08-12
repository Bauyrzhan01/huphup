import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { notificationsApi, usersApi } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { PasswordInput } from '../../components/PasswordInput';
import { BuyerLayout } from '../../layouts/AppLayouts';
import { useAppLocale, useRoleLabel } from '../../i18n/useAppLocale';
import type { NotificationItem } from '../../types';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function coverTone(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const tones = [
    'linear-gradient(135deg,#111 0%,#2d2d2d 48%,#0f8a68 140%)',
    'linear-gradient(135deg,#1a1a1a 0%,#334 55%,#087a5e 130%)',
    'linear-gradient(145deg,#0c0c0c 0%,#222 50%,#145c4a 125%)',
    'linear-gradient(135deg,#171717 0%,#2a2a2a 45%,#1b6b55 135%)',
  ];
  return tones[hash % tones.length];
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();
  const roleLabel = useRoleLabel();
  const { user, refresh } = useAuth();
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

  const unread = notifications.filter((n) => !n.isRead).length;
  const displayName = fullName || user?.fullName || 'U';
  const cover = useMemo(
    () => coverTone(user?.id || displayName),
    [user?.id, displayName],
  );

  return (
    <BuyerLayout crumb={t('profile.title')}>
      <div className="page account-profile-page">
        <section className="supplier-profile-hero">
          <div className="supplier-profile-cover" style={{ background: cover }} aria-hidden>
            <div className="supplier-profile-cover-pattern" />
          </div>
          <div className="supplier-profile-hero-body">
            <div className="supplier-profile-identity">
              <div className="supplier-profile-avatar">{initials(displayName)}</div>
              <div className="supplier-profile-title">
                <div className="supplier-profile-name-row">
                  <h1>{displayName}</h1>
                  {user?.role ? (
                    <span className="account-profile-role">{roleLabel(user.role)}</span>
                  ) : null}
                </div>
                <p className="supplier-profile-sub">
                  {[user?.email, user?.company?.name || user?.company?.city]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
            <div className="supplier-profile-actions">
              {user?.role === 'SUPPLIER' || user?.company ? (
                <Link className="ghost" to="/supplier/company">
                  {t('profile.goCompany')}
                </Link>
              ) : null}
              <Link className="primary" to="/app">
                {t('common.home')}
              </Link>
            </div>
          </div>
        </section>

        <div className="supplier-profile-stats">
          <div className="supplier-profile-stat">
            <small>{t('profile.statRole')}</small>
            <b>{user?.role ? roleLabel(user.role) : '—'}</b>
          </div>
          <div className="supplier-profile-stat">
            <small>{t('profile.statCompany')}</small>
            <b>{user?.company?.name || t('profile.noCompany')}</b>
          </div>
          <div className="supplier-profile-stat">
            <small>{t('profile.statNotifications')}</small>
            <b>{notifications.length}</b>
          </div>
          <div className="supplier-profile-stat">
            <small>{t('profile.statUnread')}</small>
            <b>{unread}</b>
          </div>
        </div>

        <div className="account-profile-layout">
          <form className="panel account-profile-card" onSubmit={onSubmit}>
            <h2 className="section-title">{t('profile.personalData')}</h2>
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
                <input
                  value={user?.email ?? ''}
                  readOnly
                  disabled
                  className="input-readonly"
                />
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

          <form className="panel account-profile-card" onSubmit={onChangePassword}>
            <h2 className="section-title">{t('profile.changePassword')}</h2>
            <p className="meta account-profile-hint">{t('profile.passwordHint')}</p>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
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
        </div>

        <section className="panel account-profile-notifications">
          <div className="account-profile-notif-head">
            <h2 className="section-title">
              {t('profile.notifications', { count: notifications.length })}
            </h2>
            {unread > 0 ? (
              <span className="account-profile-unread">
                {t('common.unreadShort', { count: unread })}
              </span>
            ) : null}
          </div>
          <div className="account-notif-list">
            {notifications.length === 0 ? (
              <div className="account-notif-empty">
                <b>{t('profile.noNotifications')}</b>
                <p>{t('profile.noNotificationsHint')}</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`account-notif-item${n.isRead ? '' : ' is-unread'}`}
                  onClick={() =>
                    void notificationsApi.read(n.id).then(() =>
                      setNotifications((prev) =>
                        prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
                      ),
                    )
                  }
                >
                  <div className="account-notif-body">
                    <b>{n.title}</b>
                    <span>
                      {n.body || n.type} · {formatDateTime(n.createdAt)}
                    </span>
                  </div>
                  <span className={`badge ${n.isRead ? 'blue' : 'green'}`}>
                    {n.isRead ? t('profile.read') : t('profile.new')}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </BuyerLayout>
  );
}
