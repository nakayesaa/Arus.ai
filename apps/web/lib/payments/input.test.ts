import { describe, expect, it } from 'vitest';

import { canonicalPaymentInput, subtractPaymentAmount } from './input';

describe('payment amount input', () => {
  it.each([
    ['5000000', '5000000.00'],
    ['5.000.000', '5000000.00'],
    ['Rp 5.000.000', '5000000.00'],
    ['5000000,5', '5000000.50'],
    ['5000000.25', '5000000.25'],
    ['5.000', '5000.00'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(canonicalPaymentInput(input)).toBe(expected);
  });

  it.each(['', 'Rp', '-1', '5,000,000', '5000000,001', 'five million'])(
    'rejects ambiguous or unsafe input %s',
    (input) => {
      expect(canonicalPaymentInput(input)).toBeNull();
    },
  );

  it('subtracts exact decimal strings without floating point', () => {
    expect(subtractPaymentAmount('315000000.00', '5000000.00')).toBe(
      '310000000.00',
    );
    expect(subtractPaymentAmount('315000000.00', '315000000.01')).toBeNull();
  });
});
