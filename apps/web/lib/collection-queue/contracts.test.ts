import { describe, expect, it } from 'vitest';

import {
  collectionQueueQuery,
  collectionQueueResponseSchema,
} from './contracts';

describe('collection queue contracts', () => {
  it('accepts exact score evidence and deterministic pagination', () => {
    const parsed = collectionQueueResponseSchema.parse({
      data: [
        {
          id: '30000000-0000-4000-8000-000000000002',
          invoiceNumber: 'INV-2026-0074',
          debtor: {
            id: '20000000-0000-4000-8000-000000000002',
            code: 'CUST-002',
            name: 'PT Cipta Pangan Indonesia',
          },
          dueDate: '2026-07-15',
          outstandingAmount: '315000000.00',
          state: 'OPEN',
          aging: {
            bucket: 'OVERDUE_1_7',
            daysToDue: -1,
            daysOverdue: 1,
          },
          lastContactDate: null,
          lastContactAt: null,
          nextFollowUpDate: null,
          promiseStatus: null,
          hasOpenDispute: false,
          daysSinceLastContact: 30,
          reasons: ['OVERDUE'],
          priority: {
            score: '487.60',
            components: {
              amount: '472.50',
              aging: '0.10',
              stale: '15.00',
              promise: '0.00',
              dueSoon: '0.00',
            },
          },
        },
      ],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
      meta: { asOfDate: '2026-07-16' },
    });

    expect(parsed.data[0]?.priority.score).toBe('487.60');
    expect(parsed.data[0]?.reasons).toEqual(['OVERDUE']);
  });

  it('rejects float scores and undisclosed sorting fields', () => {
    expect(() =>
      collectionQueueResponseSchema.parse({
        data: [
          {
            id: '30000000-0000-4000-8000-000000000002',
            invoiceNumber: 'INV-1',
            debtor: {
              id: '20000000-0000-4000-8000-000000000002',
              code: null,
              name: 'Debtor',
            },
            dueDate: '2026-07-15',
            outstandingAmount: '1.00',
            state: 'OPEN',
            aging: {
              bucket: 'OVERDUE_1_7',
              daysToDue: -1,
              daysOverdue: 1,
            },
            lastContactDate: null,
            lastContactAt: null,
            nextFollowUpDate: null,
            promiseStatus: null,
            hasOpenDispute: false,
            daysSinceLastContact: 30,
            reasons: ['OVERDUE'],
            priority: {
              score: 15.1,
              scoreBasis: 'internal',
              components: {
                amount: '0.00',
                aging: '0.10',
                stale: '15.00',
                promise: '0.00',
                dueSoon: '0.00',
              },
            },
          },
        ],
        pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
        meta: { asOfDate: '2026-07-16' },
      }),
    ).toThrow();
  });

  it('builds a stable server query', () => {
    expect(
      collectionQueueQuery({
        asOfDate: '2026-07-16',
        page: 2,
        limit: 25,
      }),
    ).toBe('page=2&limit=25&asOfDate=2026-07-16');
  });
});
