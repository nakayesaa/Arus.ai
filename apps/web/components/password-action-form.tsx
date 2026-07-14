'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useState } from 'react';

import { ApiClientError } from '@/lib/api-client/http';
import {
  acceptInvitation,
  completePasswordReset,
} from '@/lib/account-lifecycle/client';

interface PasswordActionFormProps {
  mode: 'invitation' | 'reset';
  token: string;
}

export function PasswordActionForm({ mode, token }: PasswordActionFormProps) {
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('confirmation') ?? '');
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    try {
      if (mode === 'invitation') {
        await acceptInvitation(token, password);
      } else {
        await completePasswordReset(token, password);
      }
      window.history.replaceState({}, '', window.location.pathname);
      setComplete(true);
    } catch (requestError) {
      setError(messageFor(requestError));
      setPending(false);
    }
  }

  if (complete) {
    return (
      <div className="account-action-success">
        <p>
          {mode === 'invitation'
            ? 'Your Arus account is ready.'
            : 'Your password has been changed and existing sessions were signed out.'}
        </p>
        <Link className="button button-primary login-submit" href="/login">
          Continue to sign in <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field">
        New password
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
        disabled={pending || token.length === 0}
      >
        {pending
          ? 'Saving…'
          : mode === 'invitation'
            ? 'Create account'
            : 'Reset password'}
        {!pending && <ArrowRight size={16} />}
      </button>
      {token.length === 0 && (
        <p className="login-error">This link is missing its security token.</p>
      )}
    </form>
  );
}

function messageFor(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : 'Unable to reach Arus. Please try again.';
}
