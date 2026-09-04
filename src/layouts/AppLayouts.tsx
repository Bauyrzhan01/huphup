import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  ClipboardList,
  FileCheck,
  Home,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  ListTodo,
  Menu,
  MessageSquare,
  Package,
  Store,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { companiesApi, notificationsApi, requestsApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import { NotificationsBell } from '../components/NotificationsBell';
import { PresenceDot } from '../components/PresenceDot';
import { RecentRequestRow } from '../components/RecentRequestRow';
import { UserAvatar } from '../components/UserAvatar';
import { useMobileNav } from '../hooks/useMobileNav';
import type { CompanyMember, NotificationItem, RequestItem } from '../types';

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

function SessionUserChip({
  roleLabel,
  extra,
}: {
  roleLabel: string;
  extra?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const name = user?.fullName?.trim() || user?.email || t('common.empty');
  const line = extra ? `${roleLabel} · ${extra}` : roleLabel;

  return (
    <Link className="top-user" to="/profile" title={name}>
      <UserAvatar
        name={name}
        avatarUrl={user?.avatarUrl}
        className="top-user-avatar"
      />
      <span className="top-user-copy">
        <span className="top-user-name">{name}</span>
        <span className="top-user-role">{line}</span>
      </span>
    </Link>
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
      <AppIcon icon={Menu} className="ico" size={20} />
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
      <AppIcon icon={X} className="ico" size={20} />
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

  function loadRecent() {
    void requestsApi
      .list()
      .then((list) => setRecent(list.slice(0, 8)))
      .catch(() => setRecent([]));
  }

  useEffect(() => {
    loadRecent();
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
          <Link className="mobile-brand" to="/app" aria-label={t('nav.home')}>
            HupHup
          </Link>
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
            <Link className="brand" to="/app" aria-label={t('nav.home')} onClick={closeNav}>
              <div className="logo">H</div>HupHup
            </Link>
            <MobileNavClose onClose={closeNav} />
          </div>
          <Link className="side-action" to="/app" onClick={closeNav}>
            {t('nav.newRequest')}
          </Link>
          <nav className="nav">
            <NavLink to="/app" end onClick={closeNav}>
              <AppIcon icon={Home} className="ico" />
              {t('nav.home')}
            </NavLink>
            <NavLink to="/requests" onClick={closeNav}>
              <AppIcon icon={ClipboardList} className="ico" />
              {t('nav.myRequests')}
            </NavLink>
            <NavLink to="/offers" onClick={closeNav}>
              <AppIcon icon={FileCheck} className="ico" />
              {t('nav.offers')}
            </NavLink>
            <NavLink to="/suppliers" onClick={closeNav}>
              <AppIcon icon={Store} className="ico" />
              {t('nav.suppliers')}
            </NavLink>
            <NavLink to="/balance" onClick={closeNav}>
              <AppIcon icon={Wallet} className="ico" />
              {t('nav.balance')}
            </NavLink>
            <NavLink to="/conversations?workspace=buyer" onClick={closeNav}>
              <AppIcon icon={MessageSquare} className="ico" />
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
                <RecentRequestRow
                  key={r.id}
                  request={r}
                  onCloseNav={closeNav}
                  onChanged={loadRecent}
                  onHidden={(id) => setRecent((prev) => prev.filter((item) => item.id !== id))}
                />
              ))
            )}
          </div>
          <div className="side-bottom">
            <Link className="user-card side-team-member" to="/profile" onClick={closeNav}>
              <UserAvatar
                name={user?.fullName ?? 'U'}
                avatarUrl={user?.avatarUrl}
                className="side-team-avatar"
              />
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
              <div className="top-actions-main">
                {actions}
                <Link className="ghost mode-switch" to="/supplier">
                  <span className="mode-long">{t('nav.supplierMode')}</span>
                  <span className="mode-short">{t('nav.supplierShort')}</span>
                </Link>
                <SessionUserChip roleLabel={t('nav.buyer')} />
              </div>
              <NotificationsBell />
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

    const timer = window.setInterval(() => {
      void companiesApi
        .me()
        .then((c) => setMembers(c.members ?? []))
        .catch(() => undefined);
    }, 40_000);
    return () => window.clearInterval(timer);
  }, [user?.fullName, t]);

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <>
      <div className="mobile-top">
        <div className="mobile-top-start">
          <MobileNavButton onOpen={openNav} />
          <Link className="mobile-brand" to="/supplier" aria-label={t('nav.home')}>
            HupHup
          </Link>
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
            <Link className="brand" to="/supplier" aria-label={t('nav.home')} onClick={closeNav}>
              <div className="logo">H</div>HupHup
            </Link>
            <MobileNavClose onClose={closeNav} />
          </div>
          <Link className="side-action" to="/supplier/leads" onClick={closeNav}>
            {t('nav.findLeads')}
          </Link>
          <nav className="nav">
            <NavLink to="/supplier" end onClick={closeNav}>
              <AppIcon icon={LayoutDashboard} className="ico" />
              {t('nav.dashboard')}
            </NavLink>
            <NavLink to="/supplier/deals" onClick={closeNav}>
              <AppIcon icon={LayoutGrid} className="ico" />
              {t('nav.crm')}
            </NavLink>
            <NavLink to="/supplier/tasks" onClick={closeNav}>
              <AppIcon icon={ListTodo} className="ico" />
              {t('nav.tasks')}
            </NavLink>
            <NavLink to="/supplier/products" onClick={closeNav}>
              <AppIcon icon={Package} className="ico" />
              {t('nav.products')}
            </NavLink>
            <NavLink to="/supplier/offers" onClick={closeNav}>
              <AppIcon icon={FileCheck} className="ico" />
              {t('supplier.myOffers')}
            </NavLink>
            <NavLink to="/supplier/leads" onClick={closeNav}>
              <AppIcon icon={Inbox} className="ico" />
              {t('nav.newLeads')}
            </NavLink>
            <NavLink to="/supplier/company" onClick={closeNav}>
              <AppIcon icon={Building2} className="ico" />
              {t('nav.company')}
            </NavLink>
            <NavLink to="/supplier/team" onClick={closeNav}>
              <AppIcon icon={Users} className="ico" />
              {t('nav.team')}
            </NavLink>
            <NavLink to="/balance" onClick={closeNav}>
              <AppIcon icon={Wallet} className="ico" />
              {t('nav.balance')}
            </NavLink>
            <NavLink to="/conversations?workspace=supplier" onClick={closeNav}>
              <AppIcon icon={MessageSquare} className="ico" />
              {t('nav.chats')}
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
                  className="side-team-member"
                >
                  <span className="side-team-avatar-wrap">
                    <UserAvatar
                      name={m.user.fullName}
                      avatarUrl={m.user.avatarUrl}
                      className="side-team-avatar"
                    />
                    <PresenceDot lastSeenAt={m.user.lastSeenAt} />
                  </span>
                  <span className="side-team-name">
                    {m.user.fullName}
                    {m.title ? ` · ${m.title}` : ''}
                  </span>
                </Link>
              ))
            )}
          </div>
          <div className="side-bottom">
            <Link className="user-card side-team-member" to="/profile" onClick={closeNav}>
              <UserAvatar
                name={user?.fullName ?? companyName}
                avatarUrl={user?.avatarUrl}
                className="side-team-avatar"
              />
              <div>
                <div className="user-name">{user?.fullName ?? companyName}</div>
                <div className="user-role">
                  {companyName}
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
              <div className="top-actions-main">
                {actions}
                <Link className="ghost mode-switch" to="/app">
                  <span className="mode-long">{t('nav.buyerMode')}</span>
                  <span className="mode-short">{t('nav.buyerShort')}</span>
                </Link>
                <SessionUserChip
                  roleLabel={t('nav.supplier')}
                  extra={companyName !== user?.fullName ? companyName : undefined}
                />
              </div>
              <NotificationsBell />
            </div>
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
