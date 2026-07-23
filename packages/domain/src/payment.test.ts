import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { validatePaymentAllocation, validatePaymentDate } from './payment.js';

describe('payment allocation', () => {
  it('returns exact canonical before and after amounts', () => {
    expect(
      validatePaymentAllocation({
        amount: '5000000',
        outstandingAmount: '315000000.00',
      }),
    ).toEqual({
      amount: '5000000.00',
      outstandingBefore: '315000000.00',
      outstandingAfter: '310000000.00',
    });
  });

  it('allows an exact full payment', () => {
    expect(
      validatePaymentAllocation({
        amount: '315000000.00',
        outstandingAmount: '315000000.00',
      }).outstandingAfter,
    ).toBe('0.00');
  });

  it.each(['0', '0.00'])('rejects non-positive amount %s', (amount) => {
    expect(() =>
      validatePaymentAllocation({
        amount,
        outstandingAmount: '315000000.00',
      }),
    ).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'PAYMENT_AMOUNT_NOT_POSITIVE',
      }),
    );
  });

  it('rejects allocation above the current outstanding', () => {
    expect(() =>
      validatePaymentAllocation({
        amount: '315000000.01',
        outstandingAmount: '315000000.00',
      }),
    ).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'PAYMENT_EXCEEDS_OUTSTANDING',
      }),
    );
  });

  it('rejects payment against an already settled invoice', () => {
    expect(() =>
      validatePaymentAllocation({
        amount: '1.00',
        outstandingAmount: '0.00',
      }),
    ).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'INVOICE_ALREADY_PAID',
      }),
    );
  });

  it('does not accept localized or fractional-cent inputs', () => {
    for (const amount of ['5.000.000', '5000000.001', '-1.00']) {
      expect(() =>
        validatePaymentAllocation({
          amount,
          outstandingAmount: '315000000.00',
        }),
      ).toThrow(DomainError);
    }
  });
});

describe('payment date', () => {
  it.each(['2026-07-01', '2026-07-23'])(
    'accepts valid dates through the business date',
    (paymentDate) => {
      expect(validatePaymentDate({ paymentDate, asOfDate: '2026-07-23' })).toBe(
        paymentDate,
      );
    },
  );

  it('rejects future dates', () => {
    expect(() =>
      validatePaymentDate({
        paymentDate: '2026-07-24',
        asOfDate: '2026-07-23',
      }),
    ).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'PAYMENT_DATE_IN_FUTURE',
      }),
    );
  });

  it('rejects invalid calendar dates', () => {
    expect(() =>
      validatePaymentDate({
        paymentDate: '2026-02-30',
        asOfDate: '2026-07-23',
      }),
    ).toThrow(
      expect.objectContaining<Partial<DomainError>>({
        code: 'INVALID_BUSINESS_DATE',
      }),
    );
  });
});
