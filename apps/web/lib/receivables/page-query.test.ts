import { describe, expect, it } from 'vitest';

import {
  businessDateQuery,
  entityIdQuery,
  listPage,
  listSearch,
  supportedQueryValue,
} from './page-query';

describe('receivables page query', () => {
  it('normalizes bounded search and page values', () => {
    expect(listSearch({ search: '  Nusantara  ' })).toBe('Nusantara');
    expect(listSearch({ search: 'x'.repeat(201) })).toBeUndefined();
    expect(listPage({ page: '7' })).toBe(7);
    expect(listPage({ page: '-1' })).toBe(1);
  });

  it('accepts only real business dates and UUID entity filters', () => {
    expect(businessDateQuery({ asOfDate: '2026-07-16' })).toBe('2026-07-16');
    expect(businessDateQuery({ asOfDate: '2026-02-30' })).toBeUndefined();
    expect(
      entityIdQuery(
        { debtorId: '055d5b68-9e21-4e33-bd5e-10a19f8c0a15' },
        'debtorId',
      ),
    ).toBe('055d5b68-9e21-4e33-bd5e-10a19f8c0a15');
    expect(
      entityIdQuery({ debtorId: 'not-an-id' }, 'debtorId'),
    ).toBeUndefined();
  });

  it('accepts only explicitly supported enum filters', () => {
    const values = ['OPEN', 'PAID'] as const;
    expect(supportedQueryValue({ state: 'OPEN' }, 'state', values)).toBe(
      'OPEN',
    );
    expect(
      supportedQueryValue({ state: 'DISPUTED' }, 'state', values),
    ).toBeUndefined();
  });
});
