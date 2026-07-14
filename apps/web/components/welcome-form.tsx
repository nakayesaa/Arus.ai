'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { ApiClientError } from '@/lib/api-client/http';
import { acceptInvitation } from '@/lib/account-lifecycle/client';
import { useActionToken } from '@/lib/account-lifecycle/use-action-token';

export function WelcomeForm({ initialToken = '' }: { initialToken?: string }) {
  const router = useRouter();
  const { token, ready } = useActionToken(initialToken);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '');
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('confirmation') ?? '');
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    try {
      await acceptInvitation(token, name, password);
      window.history.replaceState({}, '', window.location.pathname);
      router.replace('/dashboard');
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'Unable to reach Arus. Please try again.',
      );
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field">
        Your name
        <input
          className="input"
          name="name"
          type="text"
          autoComplete="name"
          minLength={2}
          maxLength={200}
          placeholder="How your team will see you"
          required
          disabled={pending}
        />
      </label>
      <label className="field">
        Create password
        <input
          className="input"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          disabled={pending}
        />
        <small className="field-hint">Use at least 12 characters.</small>
      </label>
      <label className="field">
        Confirm password
        <input
          className="input"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          disabled={pending}
        />
      </label>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-primary login-submit"
        type="submit"
        disabled={pending || !ready || token.length === 0}
      >
        {pending ? 'Creating your workspace…' : 'Enter Arus'}
        {!pending && <ArrowRight size={16} />}
      </button>
      {ready && token.length === 0 && (
        <p className="login-error">This invitation link is incomplete.</p>
      )}
    </form>
  );
}
