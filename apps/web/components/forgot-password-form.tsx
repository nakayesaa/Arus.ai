'use client';

import { ArrowRight } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { ApiClientError } from '@/lib/api-client/http';
import { requestPasswordReset } from '@/lib/account-lifecycle/client';

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      setMessage(await requestPasswordReset(String(form.get('email') ?? '')));
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.message
          : 'Unable to reach Arus. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }

  if (message) {
    return (
      <p className="account-action-message" role="status">
        {message}
      </p>
    );
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
          maxLength={320}
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
        disabled={pending}
      >
        {pending ? 'Sending…' : 'Send reset link'}
        {!pending && <ArrowRight size={16} />}
      </button>
    </form>
  );
}
