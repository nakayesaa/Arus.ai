import type { Metadata } from 'next';

import { ArusLogo } from '@/components/arus-logo';
import { WelcomeForm } from '@/components/welcome-form';

export const metadata: Metadata = { title: 'Welcome to Arus.ai' };

interface WelcomePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function WelcomePage({ searchParams }: WelcomePageProps) {
  const { token = '' } = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="welcome-title">
        <div className="login-brand">
          <ArusLogo className="login-arus-logo" />
        </div>
        <div className="login-copy">
          <p>YOUR WORKSPACE IS READY</p>
          <h1 id="welcome-title">Welcome to Arus.ai</h1>
          <span>
            Tell your team who you are, secure your account, and start working.
          </span>
        </div>
        <WelcomeForm token={token} />
      </section>
    </main>
  );
}
