import { describe, expect, it } from 'vitest';

import { calculateDashboardMetrics } from './dashboard.js';

describe('dashboard metrics', () => {
  it('reconciles AR, overdue, and aging from non-reversed allocations', () => {
    const result = calculateDashboardMetrics({
      asOfDate: '2026-07-16',
      invoices: [
        invoice('185000000.00', '2026-05-30', [
          { amount: '50000000.00', reversed: false },
        ]),
        invoice('315000000.00', '2026-07-15'),
        invoice('90000000.00', '2026-07-23'),
        invoice('50000000.00', '2026-04-16', [
          { amount: '50000000.00', reversed: false },
        ]),
        invoice('75000000.00', '2026-07-09', [
          { amount: '10000000.00', reversed: true },
        ]),
      ],
    });

    expect(result).toEqual({
      totalAr: '615000000.00',
      totalOverdue: '525000000.00',
      overduePercent: '85.37',
      openInvoiceCount: 4,
      overdueInvoiceCount: 3,
      aging: [
        {
          bucket: 'CURRENT',
          invoiceCount: 1,
          outstandingAmount: '90000000.00',
        },
        {
          bucket: 'OVERDUE_1_7',
          invoiceCount: 2,
          outstandingAmount: '390000000.00',
        },
        {
          bucket: 'OVERDUE_8_30',
          invoiceCount: 0,
          outstandingAmount: '0.00',
        },
        {
          bucket: 'OVERDUE_31_60',
          invoiceCount: 1,
          outstandingAmount: '135000000.00',
        },
        {
          bucket: 'OVERDUE_61_90',
          invoiceCount: 0,
          outstandingAmount: '0.00',
        },
        {
          bucket: 'OVERDUE_90_PLUS',
          invoiceCount: 0,
          outstandingAmount: '0.00',
        },
      ],
    });
  });

  it('returns an exact zero-state without dividing by zero', () => {
    expect(
      calculateDashboardMetrics({ invoices: [], asOfDate: '2026-07-16' }),
    ).toEqual({
      totalAr: '0.00',
      totalOverdue: '0.00',
      overduePercent: '0.00',
      openInvoiceCount: 0,
      overdueInvoiceCount: 0,
      aging: [
        {
          bucket: 'CURRENT',
          invoiceCount: 0,
          outstandingAmount: '0.00',
        },
        {
          bucket: 'OVERDUE_1_7',
          invoiceCount: 0,
          outstandingAmount: '0.00',
        },
        {
          bucket: 'OVERDUE_8_30',
          invoiceCount: 0,
          outstandingAmount: '0.00',
        },
        {
          bucket: 'OVERDUE_31_60',
          invoiceCount: 0,
          outstandingAmount: '0.00',
        },
        {
          bucket: 'OVERDUE_61_90',
          invoiceCount: 0,
          outstandingAmount: '0.00',
        },
        {
          bucket: 'OVERDUE_90_PLUS',
          invoiceCount: 0,
          outstandingAmount: '0.00',
        },
      ],
    });
  });
});

function invoice(
  originalAmount: string,
  dueDate: string,
  allocations: Array<{ amount: string; reversed: boolean }> = [],
) {
  return { originalAmount, dueDate, allocations };
}
