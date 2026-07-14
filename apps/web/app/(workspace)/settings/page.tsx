import type { Metadata } from 'next';
import {
  Building2,
  ChevronRight,
  Clock3,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { Pill } from '@/components/table-ui';
import { requireServerSession } from '@/lib/auth/server';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await requireServerSession();

  if (session.role !== 'OWNER') {
    redirect('/dashboard');
  }

  return (
    <div className="content-page">
      <PageHeader
        title="Settings"
        eyebrow="Organization · owner access"
        description="Manage your workspace identity, timezone, members, and roles."
        action={
          <button className="primary-button" type="button">
            Save changes
          </button>
        }
      />

      <section className="content-grid">
        <article className="panel panel-span-7">
          <h2>Organization</h2>
          <p>Core details used throughout collection activity and reports.</p>
          <div className="settings-list">
            <button className="settings-row settings-row-button" type="button">
              <Building2 size={17} />
              <div>
                <strong>{session.organization.name}</strong>
                <span>Organization name</span>
              </div>
              <ChevronRight size={16} />
            </button>
            <button className="settings-row settings-row-button" type="button">
              <Clock3 size={17} />
              <div>
                <strong>{session.organization.timezone}</strong>
                <span>Timezone</span>
              </div>
              <ChevronRight size={16} />
            </button>
            <button className="settings-row settings-row-button" type="button">
              <ShieldCheck size={17} />
              <div>
                <strong>Indonesian Rupiah (IDR)</strong>
                <span>Base currency</span>
              </div>
              <ChevronRight size={16} />
            </button>
          </div>
        </article>

        <article className="panel panel-span-5">
          <h2>Workspace access</h2>
          <p>Current authenticated owner for this organization.</p>
          <div className="settings-list">
            <div className="settings-row">
              <span className="avatar avatar-alex">
                {initials(session.user.name)}
              </span>
              <div>
                <strong>{session.user.name}</strong>
                <span>Owner · {session.user.email}</span>
              </div>
              <Pill tone="green">Active</Pill>
            </div>
          </div>
          <button className="control-button full-width-button" type="button">
            <Users size={15} /> Manage members
          </button>
        </article>
      </section>
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
