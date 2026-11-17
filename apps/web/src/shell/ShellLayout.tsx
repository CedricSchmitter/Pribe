import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth';
import { AdminIcon, BeamerIcon, LockIcon, MenuIcon, MoonIcon, RemoteIcon, SunIcon, UploadIcon, VoteIcon } from './icons';
import { useShell, type ShellAvatar } from './ShellContext';
import { useTheme } from './theme';
import './shell.css';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  locked?: boolean;
}

const RAIL_KEY = 'pribe-rail-expanded';

function readRailExpanded(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}

const ADMIN_AVATAR: ShellAvatar = { emoji: '🔑', color: 'var(--steel-dark)', label: 'Admin' };

/** Header, nav rail (bottom bar on phones) and the scrolling content area around every route. */
export function ShellLayout() {
  const { hidden, avatar } = useShell();
  const { authenticated, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(readRailExpanded);
  const [menuOpen, setMenuOpen] = useState(false);

  const adminArea = pathname.startsWith('/admin') || pathname.startsWith('/host') || pathname.startsWith('/remote');
  const shownAvatar = adminArea ? (authenticated ? ADMIN_AVATAR : null) : avatar;
  const locked = authenticated !== true;

  const items: NavItem[] = [
    { to: '/submit', label: 'Einreichen', icon: <UploadIcon /> },
    { to: '/vote', label: 'Abstimmen', icon: <VoteIcon /> },
    { to: '/host', label: 'Beamer', icon: <BeamerIcon />, locked },
    { to: '/remote', label: 'Fernbedienung', icon: <RemoteIcon />, locked },
    { to: '/admin', label: 'Admin', icon: <AdminIcon />, locked },
  ];

  const toggleRail = () => {
    setExpanded((e) => {
      try {
        localStorage.setItem(RAIL_KEY, e ? '0' : '1');
      } catch {
        // Not remembered in private mode.
      }
      return !e;
    });
  };

  return (
    <div className="shell" data-hidden={hidden || undefined} data-expanded={expanded || undefined}>
      <header className="shell-header">
        <button type="button" className="ghost shell-icon-btn shell-rail-toggle" aria-label="Navigation umschalten" onClick={toggleRail}>
          <MenuIcon />
        </button>
        <NavLink to="/" className="shell-wordmark">
          Pribe
        </NavLink>
        <div className="shell-header-end">
          <button
            type="button"
            className="ghost shell-icon-btn"
            aria-label={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
            onClick={toggle}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          {shownAvatar && (
            <div className="shell-avatar-wrap">
              <button
                type="button"
                className="ghost shell-icon-btn"
                title={shownAvatar.label}
                aria-label={shownAvatar.label}
                aria-expanded={adminArea ? menuOpen : undefined}
                onClick={() => adminArea && setMenuOpen((o) => !o)}
              >
                <span className="shell-avatar" style={{ background: shownAvatar.color }}>
                  {shownAvatar.emoji}
                </span>
              </button>
              {adminArea && menuOpen && (
                <div className="shell-flyout">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void logout();
                    }}
                  >
                    Abmelden
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <nav className="shell-rail" aria-label="Hauptnavigation">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} className="shell-nav-item">
            <span className="shell-nav-icon">
              {item.icon}
              {item.locked && (
                <span className="shell-nav-lock" aria-label="gesperrt">
                  <LockIcon />
                </span>
              )}
            </span>
            <span className="shell-nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="shell-main">
        {/* Keyed on the area, so sub-routes inside /admin do not replay the entrance. */}
        <motion.div
          key={pathname.split('/')[1] ?? ''}
          className="shell-page"
          initial={{ opacity: 0, y: 60, scale: 0.92, rotate: -2 }}
          animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
