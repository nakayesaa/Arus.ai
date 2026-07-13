import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

import { ArusLogo } from '@/components/arus-logo';

export const metadata: Metadata = { title: 'Login' };

export default function LoginPage() {
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

        <form className="login-form">
          <label className="field">
            Work email
            <input
              className="input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="operator@company.co.id"
            />
          </label>
          <label className="field">
            Password
            <input
              className="input"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </label>
          <button className="button button-primary login-submit" type="submit">
            Sign in <ArrowRight size={16} />
          </button>
        </form>
        <p className="login-footnote">
          Secure access for your organization&apos;s collection team.
        </p>
      </section>
    </main>
  );
}
