import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { companiesApi, notificationsApi, requestsApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { NotificationsBell } from '../components/NotificationsBell';
import { useMobileNav } from '../hooks/useMobileNav';
import type { CompanyMember, NotificationItem, RequestItem } from '../types';

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function LogoutButton() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="ghost"
      style={{ width: '100%', marginTop: 8 }}
      onClick={() => {
        logout();
        navigate('/login', { replace: true });
      }}
    >
      {t('common.logout')}
    </button>
  );
}

function MobileNavButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="mobile-menu-btn"
      aria-label={t('nav.openMenu')}
      onClick={onOpen}
    >
      ☰
    </button>
  );
}

function MobileNavClose({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="mobile-nav-close"
      aria-label={t('nav.closeMenu')}
      onClick={onClose}
    >
      ×
    </button>
  );
}

export function BuyerLayout({
  crumb,
  title,
  subtitle,
  fullWidth,
  actions,
  children,
}: {
  crumb: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  fullWidth?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { open, openNav, closeNav } = useMobileNav();
  const [recent, setRecent] = useState<RequestItem[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void requestsApi
      .list()
      .then((list) => setRecent(list.slice(0, 5)))
      .catch(() => setRecent([]));
    void notificationsApi
      .list()
      .then((list) => setUnread(list.filter((n) => !n.isRead).length))
      .catch(() => setUnread(0));
  }, []);

  return (
    <>
      <div className="mobile-top">
        <div className="mobile-top-start">
          <MobileNavButton onOpen={openNav} />
          <b className="mobile-brand">HupHup</b>
        </div>
        <Link className="mobile-top-link" to="/app">
          {t('nav.newShort')}
        </Link>
      </div>
      <div className={`layout${open ? ' mobile-nav-open' : ''}`}>
        <button
          type="button"
          className="mobile-overlay"
          aria-label={t('nav.closeMenu')}
          onClick={closeNav}
        />
        <aside className="sidebar">
          <div className="sidebar-head">
            <div className="brand">
              <div className="logo">H</div>HupHup
            </div>
            <MobileNavClose onClose={closeNav} />
          </div>
          <Link className="side-action" to="/app" onClick={closeNav}>
            {t('nav.newRequest')}
          </Link>
          <nav className="nav">
            <NavLink to="/app" end onClick={closeNav}>
              <span className="ico">⌂</span>
              {t('nav.home')}
            </NavLink>
            <NavLink to="/requests" onClick={closeNav}>
              <span className="ico">▤</span>
              {t('nav.myRequests')}
            </NavLink>
            <NavLink to="/offers" onClick={closeNav}>
              <span className="ico">◫</span>
              {t('nav.offers')}
            </NavLink>
            <NavLink to="/suppliers" onClick={closeNav}>
              <span className="ico">◉</span>
              {t('nav.suppliers')}
            </NavLink>
            <NavLink to="/conversations" onClick={closeNav}>
              <span className="ico">✉</span>
              {t('nav.chats')}
            </NavLink>
          </nav>
          <div className="side-label">{t('nav.recent')}</div>
          <div className="recent">
            {recent.length === 0 ? (
              <span className="meta" style={{ padding: '9px 11px', display: 'block' }}>
                {t('nav.noRecentRequests')}
              </span>
            ) : (
              recent.map((r) => (
                <Link key={r.id} to={`/requests/${r.id}`} onClick={closeNav}>
                  {r.title}
                </Link>
              ))
            )}
          </div>
          <div className="side-bottom">
            <Link className="user-card" to="/profile" onClick={closeNav}>
              <div className="avatar">{initials(user?.fullName ?? 'U')}</div>
              <div>
                <div className="user-name">{user?.fullName ?? t('common.empty')}</div>
                <div className="user-role">
                  {t('nav.buyer')}
                  {unread > 0 ? ` · ${t('common.unreadShort', { count: unread })}` : ''}
                </div>
              </div>
            </Link>
            <LogoutButton />
          </div>
        </aside>
        <main className={`main${fullWidth ? ' main-full' : ''}`}>
          <div className={`topbar${title ? ' topbar-page' : ''}`}>
            {title ? (
              <div className="topbar-head">
                <h1>{title}</h1>
                {subtitle ? <p>{subtitle}</p> : null}
              </div>
            ) : (
              <div className="crumb">{crumb}</div>
            )}
            <div className="top-actions">
              {actions}
              <NotificationsBell />
              <LanguageSwitcher />
              <Link className="ghost mode-switch" to="/supplier">
                <span className="mode-long">{t('nav.supplierMode')}</span>
                <span className="mode-short">{t('nav.supplierShort')}</span>
              </Link>
            </div>
          </div>
          {children}
        </main>
      </div>
    </>
  );
}

export function SupplierLayout({
  crumb,
  title,
  subtitle,
  fullWidth,
  actions,
  children,
}: {
  crumb: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  fullWidth?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { open, openNav, closeNav } = useMobileNav();
  const [companyName, setCompanyName] = useState(
    user?.company?.name ?? user?.fullName ?? t('nav.supplier'),
  );
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    void companiesApi
      .me()
      .then((c) => {
        setCompanyName(c.name);
        setMembers(c.members ?? []);
      })
      .catch(() => {
        setCompanyName(user?.fullName ?? t('nav.supplier'));
        setMembers([]);
      });
    void notificationsApi
      .list()
      .then(setNotifications)
      .catch(() => setNotifications([]));
  }, [user?.fullName, t]);

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <>
      <div className="mobile-top">
        <div className="mobile-top-start">
          <MobileNavButton onOpen={openNav} />
          <b className="mobile-brand">HupHup</b>
        </div>
        <Link className="mobile-top-link" to="/supplier/leads">
          {t('nav.newLeads')}
        </Link>
      </div>
      <div className={`layout${open ? ' mobile-nav-open' : ''}`}>
        <button
          type="button"
          className="mobile-overlay"
          aria-label={t('nav.closeMenu')}
          onClick={closeNav}
        />
        <aside className="sidebar">
          <div className="sidebar-head">
            <div className="brand">
              <div className="logo">H</div>HupHup
            </div>
            <MobileNavClose onClose={closeNav} />
          </div>
          <Link className="side-action" to="/supplier/leads" onClick={closeNav}>
            {t('nav.findLeads')}
          </Link>
          <nav className="nav">
            <NavLink to="/supplier" end onClick={closeNav}>
              ▦ {t('nav.crm')}
            </NavLink>
            <NavLink to="/supplier/products" onClick={closeNav}>
              ◈ {t('nav.products')}
            </NavLink>
            <NavLink to="/supplier/leads" onClick={closeNav}>
              ◫ {t('nav.newLeads')}
            </NavLink>
            <NavLink to="/supplier/company" onClick={closeNav}>
              ◉ {t('nav.company')}
            </NavLink>
            <NavLink to="/supplier/team" onClick={closeNav}>
              ▤ {t('nav.team')}
            </NavLink>
            <NavLink to="/conversations" onClick={closeNav}>
              ✉ {t('nav.chats')}
            </NavLink>
          </nav>
          <div className="side-label">
            <Link to="/supplier/team" onClick={closeNav} style={{ color: 'inherit' }}>
              {t('nav.team')}
            </Link>
          </div>
          <div className="recent">
            {members.length === 0 ? (
              <span className="meta" style={{ padding: '9px 11px', display: 'block' }}>
                {t('nav.noTeamMembers')}
              </span>
            ) : (
              members.map((m) => (
                <Link
                  key={m.id}
                  to="/supplier/team"
                  onClick={closeNav}
                  style={{ padding: '9px 11px', display: 'block', fontSize: 13 }}
                >
                  {m.user.fullName}
                  {m.title ? ` · ${m.title}` : ''}
                </Link>
              ))
            )}
          </div>
          <div className="side-bottom">
            <Link className="user-card" to="/supplier/company" onClick={closeNav}>
              <div className="avatar">{initials(companyName)}</div>
              <div>
                <div className="user-name">{companyName}</div>
                <div className="user-role">
                  {t('nav.supplier')}
                  {unread > 0 ? ` · ${t('common.unreadShort', { count: unread })}` : ''}
                </div>
              </div>
            </Link>
            <LogoutButton />
          </div>
        </aside>
        <main className={`main${fullWidth ? ' main-full' : ''}`}>
          <div className={`topbar${title ? ' topbar-page' : ''}`}>
            {title ? (
              <div className="topbar-head">
                <h1>{title}</h1>
                {subtitle ? <p>{subtitle}</p> : null}
              </div>
            ) : (
              <div className="crumb">{crumb}</div>
            )}
            <div className="top-actions">
              {actions}
              <NotificationsBell />
              <LanguageSwitcher />
              <Link className="ghost mode-switch" to="/app">
                <span className="mode-long">{t('nav.buyerMode')}</span>
                <span className="mode-short">{t('nav.buyerShort')}</span>
              </Link>
            </div>
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
