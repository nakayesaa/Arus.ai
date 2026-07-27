import type { Metadata } from 'next';
import {
  Building2,
  ChevronRight,
  Clock3,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { MembersManager } from '@/components/members-manager';
import { requireServerSession } from '@/lib/auth/server';
import { getWhatsAppConnection } from '@/lib/whatsapp/server';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await requireServerSession();

  if (session.role !== 'OWNER') {
    redirect('/dashboard');
  }
  const connection = await getWhatsAppConnection();

  return (
    <div className="content-page">
      <PageHeader
        title="Settings"
        eyebrow="Organization · owner access"
        description="Manage your workspace identity, timezone, members, and roles."
      />

      <section className="content-grid">
        <article className="panel panel-span-5">
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
            <div className="settings-row">
              <MessageCircle size={17} />
              <div>
                <strong>
                  {connection.data?.displayPhoneNumber ??
                    'Business sender not connected'}
                </strong>
                <span>
                  WhatsApp ·{' '}
                  {connection.data
                    ? connection.data.state.toLocaleLowerCase('en-US')
                    : 'secure setup required'}
                </span>
              </div>
            </div>
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

        <article className="panel panel-span-7">
          <MembersManager currentUserId={session.user.id} />
        </article>
      </section>
    </div>
  );
}
