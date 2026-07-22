import { describe, expect, it } from 'vitest';

import {
  businessDateInTimeZone,
  startOfBusinessDateInTimeZone,
} from './business-date.js';

describe('business timezone boundaries', () => {
  it('resolves midnight for a fixed-offset tenant', () => {
    const result = startOfBusinessDateInTimeZone('2026-07-16', 'Asia/Jakarta');

    expect(result.toISOString()).toBe('2026-07-15T17:00:00.000Z');
    expect(businessDateInTimeZone(result, 'Asia/Jakarta')).toBe('2026-07-16');
  });

  it('uses the offset active on each side of a daylight-saving boundary', () => {
    expect(
      startOfBusinessDateInTimeZone(
        '2026-11-01',
        'America/New_York',
      ).toISOString(),
    ).toBe('2026-11-01T04:00:00.000Z');
    expect(
      startOfBusinessDateInTimeZone(
        '2026-11-02',
        'America/New_York',
      ).toISOString(),
    ).toBe('2026-11-02T05:00:00.000Z');
  });

  it('rejects invalid calendar dates before calculating an instant', () => {
    expect(() =>
      startOfBusinessDateInTimeZone('2026-02-30', 'Asia/Jakarta'),
    ).toThrowError();
  });
});
