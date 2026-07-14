import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import type { AuthSession, DataEnvelope } from './types';

export const getServerSession = cache(async (): Promise<AuthSession | null> => {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  const apiOrigin = new URL(process.env.API_ORIGIN ?? 'http://localhost:4000')
    .origin;
  const response = await fetch(new URL('/api/auth/me', apiOrigin), {
    cache: 'no-store',
    headers: cookie ? { cookie } : {},
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Authentication service failed with ${response.status}`);
  }

  const body = (await response.json()) as DataEnvelope<AuthSession>;
  return body.data;
});

export async function requireServerSession(): Promise<AuthSession> {
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  return session;
}
