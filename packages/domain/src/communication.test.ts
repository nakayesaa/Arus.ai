import { describe, expect, it } from 'vitest';

import {
  suggestNextFollowUp,
  validateNextFollowUpDate,
} from './communication.js';

describe('communication follow-up rules', () => {
  it('suggests the next calendar day without an active promise', () => {
    expect(suggestNextFollowUp({ asOfDate: '2028-02-28' })).toEqual({
      date: '2028-02-29',
      basis: 'STANDARD_NEXT_DAY',
    });
  });

  it('suggests one day before an active promise', () => {
    expect(
      suggestNextFollowUp({
        asOfDate: '2026-07-16',
        activePromiseDate: '2026-07-25',
      }),
    ).toEqual({ date: '2026-07-24', basis: 'ACTIVE_PROMISE' });
  });

  it('never suggests an active-promise follow-up before tomorrow', () => {
    expect(
      suggestNextFollowUp({
        asOfDate: '2026-07-16',
        activePromiseDate: '2026-07-16',
      }),
    ).toEqual({ date: '2026-07-17', basis: 'ACTIVE_PROMISE' });
  });

  it('suppresses normal follow-up when an open dispute owns resolution', () => {
    expect(
      suggestNextFollowUp({
        asOfDate: '2026-07-16',
        activePromiseDate: '2026-07-25',
        hasOpenDispute: true,
      }),
    ).toEqual({ date: null, basis: 'OPEN_DISPUTE' });
  });

  it('accepts today, a future date, or an explicit no-follow-up value', () => {
    expect(
      validateNextFollowUpDate({
        asOfDate: '2026-07-16',
        nextFollowUpDate: '2026-07-16',
      }),
    ).toBe('2026-07-16');
    expect(
      validateNextFollowUpDate({
        asOfDate: '2026-07-16',
        nextFollowUpDate: '2026-08-01',
      }),
    ).toBe('2026-08-01');
    expect(
      validateNextFollowUpDate({
        asOfDate: '2026-07-16',
        nextFollowUpDate: null,
      }),
    ).toBeNull();
  });

  it('rejects a follow-up before the current business date', () => {
    expect(() =>
      validateNextFollowUpDate({
        asOfDate: '2026-07-16',
        nextFollowUpDate: '2026-07-15',
      }),
    ).toThrowError(/cannot be before the current business date/u);
  });
});
