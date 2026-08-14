import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getWhatsAppThread,
  sendWhatsAppMessage,
  updateWhatsAppConnectionState,
} from './client';

/**
 * Client tests assert that browser requests never carry organization authority.
 * Mutations send exact bounded payloads and explicit idempotency headers.
 * Network responses still pass through runtime schemas before reaching UI state.
 * Synthetic UUIDs keep these tests deterministic and safe to inspect.
 * Provider secrets must never appear in paths, bodies, or request headers.
 */

const emptyThread = {
  data: {
    connection: {
      id: 'a0000000-0000-4000-8000-000000000001',
      provider: 'META',
      displayPhoneNumber: '+6281190002026',
      state: 'LIVE',
      lastWebhookAt: null,
      lastHealthyAt: null,
      lastFailureCode: null,
    },
    thread: null,
  },
};

describe('WhatsApp client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests a tenant-derived thread without sending organization identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(emptyThread));
    vi.stubGlobal('fetch', fetchMock);

    await getWhatsAppThread({
      debtorId: '20000000-0000-4000-8000-000000000002',
      invoiceId: '30000000-0000-4000-8000-000000000002',
    });

    const [path] = fetchMock.mock.calls[0] as [string];
    expect(path).toContain(
      '/api/debtors/20000000-0000-4000-8000-000000000002/whatsapp-thread?',
    );
    expect(path).toContain('invoiceId=30000000-0000-4000-8000-000000000002');
    expect(path).not.toContain('organization');
  });

  it('uses a narrow owner-only state command', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { ...emptyThread.data.connection, state: 'PAUSED' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await updateWhatsAppConnectionState('PAUSED');

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/whatsapp/connection/state');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ state: 'PAUSED' });
  });

  it('queues exact approved text with an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: 'c0000000-0000-4000-8000-000000000003',
          direction: 'OUTBOUND',
          type: 'TEXT',
          state: 'QUEUED',
          body: 'Exact approved text',
          occurredAt: '2026-08-14T08:00:00.000Z',
          safeFailureCode: null,
          media: null,
        },
        replayed: false,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await sendWhatsAppMessage({
      debtorId: '20000000-0000-4000-8000-000000000002',
      invoiceId: '30000000-0000-4000-8000-000000000002',
      body: 'Exact approved text',
      operationKey: '90000000-0000-4000-8000-000000000009',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      'Idempotency-Key': '90000000-0000-4000-8000-000000000009',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      invoiceId: '30000000-0000-4000-8000-000000000002',
      body: 'Exact approved text',
    });
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
