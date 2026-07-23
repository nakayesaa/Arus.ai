import { describe, expect, it } from 'vitest';

import {
  debtorListResponseSchema,
  invoiceDetailResponseSchema,
  receivablesQuery,
} from './contracts';

const debtorId = '055d5b68-9e21-4e33-bd5e-10a19f8c0a15';
const invoiceId = '60eb80e2-c2e6-409c-9d1a-abcc559c1c86';

describe('receivables contracts', () => {
  it('accepts an exact debtor list response', () => {
    const parsed = debtorListResponseSchema.parse({
      data: [
        {
          id: debtorId,
          code: 'NUS-01',
          name: 'PT Nusantara',
          contactName: 'Dewi',
          phoneNumber: null,
          email: 'dewi@example.com',
          createdAt: '2026-07-16T02:00:00.000Z',
          updatedAt: '2026-07-16T02:00:00.000Z',
          summary: {
            invoiceCount: 2,
            openInvoiceCount: 1,
            totalOutstanding: '135000000.00',
            overdueOutstanding: '135000000.00',
          },
        },
      ],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
      meta: { asOfDate: '2026-07-16' },
    });

    expect(parsed.data[0]?.summary.totalOutstanding).toBe('135000000.00');
  });

  it('rejects malformed money at the API boundary', () => {
    expect(() =>
      debtorListResponseSchema.parse({
        data: [
          {
            id: debtorId,
            code: null,
            name: 'PT Nusantara',
            contactName: null,
            phoneNumber: null,
            email: null,
            createdAt: '2026-07-16T02:00:00.000Z',
            updatedAt: '2026-07-16T02:00:00.000Z',
            summary: {
              invoiceCount: 1,
              openInvoiceCount: 1,
              totalOutstanding: '135000000',
              overdueOutstanding: '0.00',
            },
          },
        ],
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
        meta: { asOfDate: '2026-07-16' },
      }),
    ).toThrow();
  });

  it('accepts invoice allocation history and reversal evidence', () => {
    const parsed = invoiceDetailResponseSchema.parse({
      data: {
        id: invoiceId,
        debtor: { id: debtorId, code: null, name: 'PT Nusantara' },
        invoiceNumber: 'INV-001',
        invoiceDate: '2026-05-01',
        dueDate: '2026-05-31',
        originalAmount: '185000000.00',
        allocatedAmount: '50000000.00',
        outstandingAmount: '135000000.00',
        state: 'PARTIALLY_PAID',
        aging: {
          bucket: 'OVERDUE_31_60',
          daysToDue: -46,
          daysOverdue: 46,
          flags: ['OVERDUE'],
        },
        description: null,
        createdAt: '2026-05-01T02:00:00.000Z',
        updatedAt: '2026-07-16T02:00:00.000Z',
        allocations: [
          {
            id: '9088045d-1476-4d86-8b65-73e419e81cc5',
            amount: '50000000.00',
            allocationDate: '2026-06-20',
            reversedAt: null,
            reversalReason: null,
            payment: {
              id: 'fe056d45-a08f-4c47-9bac-d94423f5070b',
              paymentDate: '2026-06-20',
              amount: '50000000.00',
              payerReference: 'PT Nusantara transfer 20 June',
              bankReference: 'BCA-REF-1',
              isOpeningBalance: false,
            },
          },
        ],
        communications: [
          {
            id: '484d170a-e4cd-4936-837b-1719c0910139',
            occurredAt: '2026-07-15T03:30:00.000Z',
            channel: 'CALL',
            notes: 'Accounts payable confirmed review.',
            nextFollowUpDate: '2026-07-17',
            actor: {
              id: '59665926-cb08-47de-87ad-bc28b2cf05ae',
              name: 'Alya Putri',
              role: 'OPERATOR',
            },
            createdAt: '2026-07-15T03:30:00.000Z',
            updatedAt: '2026-07-15T03:30:00.000Z',
          },
        ],
        promises: [
          {
            id: '799cf6df-4c9d-4f55-b38e-dde42f5b817b',
            amount: '40000000.00',
            promiseDate: '2026-07-20',
            status: 'ACTIVE',
            fulfilledAt: null,
            cancelledAt: null,
            cancelReason: null,
            createdBy: {
              id: '59665926-cb08-47de-87ad-bc28b2cf05ae',
              name: 'Alya Putri',
              role: 'OPERATOR',
            },
            cancelledBy: null,
            createdAt: '2026-07-15T03:30:00.000Z',
            updatedAt: '2026-07-15T03:30:00.000Z',
          },
        ],
        disputes: [
          {
            id: 'ec5f7ebd-73f1-48c4-b234-d39e1210c9cb',
            category: 'WRONG_AMOUNT',
            details: 'Customer reported a tax mismatch.',
            status: 'OPEN',
            resolutionNote: null,
            createdBy: {
              id: '59665926-cb08-47de-87ad-bc28b2cf05ae',
              name: 'Alya Putri',
              role: 'OPERATOR',
            },
            resolvedBy: null,
            resolvedAt: null,
            createdAt: '2026-07-15T03:30:00.000Z',
            updatedAt: '2026-07-15T03:30:00.000Z',
          },
        ],
        nextFollowUpSuggestion: {
          date: '2026-07-17',
          basis: 'STANDARD_NEXT_DAY',
        },
      },
      meta: {
        asOfDate: '2026-07-16',
        workflowBusinessDate: '2026-07-16',
        timeZone: 'Asia/Jakarta',
      },
    });

    expect(parsed.data.allocations[0]?.payment.payerReference).toBe(
      'PT Nusantara transfer 20 June',
    );
    expect(parsed.data.allocations[0]?.payment.bankReference).toBe('BCA-REF-1');
    expect(parsed.data.communications[0]?.actor.role).toBe('OPERATOR');
    expect(parsed.data.promises[0]?.status).toBe('ACTIVE');
    expect(parsed.data.disputes[0]?.status).toBe('OPEN');
  });

  it('serializes only normalized supported list filters', () => {
    expect(
      receivablesQuery({
        search: '  Nusantara  ',
        state: 'OPEN',
        agingBucket: 'OVERDUE_8_30',
        asOfDate: '2026-07-16',
        page: 2,
        limit: 25,
      }),
    ).toBe(
      'search=Nusantara&asOfDate=2026-07-16&state=OPEN&agingBucket=OVERDUE_8_30&page=2&limit=25',
    );
  });
});
