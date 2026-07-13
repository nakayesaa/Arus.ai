import type { Metadata } from 'next';
import {
  Building2,
  ChevronRight,
  Clock3,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Pill } from '@/components/table-ui';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
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
                <strong>Demo Indonesia</strong>
                <span>Organization name</span>
              </div>
              <ChevronRight size={16} />
            </button>
            <button className="settings-row settings-row-button" type="button">
              <Clock3 size={17} />
              <div>
                <strong>Asia/Jakarta (WIB)</strong>
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
          <p>Three active members can operate this organization.</p>
          <div className="settings-list">
            {[
              ['AN', 'Alex Nugraha', 'Owner'],
              ['MY', 'Maya Yasmin', 'Member'],
              ['DM', 'Dimas Mahendra', 'Member'],
            ].map(([initials, name, role]) => (
              <div className="settings-row" key={name}>
                <span className="avatar avatar-alex">{initials}</span>
                <div>
                  <strong>{name}</strong>
                  <span>{role}</span>
                </div>
                <Pill tone="green">Active</Pill>
              </div>
            ))}
          </div>
          <button className="control-button full-width-button" type="button">
            <Users size={15} /> Manage members
          </button>
        </article>
      </section>
    </div>
  );
}
