import { describe, expect, it } from 'vitest';

import {
  formatBusinessDate,
  formatCompactNumber,
  formatDuePosition,
  formatRupiah,
  formatTimestamp,
  humanizeEnum,
  initials,
} from './formatters';

describe('formatRupiah', () => {
  it.each([
    ['0.00', 'Rp\u00a00'],
    ['1500000.00', 'Rp\u00a01.500.000'],
    ['1500000.50', 'Rp\u00a01.500.000,50'],
    ['9999999999999999.99', 'Rp\u00a09.999.999.999.999.999,99'],
  ])('formats %s without floating-point conversion', (input, expected) => {
    expect(formatRupiah(input)).toBe(expected);
  });

  it('rejects non-canonical money', () => {
    expect(() => formatRupiah('1.5')).toThrow('Invalid canonical money');
  });
});

describe('display formatters', () => {
  it('formats a business date without timezone drift', () => {
    expect(formatBusinessDate('2026-07-01')).toBe('1 Jul 2026');
    expect(() => formatBusinessDate('2026-02-30')).toThrow(
      'Invalid business date',
    );
  });

  it('formats activity timestamps in the tenant timezone', () => {
    const result = formatTimestamp('2026-07-16T03:30:00.000Z', 'Asia/Jakarta');

    expect(result).toContain('16 Jul 2026');
    expect(result).toContain('10.30');
  });

  it('formats safe counts and rejects unsafe values', () => {
    expect(formatCompactNumber(10_000)).toBe('10.000');
    expect(() => formatCompactNumber(-1)).toThrow();
  });

  it('derives stable initials and human-readable enum labels', () => {
    expect(initials('PT Sinar Abadi Retail')).toBe('PR');
    expect(initials('')).toBe('—');
    expect(humanizeEnum('PARTIALLY_PAID')).toBe('Partially paid');
  });

  it('describes exact invoice due positions', () => {
    expect(formatDuePosition({ daysToDue: 1, daysOverdue: 0 })).toBe(
      'Due tomorrow',
    );
    expect(formatDuePosition({ daysToDue: -1, daysOverdue: 1 })).toBe(
      '1 day overdue',
    );
    expect(formatDuePosition({ daysToDue: -46, daysOverdue: 46 })).toBe(
      '46 days overdue',
    );
  });
});
