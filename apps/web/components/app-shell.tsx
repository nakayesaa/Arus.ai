'use client';

import {
  Building2,
  ChartNoAxesCombined,
  ChartSpline,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Command,
  CreditCard,
  FileText,
  LayoutDashboard,
  ListTodo,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';

const navigation = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Collection Queue', href: '/collection-queue', icon: ListTodo },
  { label: 'Invoices', href: '/invoices', icon: ReceiptText },
  { label: 'Debtors', href: '/debtors', icon: Building2 },
  { label: 'Import', href: '/import', icon: Upload },
  { label: 'Payments', href: '/payments', icon: CreditCard },
  { label: 'Reports', href: '/reports', icon: ChartNoAxesCombined },
  { label: 'Settings', href: '/settings', icon: Settings },
] as const;

const history = [
  { label: 'Overdue above 30 days', href: '/invoices', icon: Clock3 },
  { label: 'Broken promises', href: '/collection-queue', icon: FileText },
  { label: 'High-value accounts', href: '/debtors', icon: CircleDollarSign },
] as const;

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div
      className={`app-shell ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}
    >
      <aside className="sidebar" aria-hidden={!sidebarOpen}>
        <div className="sidebar-brand-row">
          <Link className="sidebar-brand" href="/dashboard">
            <span className="brand-mark" aria-hidden="true">
              <ChartSpline size={20} strokeWidth={2.4} />
            </span>
            <strong>Arus</strong>
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
          <p className="sidebar-label">History</p>
          <nav className="nav-list" aria-label="Saved views">
            {history.map(({ label, href, icon: Icon }) => (
              <Link className="nav-link history-link" href={href} key={label}>
                <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <button className="profile-switcher" type="button">
            <span className="avatar avatar-alex">AN</span>
            <span className="profile-copy">
              <strong>Alex Nugraha</strong>
              <small>Demo Indonesia</small>
            </span>
            <ChevronDown size={14} aria-hidden="true" />
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
