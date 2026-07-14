'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { ApiClientError } from '@/lib/api-client/http';
import { login } from '@/lib/auth/client';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');

    try {
      await login(email, password);
      router.replace('/dashboard');
      router.refresh();
    } catch (requestError) {
      if (requestError instanceof ApiClientError) {
        setError(requestError.message);
      } else {
        setError('Unable to reach Arus. Please try again.');
      }
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field">
        Work email
        <input
          className="input"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="operator@company.co.id"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
          disabled={pending}
          required
        />
      </label>
      <label className="field">
        <span className="field-label-row">
          Password
          <Link href="/forgot-password">Forgot password?</Link>
        </span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'login-error' : undefined}
          disabled={pending}
          required
        />
      </label>
      {error && (
        <p className="login-error" id="login-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-primary login-submit"
        type="submit"
        disabled={pending}
      >
        {pending ? 'Signing in…' : 'Sign in'}
        {!pending && <ArrowRight size={16} aria-hidden="true" />}
      </button>
    </form>
  );
}
