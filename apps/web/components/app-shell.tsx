import Link from 'next/link';
import type { ReactNode } from 'react';

const navigation = [
  ['Dashboard', '/dashboard'],
  ['Collection Queue', '/collection-queue'],
  ['Invoices', '/invoices'],
  ['Debtors', '/debtors'],
  ['Import', '/import'],
  ['Payments', '/payments'],
  ['Reports', '/reports'],
  ['Settings', '/settings'],
] as const;

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          AR Collections OS
          <span className="brand-subtitle">Internal workspace</span>
        </Link>
        <nav className="nav-list" aria-label="Primary navigation">
          {navigation.map(([label, href]) => (
            <Link className="nav-link" href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          Active organization
          <br />
          <strong>Demo Indonesia</strong>
        </div>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
