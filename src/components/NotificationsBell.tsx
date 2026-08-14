import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { notificationsApi } from '../api';
import { useAppLocale } from '../i18n/useAppLocale';
import { useWorkspaceMode } from '../hooks/useWorkspaceMode';
import { getNotificationHref } from '../utils/notificationNavigation';
import type { NotificationItem } from '../types';

export function NotificationsBell() {
  const { t } = useTranslation();
  const { formatDateTime } = useAppLocale();
  const { mode } = useWorkspaceMode();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.isRead).length;

  async function refresh() {
    try {
      const list = await notificationsApi.list();
      setItems(list);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    void refresh();
    function refreshOnVisible() {
      if (document.visibilityState === 'visible') void refresh();
    }
    const timer = window.setInterval(refreshOnVisible, 30000);
    window.addEventListener('focus', refreshOnVisible);
    document.addEventListener('visibilitychange', refreshOnVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshOnVisible);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function onItemClick(n: NotificationItem) {
    if (!n.isRead) {
      await notificationsApi.read(n.id).catch(() => undefined);
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
      );
    }
    const href = getNotificationHref(n, mode);
    setOpen(false);
    if (href) navigate(href);
  }

  return (
    <div className="notif-bell" ref={rootRef}>
      <button
        type="button"
        className="notif-bell-btn"
        aria-label={t('notifications.bell')}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 ? (
          <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>
        ) : null}
      </button>
      {open ? (
        <div className="notif-dropdown">
          <div className="notif-dropdown-head">
            <b>{t('notifications.title')}</b>
            {unread > 0 ? (
              <span className="notif-unread-label">
                {t('common.unreadShort', { count: unread })}
              </span>
            ) : null}
          </div>
          <div className="notif-list">
            {items.length === 0 ? (
              <p className="notif-empty">{t('notifications.empty')}</p>
            ) : (
              items.slice(0, 8).map((n) => {
                const href = getNotificationHref(n, mode);
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif-item${n.isRead ? '' : ' is-unread'}`}
                    onClick={() => void onItemClick(n)}
                  >
                    <div className="notif-item-top">
                      <b>{n.title}</b>
                      <small>{formatDateTime(n.createdAt)}</small>
                    </div>
                    {n.body ? <p>{n.body}</p> : null}
                    {href ? (
                      <span className="notif-item-link">{t('notifications.open')}</span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          <Link className="notif-view-all" to="/profile" onClick={() => setOpen(false)}>
            {t('notifications.viewAll')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
