'use client';

import {
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  Command,
  CreditCard,
  FileText,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MessageSquareText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { ArusLogo } from '@/components/arus-logo';
import { logout } from '@/lib/auth/client';
import type { AuthSession } from '@/lib/auth/types';

const navigation = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Chat', href: '/chat', icon: MessageSquareText },
  { label: 'Collection Queue', href: '/collection-queue', icon: ListTodo },
  { label: 'Invoices', href: '/invoices', icon: ReceiptText },
  { label: 'Debtors', href: '/debtors', icon: Building2 },
  { label: 'Import', href: '/import', icon: Upload },
  { label: 'Payments', href: '/payments', icon: CreditCard },
  { label: 'Reports', href: '/reports', icon: ChartNoAxesCombined },
] as const;

const history = [
  { label: 'overdue-30-days.md', href: '/invoices' },
  { label: 'broken-promises.md', href: '/collection-queue' },
  { label: 'high-value-accounts.md', href: '/debtors' },
  { label: 'weekly-collection-review.md', href: '/chat' },
  { label: 'payment-allocation-check.md', href: '/payments' },
] as const;

interface AppShellProps {
  children: ReactNode;
  session: AuthSession;
}

export function AppShell({ children, session }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia('(max-width: 940px)').matches) {
      setSidebarOpen(false);
    }
  }, []);

  async function handleLogout() {
    setLogoutPending(true);
    setLogoutError(null);

    try {
      await logout();
      router.replace('/login');
      router.refresh();
    } catch {
      setLogoutError('Could not sign out. Try again.');
      setLogoutPending(false);
    }
  }

  return (
    <div
      className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}
    >
      <aside className="sidebar" aria-hidden={!sidebarOpen}>
        <div className="sidebar-brand-row">
          <Link className="sidebar-brand" href="/dashboard">
            <ArusLogo className="sidebar-arus-logo" />
          </Link>
          <div className="sidebar-brand-actions">
            <button
              className="icon-button sidebar-close-button"
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <PanelLeftClose size={17} />
            </button>
          </div>
        </div>

        <button className="sidebar-search" type="button">
          <Search size={16} aria-hidden="true" />
          <span>Search</span>
          <kbd>
            <Command size={11} aria-hidden="true" />K
          </kbd>
        </button>

        <div className="sidebar-section">
          <p className="sidebar-label">Workspace</p>
          <nav className="nav-list" aria-label="Primary navigation">
            {navigation.map(({ label, href, icon: Icon }) => {
              const active =
                pathname === href ||
                (href !== '/dashboard' && pathname.startsWith(`${href}/`));

              return (
                <Link
                  className={`nav-link ${active ? 'active' : ''}`}
                  href={href}
                  key={href}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-section sidebar-history">
          <button
            className={`history-toggle ${historyOpen ? 'history-toggle-open' : ''}`}
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-expanded={historyOpen}
            aria-controls="sidebar-history-list"
          >
            <span>History</span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {historyOpen && (
            <nav
              className="nav-list history-scroll"
              id="sidebar-history-list"
              aria-label="Markdown history"
            >
              {history.map(({ label, href }) => (
                <Link className="nav-link history-link" href={href} key={label}>
                  <FileText size={14} strokeWidth={1.5} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className="sidebar-footer">
          {profileOpen && (
            <div className="profile-menu" role="menu">
              {session.role === 'OWNER' && (
                <Link
                  className="profile-menu-item"
                  href="/settings"
                  role="menuitem"
                  onClick={() => setProfileOpen(false)}
                >
                  <Settings size={15} />
                  <span>
                    <strong>Settings</strong>
                    <small>Organization and access</small>
                  </span>
                </Link>
              )}
              <button
                className="profile-menu-item"
                type="button"
                role="menuitem"
                onClick={handleLogout}
                disabled={logoutPending}
              >
                <LogOut size={15} />
                <span>
                  <strong>{logoutPending ? 'Signing out…' : 'Sign out'}</strong>
                  <small>End this workspace session</small>
                </span>
              </button>
              {logoutError && (
                <p className="profile-menu-error" role="alert">
                  {logoutError}
                </p>
              )}
            </div>
          )}
          <button
            className="profile-switcher"
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
          >
            <span className="avatar avatar-alex">
              {initials(session.user.name)}
            </span>
            <span className="profile-copy">
              <strong>{session.user.name}</strong>
              <small>{session.organization.name}</small>
            </span>
            <ChevronDown
              className={profileOpen ? 'profile-chevron-open' : undefined}
              size={14}
              aria-hidden="true"
            />
          </button>
          <button className="icon-button" type="button" aria-label="Dark theme">
            <Moon size={16} />
          </button>
        </div>
      </aside>

      <main className="workspace">
        {!sidebarOpen && (
          <button
            className="icon-button sidebar-open-button"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <PanelLeftOpen size={17} />
          </button>
        )}
        {children}
      </main>
    </div>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
