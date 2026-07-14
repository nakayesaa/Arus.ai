import type { Metadata } from 'next';

import { ArusLogo } from '@/components/arus-logo';
import { PasswordActionForm } from '@/components/password-action-form';

export const metadata: Metadata = { title: 'Accept invitation' };

interface AcceptInvitationPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitationPage({
  searchParams,
}: AcceptInvitationPageProps) {
  const { token = '' } = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="invitation-title">
        <AccountBrand />
        <div className="login-copy">
          <p>SECURE INVITATION</p>
          <h1 id="invitation-title">join your workspace.</h1>
          <span>Choose a strong password to activate your Arus account.</span>
        </div>
        <PasswordActionForm mode="invitation" token={token} />
      </section>
    </main>
  );
}

function AccountBrand() {
  return (
    <div className="login-brand">
      <ArusLogo className="login-arus-logo" />
    </div>
  );
}
