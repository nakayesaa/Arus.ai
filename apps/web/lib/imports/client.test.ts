import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiContractError } from '../api-client/errors';
import {
  commitInvoiceImportJob,
  listInvoiceImportRows,
  previewInvoiceCsv,
} from './client';

const jobId = 'ca791d48-b39b-4c4c-85de-9a58e9390331';

describe('invoice import client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uploads the selected CSV as the only multipart field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: jobId,
          filename: 'invoices.csv',
          fileHash: 'b'.repeat(64),
          status: 'READY',
          counts: { total: 1, valid: 1, invalid: 0, duplicate: 0, warning: 0 },
          fileWarnings: [],
          failure: null,
          committedAt: null,
          cancelledAt: null,
          createdAt: '2026-07-21T03:00:00.000Z',
          updatedAt: '2026-07-21T03:00:01.000Z',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['customer_name\nPT Test'], 'invoices.csv', {
      type: 'text/csv',
    });

    await expect(previewInvoiceCsv(file)).resolves.toMatchObject({
      id: jobId,
      status: 'READY',
    });

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/imports/invoices/preview');
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toMatchObject({
      name: 'invoices.csv',
      type: 'text/csv',
    });
    expect([...(init.body as FormData).keys()]).toEqual(['file']);
  });

  it('requests a tenant-scoped preview page with a supported filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [],
        pagination: { page: 2, limit: 25, total: 30, totalPages: 2 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listInvoiceImportRows(jobId, {
        result: 'INVALID',
        page: 2,
        limit: 25,
      }),
    ).resolves.toMatchObject({ pagination: { page: 2, total: 30 } });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/imports/${jobId}/rows?page=2&limit=25&result=INVALID`,
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('rejects a non-terminal response from the synchronous preview endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            id: jobId,
            filename: 'invoices.csv',
            fileHash: 'b'.repeat(64),
            status: 'PREVIEWING',
            counts: {
              total: 0,
              valid: 0,
              invalid: 0,
              duplicate: 0,
              warning: 0,
            },
            fileWarnings: [],
            failure: null,
            committedAt: null,
            cancelledAt: null,
            createdAt: '2026-07-21T03:00:00.000Z',
            updatedAt: '2026-07-21T03:00:00.000Z',
          },
        }),
      ),
    );

    await expect(
      previewInvoiceCsv(
        new File(['customer_name'], 'invoices.csv', { type: 'text/csv' }),
      ),
    ).rejects.toBeInstanceOf(ApiContractError);
  });

  it('posts an idempotent commit command without a client-authored payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          job: {
            id: jobId,
            filename: 'invoices.csv',
            fileHash: 'b'.repeat(64),
            status: 'COMMITTED',
            counts: {
              total: 3,
              valid: 2,
              invalid: 1,
              duplicate: 0,
              warning: 0,
            },
            fileWarnings: [],
            failure: null,
            committedAt: '2026-07-21T03:05:00.000Z',
            cancelledAt: null,
            createdAt: '2026-07-21T03:00:00.000Z',
            updatedAt: '2026-07-21T03:05:00.000Z',
          },
          reconciliation: {
            committedInvoices: 2,
            skippedRows: 1,
            createdDebtors: 1,
            openingPayments: 1,
            openingAllocatedAmount: '500000.00',
          },
          replayed: false,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(commitInvoiceImportJob(jobId)).resolves.toMatchObject({
      job: { status: 'COMMITTED' },
      reconciliation: { committedInvoices: 2 },
      replayed: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/imports/${jobId}/commit`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
