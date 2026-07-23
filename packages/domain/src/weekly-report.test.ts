import { describe, expect, it } from 'vitest';

import { calculateWeeklyReport } from './weekly-report.js';

describe('calculateWeeklyReport', () => {
  it('reconciles end exposure, period collections, workflows, and aging', () => {
    const report = calculateWeeklyReport({
      from: '2026-07-17',
      to: '2026-07-23',
      invoices: [
        invoice({
          id: 'invoice-a',
          invoiceNumber: 'INV-A',
          invoiceDate: '2026-06-01',
          dueDate: '2026-07-20',
          originalAmount: '1000.00',
          allocations: [
            {
              amount: '250.00',
              allocationDate: '2026-07-18',
              reversalDate: null,
            },
          ],
        }),
        invoice({
          id: 'invoice-b',
          invoiceNumber: 'INV-B',
          invoiceDate: '2026-04-01',
          dueDate: '2026-04-20',
          originalAmount: '500.00',
          allocations: [],
        }),
        invoice({
          id: 'invoice-c',
          invoiceNumber: 'INV-C',
          invoiceDate: '2026-07-01',
          dueDate: '2026-08-01',
          originalAmount: '300.00',
          allocations: [
            {
              amount: '300.00',
              allocationDate: '2026-07-17',
              reversalDate: null,
            },
          ],
        }),
      ],
      promises: [
        promise({ amount: '200.00', promiseDate: '2026-07-25' }),
        promise({ amount: '125.00', promiseDate: '2026-07-16' }),
        promise({
          amount: '80.00',
          promiseDate: '2026-07-18',
          fulfilledDate: '2026-07-19',
        }),
      ],
      disputes: [
        {
          invoiceId: 'invoice-a',
          createdDate: '2026-07-18',
          resolvedDate: null,
        },
        {
          invoiceId: 'invoice-a',
          createdDate: '2026-07-19',
          resolvedDate: null,
        },
      ],
    });

    expect(report).toMatchObject({
      summary: {
        totalAr: '1250.00',
        totalOverdue: '1250.00',
        overduePercent: '100.00',
        openInvoiceCount: 2,
        overdueInvoiceCount: 2,
      },
      collections: { amount: '550.00', allocationCount: 2 },
      promises: {
        active: { count: 1, amount: '200.00' },
        broken: { count: 1, amount: '125.00' },
        keptInPeriod: { count: 1, amount: '80.00' },
      },
      disputes: { openInvoiceCount: 1, outstandingAmount: '750.00' },
    });
    expect(
      Object.fromEntries(
        report.aging.map((metric) => [
          metric.bucket,
          metric.outstandingAmount,
        ]),
      ),
    ).toMatchObject({
      OVERDUE_1_7: '750.00',
      OVERDUE_90_PLUS: '500.00',
    });
    expect(report.priorityOverdue.map(({ id }) => id)).toEqual([
      'invoice-a',
      'invoice-b',
    ]);
  });

  it('uses the report end date for reversals and historical workflow states', () => {
    const report = calculateWeeklyReport({
      from: '2026-07-17',
      to: '2026-07-23',
      invoices: [
        invoice({
          id: 'invoice-a',
          invoiceNumber: 'INV-A',
          invoiceDate: '2026-07-01',
          dueDate: '2026-07-10',
          originalAmount: '1000.00',
          allocations: [
            {
              amount: '400.00',
              allocationDate: '2026-07-18',
              reversalDate: '2026-07-24',
            },
            {
              amount: '100.00',
              allocationDate: '2026-07-20',
              reversalDate: '2026-07-23',
            },
          ],
        }),
      ],
      promises: [
        promise({
          amount: '300.00',
          promiseDate: '2026-07-22',
          fulfilledDate: '2026-07-24',
        }),
        promise({
          amount: '100.00',
          promiseDate: '2026-07-30',
          cancelledDate: '2026-07-24',
        }),
        promise({
          amount: '50.00',
          promiseDate: '2026-07-20',
          createdDate: '2026-07-24',
        }),
      ],
      disputes: [
        {
          invoiceId: 'invoice-a',
          createdDate: '2026-07-20',
          resolvedDate: '2026-07-24',
        },
      ],
    });

    expect(report.summary.totalAr).toBe('600.00');
    expect(report.collections).toEqual({
      amount: '400.00',
      allocationCount: 1,
    });
    expect(report.promises).toEqual({
      active: { count: 1, amount: '100.00' },
      broken: { count: 1, amount: '300.00' },
      keptInPeriod: { count: 0, amount: '0.00' },
    });
    expect(report.disputes).toEqual({
      openInvoiceCount: 1,
      outstandingAmount: '600.00',
    });
  });

  it('returns reconciled zero values for an empty workspace', () => {
    const report = calculateWeeklyReport({
      from: '2026-07-17',
      to: '2026-07-23',
      invoices: [],
      promises: [],
      disputes: [],
    });

    expect(report.summary).toEqual({
      totalAr: '0.00',
      totalOverdue: '0.00',
      overduePercent: '0.00',
      openInvoiceCount: 0,
      overdueInvoiceCount: 0,
    });
    expect(report.collections.amount).toBe('0.00');
    expect(report.aging).toHaveLength(6);
    expect(report.priorityOverdue).toEqual([]);
  });
});

function invoice(
  values: Omit<
    Parameters<typeof calculateWeeklyReport>[0]['invoices'][number],
    'debtor'
  >,
): Parameters<typeof calculateWeeklyReport>[0]['invoices'][number] {
  return {
    ...values,
    debtor: { id: `debtor-${values.id}`, code: null, name: values.id },
  };
}

function promise(
  values: Partial<
    Parameters<typeof calculateWeeklyReport>[0]['promises'][number]
  > & { amount: string; promiseDate: string },
): Parameters<typeof calculateWeeklyReport>[0]['promises'][number] {
  return {
    createdDate: '2026-07-15',
    fulfilledDate: null,
    cancelledDate: null,
    ...values,
  };
}
