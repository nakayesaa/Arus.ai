import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordCommunication } from './client';

const invoiceId = '60eb80e2-c2e6-409c-9d1a-abcc559c1c86';
const operationKey = '799cf6df-4c9d-4f55-b38e-dde42f5b817b';

describe('communication client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a normalized idempotent command and validates the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: '484d170a-e4cd-4936-837b-1719c0910139',
          invoiceId,
          occurredAt: '2026-07-22T03:00:00.000Z',
          channel: 'CALL',
          notes: 'Confirmed payment run.\nFollow up tomorrow.',
          nextFollowUpDate: '2026-07-23',
          actor: {
            id: '055d5b68-9e21-4e33-bd5e-10a19f8c0a15',
            name: 'Alya Putri',
            role: 'OPERATOR',
          },
          createdAt: '2026-07-22T03:00:00.000Z',
          updatedAt: '2026-07-22T03:00:00.000Z',
        },
        replayed: false,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await recordCommunication(invoiceId, operationKey, {
      channel: 'CALL',
      notes: '  Confirmed payment run.\r\nFollow up tomorrow.  ',
      nextFollowUpDate: '2026-07-23',
    });

    expect(result.replayed).toBe(false);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(`/api/invoices/${invoiceId}/communications`);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': operationKey,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      channel: 'CALL',
      notes: 'Confirmed payment run.\nFollow up tomorrow.',
      nextFollowUpDate: '2026-07-23',
    });
  });

  it('rejects unsafe notes before making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() =>
      recordCommunication(invoiceId, operationKey, {
        channel: 'OTHER',
        notes: 'Invoice \u202e001',
        nextFollowUpDate: null,
      }),
    ).toThrowError();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}
