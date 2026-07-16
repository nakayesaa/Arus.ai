import { describe, expect, it } from 'vitest';

import {
  differenceInCalendarDays,
  parseBusinessDate,
} from './business-date.js';
import { DomainError } from './errors.js';
import {
  AgingBucket,
  calculateInvoiceAging,
  calculateInvoiceFinancials,
  calculateInvoiceSnapshot,
  InvoiceFlag,
  InvoiceState,
} from './invoice.js';

describe('invoice financials', () => {
  it('derives open, partial, and paid states from non-reversed allocations', () => {
    expect(
      calculateInvoiceFinancials({
        originalAmount: '185000000.00',
        allocations: [],
      }),
    ).toEqual({
      originalAmount: '185000000.00',
      allocatedAmount: '0.00',
      outstandingAmount: '185000000.00',
      state: InvoiceState.OPEN,
    });

    expect(
      calculateInvoiceFinancials({
        originalAmount: '185000000.00',
        allocations: [
          { amount: '50000000.00', reversed: false },
          { amount: '25000000.00', reversed: true },
        ],
      }),
    ).toMatchObject({
      allocatedAmount: '50000000.00',
      outstandingAmount: '135000000.00',
      state: InvoiceState.PARTIALLY_PAID,
    });

    expect(
      calculateInvoiceFinancials({
        originalAmount: '185000000.00',
        allocations: [{ amount: '185000000.00', reversed: false }],
      }),
    ).toMatchObject({
      allocatedAmount: '185000000.00',
      outstandingAmount: '0.00',
      state: InvoiceState.PAID,
    });
  });

  it.each([
    {
      originalAmount: '0.00',
      allocations: [],
      code: 'ORIGINAL_AMOUNT_NOT_POSITIVE',
    },
    {
      originalAmount: '10.00',
      allocations: [{ amount: '0.00', reversed: false }],
      code: 'ALLOCATION_NOT_POSITIVE',
    },
    {
      originalAmount: '10.00',
      allocations: [{ amount: '10.01', reversed: false }],
      code: 'OVER_ALLOCATED',
    },
  ] as const)('rejects $code', ({ code, ...input }) => {
    expectDomainError(() => calculateInvoiceFinancials(input), code);
  });
});

describe('invoice aging', () => {
  const asOfDate = '2026-07-16';

  it.each([
    ['2026-07-23', AgingBucket.CURRENT, 7, 0, [InvoiceFlag.DUE_SOON]],
    ['2026-07-17', AgingBucket.CURRENT, 1, 0, [InvoiceFlag.DUE_SOON]],
    ['2026-07-16', AgingBucket.CURRENT, 0, 0, [InvoiceFlag.DUE_TODAY]],
    ['2026-07-15', AgingBucket.OVERDUE_1_7, -1, 1, [InvoiceFlag.OVERDUE]],
    ['2026-07-09', AgingBucket.OVERDUE_1_7, -7, 7, [InvoiceFlag.OVERDUE]],
    ['2026-07-08', AgingBucket.OVERDUE_8_30, -8, 8, [InvoiceFlag.OVERDUE]],
    ['2026-06-16', AgingBucket.OVERDUE_8_30, -30, 30, [InvoiceFlag.OVERDUE]],
    ['2026-06-15', AgingBucket.OVERDUE_31_60, -31, 31, [InvoiceFlag.OVERDUE]],
    ['2026-05-17', AgingBucket.OVERDUE_31_60, -60, 60, [InvoiceFlag.OVERDUE]],
    ['2026-05-16', AgingBucket.OVERDUE_61_90, -61, 61, [InvoiceFlag.OVERDUE]],
    ['2026-04-17', AgingBucket.OVERDUE_61_90, -90, 90, [InvoiceFlag.OVERDUE]],
    ['2026-04-16', AgingBucket.OVERDUE_90_PLUS, -91, 91, [InvoiceFlag.OVERDUE]],
  ] as const)(
    'places due date %s in %s',
    (dueDate, bucket, daysToDue, daysOverdue, flags) => {
      expect(
        calculateInvoiceAging({
          dueDate,
          asOfDate,
          outstandingAmount: '1.00',
        }),
      ).toEqual({ bucket, daysToDue, daysOverdue, flags: [...flags] });
    },
  );

  it('retains historical aging but does not flag a paid invoice as overdue', () => {
    expect(
      calculateInvoiceAging({
        dueDate: '2026-05-30',
        asOfDate,
        outstandingAmount: '0.00',
      }),
    ).toEqual({
      bucket: AgingBucket.OVERDUE_31_60,
      daysToDue: -47,
      daysOverdue: 47,
      flags: [],
    });
  });

  it('combines exact financial and aging results in one snapshot', () => {
    expect(
      calculateInvoiceSnapshot({
        originalAmount: '185000000.00',
        allocations: [{ amount: '50000000.00', reversed: false }],
        dueDate: '2026-05-30',
        asOfDate,
      }),
    ).toMatchObject({
      outstandingAmount: '135000000.00',
      state: InvoiceState.PARTIALLY_PAID,
      aging: {
        bucket: AgingBucket.OVERDUE_31_60,
        daysOverdue: 47,
        flags: [InvoiceFlag.OVERDUE],
      },
    });
  });
});

describe('business dates', () => {
  it('validates leap days and computes calendar differences without timezone drift', () => {
    expect(parseBusinessDate('2024-02-29')).toBe('2024-02-29');
    expect(differenceInCalendarDays('2024-03-01', '2024-02-28')).toBe(2);
    expectDomainError(
      () => parseBusinessDate('2026-02-29'),
      'INVALID_BUSINESS_DATE',
    );
    expectDomainError(
      () => parseBusinessDate('31/12/2026'),
      'INVALID_BUSINESS_DATE',
    );
  });
});

function expectDomainError(action: () => unknown, code: DomainError['code']) {
  try {
    action();
    throw new Error('Expected domain error');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
  }
}
