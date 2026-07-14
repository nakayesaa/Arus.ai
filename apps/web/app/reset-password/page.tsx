import type { Metadata } from 'next';

import { ArusLogo } from '@/components/arus-logo';
import { PasswordActionForm } from '@/components/password-action-form';

export const metadata: Metadata = { title: 'Reset password' };

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token = '' } = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="reset-title">
        <div className="login-brand">
          <ArusLogo className="login-arus-logo" />
        </div>
        <div className="login-copy">
          <p>ACCOUNT RECOVERY</p>
          <h1 id="reset-title">set a new password.</h1>
          <span>
            Changing it will securely sign out every existing session.
          </span>
        </div>
        <PasswordActionForm mode="reset" token={token} />
      </section>
    </main>
  );
}
