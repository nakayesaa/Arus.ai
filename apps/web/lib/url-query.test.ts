import { describe, expect, it } from 'vitest';

import { buildUrl, positiveInteger, queryValue } from './url-query';

describe('URL query utilities', () => {
  it('reads only one normalized scalar value', () => {
    expect(queryValue({ search: '  Acme  ' }, 'search')).toBe('Acme');
    expect(queryValue({ search: ['one', 'two'] }, 'search')).toBeUndefined();
  });

  it('bounds positive integers', () => {
    expect(positiveInteger('3', 1, 100)).toBe(3);
    expect(positiveInteger('0', 1, 100)).toBe(1);
    expect(positiveInteger('101', 1, 100)).toBe(1);
    expect(positiveInteger('1.5', 1, 100)).toBe(1);
  });

  it('preserves current filters while applying explicit changes', () => {
    expect(
      buildUrl(
        '/invoices',
        { search: 'Acme', page: '3', ignored: ['bad'] },
        { page: 1, state: 'OPEN', search: null },
      ),
    ).toBe('/invoices?page=1&state=OPEN');
  });
});
