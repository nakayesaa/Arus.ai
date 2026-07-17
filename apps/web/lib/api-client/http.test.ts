import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiClientError, ApiContractError } from './errors';
import { apiRequest } from './http';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates a successful response when a schema is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 'debtor-1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const schema = z.object({ data: z.object({ id: z.string() }) });

    await expect(apiRequest('/api/debtors', {}, schema)).resolves.toEqual({
      data: { id: 'debtor-1' },
    });
  });

  it('rejects an invalid successful response as a contract error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { id: 42 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(
      apiRequest(
        '/api/debtors',
        {},
        z.object({ data: z.object({ id: z.string() }) }),
      ),
    ).rejects.toBeInstanceOf(ApiContractError);
  });

  it('preserves stable API error details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request is invalid',
              fields: { search: 'Too long' },
              requestId: 'request-1',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const error = await apiRequest('/api/debtors').catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          fields: { search: 'Too long' },
          requestId: 'request-1',
        },
      },
    });
  });

  it('supports empty successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(
      apiRequest<void>('/api/auth/logout', { method: 'POST' }),
    ).resolves.toBeUndefined();
  });
});
