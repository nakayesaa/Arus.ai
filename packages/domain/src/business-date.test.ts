import { describe, expect, it } from 'vitest';

import { addCalendarDays, differenceInCalendarDays } from './business-date.js';

describe('business date arithmetic', () => {
  it('moves across month, year, and leap-day boundaries', () => {
    expect(addCalendarDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addCalendarDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addCalendarDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCalendarDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('remains the inverse of calendar-day difference', () => {
    const start = '2026-07-16';
    const result = addCalendarDays(start, 45);

    expect(differenceInCalendarDays(result, start)).toBe(45);
  });

  it('rejects fractional and unsafe offsets', () => {
    expect(() => addCalendarDays('2026-07-16', 1.5)).toThrowError(
      /safe integer/u,
    );
    expect(() =>
      addCalendarDays('2026-07-16', Number.MAX_SAFE_INTEGER + 1),
    ).toThrowError(/safe integer/u);
  });
});
