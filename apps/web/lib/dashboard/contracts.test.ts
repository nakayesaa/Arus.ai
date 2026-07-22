import { describe, expect, it } from 'vitest';

import { dashboardResponseSchema } from './contracts';

describe('dashboard contracts', () => {
  it('accepts exact financial metrics without coercing money', () => {
    const parsed = dashboardResponseSchema.parse({
      data: {
        summary: {
          totalAr: '615000000.00',
          totalOverdue: '525000000.00',
          overduePercent: '85.37',
          openInvoiceCount: 4,
          overdueInvoiceCount: 3,
        },
        aging: [
          aging('CURRENT', 1, '90000000.00'),
          aging('OVERDUE_1_7', 2, '390000000.00'),
          aging('OVERDUE_8_30', 0, '0.00'),
          aging('OVERDUE_31_60', 1, '135000000.00'),
          aging('OVERDUE_61_90', 0, '0.00'),
          aging('OVERDUE_90_PLUS', 0, '0.00'),
        ],
        largestOverdue: [
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
            daysOverdue: 1,
            agingBucket: 'OVERDUE_1_7',
          },
        ],
        workflows: { brokenPromiseCount: 1, openDisputeCount: 2 },
      },
      meta: { asOfDate: '2026-07-16' },
    });

    expect(parsed.data.summary.totalAr).toBe('615000000.00');
    expect(parsed.data.aging).toHaveLength(6);
    expect(parsed.data.workflows).toEqual({
      brokenPromiseCount: 1,
      openDisputeCount: 2,
    });
  });

  it('rejects rounded or abbreviated money strings', () => {
    expect(() =>
      dashboardResponseSchema.parse({
        data: {
          summary: {
            totalAr: '615m',
            totalOverdue: '0.00',
            overduePercent: '0.00',
            openInvoiceCount: 0,
            overdueInvoiceCount: 0,
          },
          aging: [],
          largestOverdue: [],
          workflows: { brokenPromiseCount: 0, openDisputeCount: 0 },
        },
        meta: { asOfDate: '2026-07-16' },
      }),
    ).toThrow();
  });
});

function aging(
  bucket:
    | 'CURRENT'
    | 'OVERDUE_1_7'
    | 'OVERDUE_8_30'
    | 'OVERDUE_31_60'
    | 'OVERDUE_61_90'
    | 'OVERDUE_90_PLUS',
  invoiceCount: number,
  outstandingAmount: string,
) {
  return { bucket, invoiceCount, outstandingAmount };
}
