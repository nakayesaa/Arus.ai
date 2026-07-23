import { describe, expect, it } from 'vitest';

import { reportPeriodQuery } from './page-query';

describe('reportPeriodQuery', () => {
  it('returns a complete valid period', () => {
    expect(reportPeriodQuery({ from: '2026-07-17', to: '2026-07-23' })).toEqual(
      { from: '2026-07-17', to: '2026-07-23' },
    );
  });

  it.each([
    {},
    { from: '2026-07-17' },
    { from: 'not-a-date', to: '2026-07-23' },
    { from: ['2026-07-17'], to: '2026-07-23' },
  ])('falls back to the server default for incomplete input', (query) => {
    expect(reportPeriodQuery(query)).toBeUndefined();
  });
});
