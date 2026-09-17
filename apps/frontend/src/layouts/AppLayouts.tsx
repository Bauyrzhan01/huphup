import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  FileCheck,
  Home,
  Menu,
  MessageSquare,
  Store,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { companiesApi, notificationsApi, requestsApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import { NotificationsBell } from '../components/NotificationsBell';
import { RecentRequestRow } from '../components/RecentRequestRow';
import { UserAvatar } from '../components/UserAvatar';
import { useMobileNav } from '../hooks/useMobileNav';
import type { RequestItem } from '../types';
import {
  SUPPLIER_SECTIONS,
  findSupplierTabSection,
  isSupplierSectionActive,
  pathOf,
} from './supplierNav';

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
            <NavLink to="/deals?workspace=buyer" onClick={closeNav}>
              <AppIcon icon={ShieldCheck} className="ico" />
              {t('nav.deals')}
            </NavLink>
            <NavLink to="/balance?workspace=buyer" onClick={closeNav}>
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

function SupplierSectionTabs({ pathname }: { pathname: string }) {
  const { t } = useTranslation();
  const section = findSupplierTabSection(pathname);
  if (!section?.tabs) return null;
  return (
    <nav className="section-tabs" aria-label={t(section.label)}>
      {section.tabs.map((tab) => {
        const active = pathOf(tab.to) === pathname;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`section-tab${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {t(tab.label)}
          </Link>
        );
      })}
    </nav>
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
  const { pathname } = useLocation();
  const { open, openNav, closeNav } = useMobileNav();
  const [companyName, setCompanyName] = useState(
    user?.company?.name ?? user?.fullName ?? t('nav.supplier'),
  );
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void companiesApi
      .me()
      .then((c) => setCompanyName(c.name))
      .catch(() => setCompanyName(user?.fullName ?? t('nav.supplier')));
    void notificationsApi
      .list()
      .then((list) => setUnread(list.filter((n) => !n.isRead).length))
      .catch(() => setUnread(0));
  }, [user?.fullName, t]);

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
          {t('nav.requests')}
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
          <nav className="nav">
            {SUPPLIER_SECTIONS.map((section) => {
              const active = isSupplierSectionActive(section, pathname);
              return (
                <Link
                  key={section.to}
                  to={section.to}
                  onClick={closeNav}
                  className={active ? 'active' : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  <AppIcon icon={section.icon} className="ico" />
                  {t(section.label)}
                </Link>
              );
            })}
          </nav>
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
          <SupplierSectionTabs pathname={pathname} />
          {children}
        </main>
      </div>
    </>
  );
}
