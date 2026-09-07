import { NavLink } from 'react-router-dom';
import {
  Wallet,
  Landmark,
  Receipt,
  Tag,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { ReactNode } from 'react';

const NAV = [
  { to: '/wallets', label: 'Кошельки', icon: Wallet },
  { to: '/billing', label: 'Биллинг', icon: Landmark },
  { to: '/billing/transactions', label: 'Транзакции', icon: Receipt },
  { to: '/billing/pricing', label: 'Цены', icon: Tag },
  { to: '/deals', label: 'Сделки', icon: ShieldCheck },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">HupHup Admin</div>
        <nav className="nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/billing'}
              className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
            >
              <Icon className="ico" size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="admin-name">{user?.fullName}</div>
          <div className="admin-email">{user?.email}</div>
          <button type="button" className="ghost logout-btn" onClick={logout}>
            <LogOut size={16} className="ico" />
            Выйти
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
