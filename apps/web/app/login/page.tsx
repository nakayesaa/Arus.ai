import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ArusLogo } from '@/components/arus-logo';
import { LoginForm } from '@/components/login-form';
import { getServerSession } from '@/lib/auth/server';

export const metadata: Metadata = { title: 'Login' };

export default async function LoginPage() {
  const session = await getServerSession();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <ArusLogo className="login-arus-logo" />
        </div>

        <div className="login-copy">
          <p>COLLECTIONS WORKSPACE</p>
          <h1 id="login-title">welcome back.</h1>
          <span>Continue managing every rupiah with a clear audit trail.</span>
        </div>

        <LoginForm />
        <p className="login-footnote">
          Secure access for your organization&apos;s collection team.
        </p>
      </section>
    </main>
  );
}
