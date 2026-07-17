import { z } from 'zod';

import { ApiClientError, ApiContractError, type ApiErrorBody } from './errors';
import { fetchWithTimeout } from './fetch';

export { ApiClientError } from './errors';

const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
    requestId: z.string(),
  }),
});

export async function apiRequest<T>(
  path: `/${string}`,
  init: RequestInit = {},
  responseSchema?: z.ZodType<T>,
): Promise<T> {
  const response = await fetchWithTimeout(path, path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await readApiError(response);

    throw new ApiClientError(
      body?.error.message ?? 'API request failed',
      response.status,
      body,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body: unknown = await response.json();
  if (!responseSchema) return body as T;

  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) throw new ApiContractError(path);
  return parsed.data;
}

async function readApiError(
  response: Response,
): Promise<ApiErrorBody | undefined> {
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = apiErrorBodySchema.safeParse(body);
  return parsed.success ? parsed.data : undefined;
}
