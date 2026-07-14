import { apiRequest } from '@/lib/api-client/http';

import type { AuthSession, DataEnvelope } from './types';

export async function login(
  email: string,
  password: string,
): Promise<AuthSession> {
  const response = await apiRequest<DataEnvelope<AuthSession>>(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  );

  return response.data;
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/api/auth/logout', { method: 'POST' });
}
