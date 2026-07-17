import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { sessionCookieHeader } from '@/lib/auth/cookie';

import { ApiClientError, ApiContractError } from './errors';
import { fetchWithTimeout } from './fetch';

export async function serverApiRequest<T>(
  path: `/api/${string}`,
  responseSchema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const requestHeaders = await headers();
  const cookie = sessionCookieHeader(requestHeaders.get('cookie'));
  const apiOrigin = new URL(process.env.API_ORIGIN ?? 'http://localhost:4000')
    .origin;
  const response = await fetchWithTimeout(path, new URL(path, apiOrigin), {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(cookie ? { cookie } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401) redirect('/login');
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const error = apiErrorBodySchema.safeParse(body);
    throw new ApiClientError(
      error.success ? error.data.error.message : 'API request failed',
      response.status,
      error.success ? error.data : undefined,
    );
  }

  const body: unknown = await response.json();
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) throw new ApiContractError(path);
  return parsed.data;
}

const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
    requestId: z.string(),
  }),
});
