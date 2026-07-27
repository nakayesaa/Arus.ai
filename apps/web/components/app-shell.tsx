'use client';

import {
  Building2,
  ChevronDown,
  CreditCard,
  Ellipsis,
  FileText,
  Inbox,
  ListTodo,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  SquarePen,
  Target,
  Upload,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { logout } from '@/lib/auth/client';
import type { AuthSession } from '@/lib/auth/types';

const primaryNavigation = [
  { label: 'Collections Inbox', href: '/dashboard', icon: Inbox },
  { label: 'Customers', href: '/debtors', icon: Building2 },
  { label: 'Collection Queue', href: '/collection-queue', icon: ListTodo },
] as const;

const workspaceNavigation = [
  { label: 'Collection Strategies', href: '/reports', icon: Target },
  { label: 'Invoices', href: '/invoices', icon: FileText },
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
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
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
          <Link
            className="sidebar-brand"
            href="/dashboard"
            aria-label="Arus home"
          >
            <span className="sidebar-brand-mark" aria-hidden="true">
              <Image
                src="/brand/arus-logo-transparent.png"
                alt=""
                width={82}
                height={27}
                priority
              />
            </span>
            <span className="sidebar-brand-name">Arus</span>
            <ChevronDown
              className="sidebar-brand-chevron"
              size={13}
              aria-hidden="true"
            />
          </Link>
          <div className="sidebar-brand-actions">
            <Link
              className="sidebar-utility-button sidebar-compose-button"
              href="/collection-queue"
              aria-label="Create collection action"
            >
              <SquarePen size={15} strokeWidth={1.8} aria-hidden="true" />
            </Link>
            <button
              className="sidebar-utility-button sidebar-close-button"
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <PanelLeftClose size={15} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="sidebar-scroll-area">
          <nav
            className="sidebar-primary-navigation"
            aria-label="Primary navigation"
          >
            {primaryNavigation.map(({ label, href, icon: Icon }) => {
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
                  <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-section sidebar-workspace-group">
            <button
              className={`sidebar-group-toggle ${workspaceOpen ? 'sidebar-group-toggle-open' : ''}`}
              type="button"
              onClick={() => setWorkspaceOpen((open) => !open)}
              aria-expanded={workspaceOpen}
              aria-controls="sidebar-workspace-navigation"
            >
              <span>Workspace</span>
              <ChevronDown size={12} aria-hidden="true" />
            </button>
            <CollapsibleRegion
              id="sidebar-workspace-navigation"
              open={workspaceOpen}
            >
              <nav className="nav-list" aria-label="Workspace navigation">
                {workspaceNavigation.map(({ label, href, icon: Icon }) => {
                  const active = pathname === href;

                  return (
                    <Link
                      className={`nav-link ${active ? 'active' : ''}`}
                      href={href}
                      key={href}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
                      <span>{label}</span>
                    </Link>
                  );
                })}
                <button
                  className={`nav-link sidebar-more-toggle ${moreOpen ? 'active' : ''}`}
                  type="button"
                  onClick={() => setMoreOpen((open) => !open)}
                  aria-expanded={moreOpen}
                  aria-controls="sidebar-more-navigation"
                >
                  <Ellipsis size={15} strokeWidth={1.7} aria-hidden="true" />
                  <span>More</span>
                  <ChevronDown
                    className="sidebar-more-chevron"
                    size={12}
                    aria-hidden="true"
                  />
                </button>
                <CollapsibleRegion id="sidebar-more-navigation" open={moreOpen}>
                  <div className="sidebar-more-navigation">
                    <Link className="nav-link" href="/payments">
                      <CreditCard
                        size={14}
                        strokeWidth={1.7}
                        aria-hidden="true"
                      />
                      <span>Payments</span>
                    </Link>
                    <Link className="nav-link" href="/import">
                      <Upload size={14} strokeWidth={1.7} aria-hidden="true" />
                      <span>Data Import</span>
                    </Link>
                  </div>
                </CollapsibleRegion>
              </nav>
            </CollapsibleRegion>
          </div>
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
              <small>{session.user.email}</small>
            </span>
            <ChevronDown
              className={profileOpen ? 'profile-chevron-open' : undefined}
              size={14}
              aria-hidden="true"
            />
          </button>
        </div>
      </aside>

      <main
        className="workspace"
        onClickCapture={handleWorkspaceFragmentNavigation}
      >
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

function handleWorkspaceFragmentNavigation(
  event: ReactMouseEvent<HTMLElement>,
): void {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const source = event.target;
  if (!(source instanceof Element)) return;

  const anchor = source.closest<HTMLAnchorElement>('a[href^="#"]');
  const rawHash = anchor?.getAttribute('href');
  if (!anchor || !rawHash || rawHash === '#') return;

  const targetId = decodeFragment(rawHash.slice(1));
  const target = targetId ? document.getElementById(targetId) : null;
  if (!target) return;

  event.preventDefault();

  if (window.location.hash !== rawHash) {
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${rawHash}`,
    );
  }

  const workspace = event.currentTarget;
  const workspaceRect = workspace.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const scrollPadding =
    Number.parseFloat(getComputedStyle(workspace).scrollPaddingBlockStart) || 0;
  const top =
    workspace.scrollTop + targetRect.top - workspaceRect.top - scrollPadding;

  workspace.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}

function decodeFragment(fragment: string): string | null {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return null;
  }
}

interface CollapsibleRegionProps {
  children: ReactNode;
  id: string;
  open: boolean;
}

function CollapsibleRegion({ children, id, open }: CollapsibleRegionProps) {
  return (
    <div
      className="sidebar-collapse-region"
      id={id}
      data-open={open}
      aria-hidden={!open}
    >
      <div className="sidebar-collapse-region-inner">{children}</div>
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
