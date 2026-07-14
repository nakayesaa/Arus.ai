import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { requireServerSession } from '@/lib/auth/server';

interface WorkspaceLayoutProps {
  children: ReactNode;
}

export default async function WorkspaceLayout({
  children,
}: WorkspaceLayoutProps) {
  const session = await requireServerSession();

  return <AppShell session={session}>{children}</AppShell>;
}
