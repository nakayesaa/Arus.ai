import { afterEach, describe, expect, it, vi } from 'vitest';

import { getWhatsAppThread, updateWhatsAppConnectionState } from './client';

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
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
