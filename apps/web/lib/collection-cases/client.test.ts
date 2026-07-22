import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelPromise,
  createDispute,
  createPromise,
  resolveDispute,
} from './client';

const invoiceId = '60eb80e2-c2e6-409c-9d1a-abcc559c1c86';
const promiseId = '484d170a-e4cd-4936-837b-1719c0910139';
const disputeId = '055d5b68-9e21-4e33-bd5e-10a19f8c0a15';
const operationKey = '799cf6df-4c9d-4f55-b38e-dde42f5b817b';
const actor = {
  id: 'ec5f7ebd-73f1-48c4-b234-d39e1210c9cb',
  name: 'Alya Putri',
  role: 'OPERATOR',
};

describe('collection case client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends canonical promise create and cancel commands', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(promiseResponse({ status: 'ACTIVE' }), 201),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          promiseResponse({
            status: 'CANCELLED',
            cancelledAt: '2026-07-22T03:00:00.000Z',
            cancelReason: 'Customer changed the payment date.',
            cancelledBy: actor,
          }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await createPromise(invoiceId, operationKey, {
      amount: ' 400000.5 ',
      promiseDate: '2026-07-25',
    });
    await cancelPromise(promiseId, operationKey, {
      reason: '  Customer changed the payment date.  ',
    });

    expect(requestAt(fetchMock, 0)).toMatchObject({
      path: `/api/invoices/${invoiceId}/promises`,
      body: { amount: '400000.5', promiseDate: '2026-07-25' },
    });
    expect(requestAt(fetchMock, 1)).toMatchObject({
      path: `/api/promises/${promiseId}/cancel`,
      body: { reason: 'Customer changed the payment date.' },
    });
  });

  it('sends normalized dispute create and resolve commands', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(disputeResponse(), 201))
      .mockResolvedValueOnce(
        jsonResponse(
          disputeResponse({
            status: 'RESOLVED',
            resolutionNote: 'Credit note approved.',
            resolvedAt: '2026-07-22T03:00:00.000Z',
            resolvedBy: actor,
          }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await createDispute(invoiceId, operationKey, {
      category: 'WRONG_AMOUNT',
      details: '  Tax mismatch.\r\nAwaiting review.  ',
    });
    await resolveDispute(disputeId, operationKey, {
      resolutionNote: '  Credit note approved.  ',
    });

    expect(requestAt(fetchMock, 0)).toMatchObject({
      path: `/api/invoices/${invoiceId}/disputes`,
      body: {
        category: 'WRONG_AMOUNT',
        details: 'Tax mismatch.\nAwaiting review.',
      },
    });
    expect(requestAt(fetchMock, 1)).toMatchObject({
      path: `/api/disputes/${disputeId}/resolve`,
      body: { resolutionNote: 'Credit note approved.' },
    });
  });

  it('rejects unsafe evidence before network access', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() =>
      createDispute(invoiceId, operationKey, {
        category: 'OTHER',
        details: 'Invoice \u202e001',
      }),
    ).toThrowError();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function promiseResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: promiseId,
      invoiceId,
      amount: '400000.50',
      promiseDate: '2026-07-25',
      status: 'ACTIVE',
      fulfilledAt: null,
      cancelledAt: null,
      cancelReason: null,
      createdBy: actor,
      cancelledBy: null,
      createdAt: '2026-07-22T03:00:00.000Z',
      updatedAt: '2026-07-22T03:00:00.000Z',
      ...overrides,
    },
    replayed: false,
  };
}

function disputeResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: disputeId,
      invoiceId,
      category: 'WRONG_AMOUNT',
      details: 'Tax mismatch.\nAwaiting review.',
      status: 'OPEN',
      resolutionNote: null,
      createdBy: actor,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: '2026-07-22T03:00:00.000Z',
      updatedAt: '2026-07-22T03:00:00.000Z',
      ...overrides,
    },
    replayed: false,
  };
}

function requestAt(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  const [path, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  expect(init).toMatchObject({
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': operationKey,
    },
  });
  return { path, body: JSON.parse(String(init.body)) };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
