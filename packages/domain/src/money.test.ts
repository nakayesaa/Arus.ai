import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { formatMoney, MAX_MONEY_MINOR_UNITS, parseMoney } from './money.js';

describe('canonical money', () => {
  it.each([
    ['0', 0n, '0.00'],
    ['1', 100n, '1.00'],
    ['1.2', 120n, '1.20'],
    ['1.23', 123n, '1.23'],
    ['0001.20', 120n, '1.20'],
    ['00000000000000001.20', 120n, '1.20'],
    ['9999999999999999.99', MAX_MONEY_MINOR_UNITS, '9999999999999999.99'],
  ])('parses %s exactly', (input, minorUnits, canonical) => {
    expect(parseMoney(input)).toBe(minorUnits);
    expect(formatMoney(minorUnits)).toBe(canonical);
  });

  it.each([
    '',
    ' 1.00',
    '1.00 ',
    '-1',
    '+1',
    '.50',
    '1.',
    '1.234',
    '1e3',
    'NaN',
    'Infinity',
  ])('rejects non-canonical value %j', (input) => {
    expectDomainError(() => parseMoney(input), 'INVALID_MONEY');
  });

  it('rejects amounts outside the database precision', () => {
    expectDomainError(
      () => parseMoney('10000000000000000.00'),
      'MONEY_OUT_OF_RANGE',
    );
    expectDomainError(() => formatMoney(-1n), 'MONEY_OUT_OF_RANGE');
  });

  it('formats non-negative aggregate totals beyond one database column', () => {
    expect(formatMoney(MAX_MONEY_MINOR_UNITS + 1n)).toBe(
      '10000000000000000.00',
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
