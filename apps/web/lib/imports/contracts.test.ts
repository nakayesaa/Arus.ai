import { describe, expect, it } from 'vitest';

import {
  importJobEnvelopeSchema,
  importRowsResponseSchema,
  invoiceImportRowsQuery,
} from './contracts';

const jobId = 'ca791d48-b39b-4c4c-85de-9a58e9390331';
const rowId = '11fd1edc-d36a-4d7a-9c4e-f59b70474181';

describe('invoice import contracts', () => {
  it('accepts a READY preview with stable counts and warnings', () => {
    const parsed = importJobEnvelopeSchema.parse({
      data: readyJob(),
    });

    expect(parsed.data).toMatchObject({
      status: 'READY',
      counts: { total: 5, valid: 2, invalid: 2, duplicate: 1, warning: 1 },
      fileWarnings: [{ code: 'UNKNOWN_COLUMN', field: 'header' }],
    });
  });

  it('accepts normalized preview rows without coercing money', () => {
    const parsed = importRowsResponseSchema.parse({
      data: [previewRow()],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });

    expect(parsed.data[0]?.payload.originalAmount).toBe('1500000.50');
    expect(parsed.data[0]?.debtor.action).toBe('WILL_CREATE');
  });

  it('rejects malformed monetary payloads at the browser boundary', () => {
    expect(() =>
      importRowsResponseSchema.parse({
        data: [
          {
            ...previewRow(),
            payload: {
              ...previewRow().payload,
              originalAmount: '1500000.5',
            },
          },
        ],
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
      }),
    ).toThrow();
  });

  it('serializes only supported row filters', () => {
    expect(
      invoiceImportRowsQuery({
        result: 'INVALID',
        page: 2,
        limit: 25,
      }),
    ).toBe('page=2&limit=25&result=INVALID');
  });
});

function readyJob() {
  return {
    id: jobId,
    filename: 'mixed-preview.csv',
    fileHash: 'a'.repeat(64),
    status: 'READY',
    counts: { total: 5, valid: 2, invalid: 2, duplicate: 1, warning: 1 },
    fileWarnings: [
      {
        code: 'UNKNOWN_COLUMN',
        field: 'header',
        message: 'Unknown column ignored: source_system',
      },
    ],
    failure: null,
    committedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-21T03:00:00.000Z',
    updatedAt: '2026-07-21T03:00:01.000Z',
  };
}

function previewRow() {
  return {
    id: rowId,
    rowNumber: 2,
    result: 'VALID',
    payload: {
      customerCode: 'CUST-100',
      normalizedCustomerCode: 'cust-100',
      customerName: 'PT Cahaya Nusantara',
      normalizedCustomerName: 'pt cahaya nusantara',
      contactName: null,
      phoneNumber: null,
      email: null,
      invoiceNumber: 'INV-2026-100',
      normalizedInvoiceNumber: 'inv-2026-100',
      invoiceDate: '2026-07-01',
      dueDate: '2026-07-31',
      originalAmount: '1500000.50',
      paidAmount: '0.00',
      declaredOutstandingAmount: '1500000.50',
      calculatedOutstandingAmount: '1500000.50',
      salesperson: null,
      branch: null,
      notes: null,
    },
    errors: [],
    warnings: [],
    debtor: { action: 'WILL_CREATE', matchedDebtorId: null },
    committedInvoiceId: null,
    createdAt: '2026-07-21T03:00:01.000Z',
    updatedAt: '2026-07-21T03:00:01.000Z',
  };
}
