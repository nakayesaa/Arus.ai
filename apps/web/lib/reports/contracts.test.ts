import { describe, expect, it } from 'vitest';

import { weeklyReportResponseSchema } from './contracts';

describe('weeklyReportResponseSchema', () => {
  it('accepts the strict weekly report contract', () => {
    expect(
      weeklyReportResponseSchema.parse({
        data: {
          reportId: 'a0000000-0000-4000-8000-000000000001',
          period: {
            from: '2026-07-17',
            to: '2026-07-23',
            inclusiveDayCount: 7,
          },
          generatedAt: '2026-07-23T08:00:00.000Z',
          timeZone: 'Asia/Jakarta',
          summary: {
            totalAr: '1000.00',
            totalOverdue: '750.00',
            overduePercent: '75.00',
            openInvoiceCount: 2,
            overdueInvoiceCount: 1,
          },
          collections: { amount: '250.00', allocationCount: 1 },
          aging: aging(),
          promises: {
            active: { count: 1, amount: '300.00' },
            broken: { count: 0, amount: '0.00' },
            keptInPeriod: { count: 1, amount: '250.00' },
          },
          disputes: {
            openInvoiceCount: 1,
            outstandingAmount: '750.00',
          },
          priorityOverdue: [],
        },
      }),
    ).toBeTruthy();
  });

  it('rejects unbounded report payloads', () => {
    const result = weeklyReportResponseSchema.safeParse({
      data: {
        reportId: 'a0000000-0000-4000-8000-000000000001',
        period: {
          from: '2026-07-17',
          to: '2026-07-23',
          inclusiveDayCount: 7,
        },
        generatedAt: '2026-07-23T08:00:00.000Z',
        timeZone: 'Asia/Jakarta',
        summary: {
          totalAr: '1000.00',
          totalOverdue: '750.00',
          overduePercent: '75.00',
          openInvoiceCount: 2,
          overdueInvoiceCount: 1,
        },
        collections: { amount: '250.00', allocationCount: 1 },
        aging: aging(),
        promises: {
          active: { count: 1, amount: '300.00' },
          broken: { count: 0, amount: '0.00' },
          keptInPeriod: { count: 1, amount: '250.00' },
        },
        disputes: {
          openInvoiceCount: 1,
          outstandingAmount: '750.00',
        },
        priorityOverdue: Array.from({ length: 9 }, (_, index) => ({
          id: `a0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          invoiceNumber: `INV-${index}`,
          debtor: {
            id: `b0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            code: null,
            name: 'Debtor',
          },
          dueDate: '2026-07-01',
          daysOverdue: 22,
          outstandingAmount: '100.00',
          agingBucket: 'OVERDUE_8_30',
        })),
      },
    });

    expect(result.success).toBe(false);
  });
});

function aging() {
  return [
    'CURRENT',
    'OVERDUE_1_7',
    'OVERDUE_8_30',
    'OVERDUE_31_60',
    'OVERDUE_61_90',
    'OVERDUE_90_PLUS',
  ].map((bucket) => ({
    bucket,
    invoiceCount: bucket === 'CURRENT' ? 1 : 0,
    outstandingAmount: bucket === 'CURRENT' ? '250.00' : '0.00',
  }));
}
