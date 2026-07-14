import type { Metadata } from 'next';
import Link from 'next/link';

import { ArusLogo } from '@/components/arus-logo';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="forgot-title">
        <div className="login-brand">
          <ArusLogo className="login-arus-logo" />
        </div>
        <div className="login-copy">
          <p>ACCOUNT RECOVERY</p>
          <h1 id="forgot-title">recover access.</h1>
          <span>We will send a short-lived link if the account is active.</span>
        </div>
        <ForgotPasswordForm />
        <p className="login-footnote">
          <Link href="/login">Return to sign in</Link>
        </p>
      </section>
    </main>
  );
}
