import { describe, expect, it } from 'vitest';

import {
  derivePromiseStatus,
  isPromiseFulfilled,
  PromiseFinalStatus,
  promiseAcceptsReplacement,
  PromiseStatus,
  validatePromiseAmount,
  validatePromiseDate,
} from './collection-workflow.js';

describe('promise lifecycle', () => {
  it.each([
    ['2026-07-14', PromiseStatus.ACTIVE],
    ['2026-07-15', PromiseStatus.DUE],
    ['2026-07-16', PromiseStatus.BROKEN],
  ] as const)('derives date status as of %s', (asOfDate, expected) => {
    expect(
      derivePromiseStatus({
        promiseDate: '2026-07-15',
        asOfDate,
        finalStatus: null,
      }),
    ).toBe(expected);
  });

  it('gives persisted final events precedence over the calendar', () => {
    expect(
      derivePromiseStatus({
        promiseDate: '2026-07-01',
        asOfDate: '2026-07-16',
        finalStatus: PromiseFinalStatus.FULFILLED,
      }),
    ).toBe(PromiseStatus.FULFILLED);
    expect(
      derivePromiseStatus({
        promiseDate: '2026-08-01',
        asOfDate: '2026-07-16',
        finalStatus: PromiseFinalStatus.CANCELLED,
      }),
    ).toBe(PromiseStatus.CANCELLED);
  });

  it('accepts an exact positive promise within current outstanding', () => {
    expect(
      validatePromiseAmount({
        amount: '135000000',
        outstandingAmount: '135000000.00',
      }),
    ).toBe('135000000.00');
  });

  it('rejects zero and promises above current outstanding', () => {
    expect(() =>
      validatePromiseAmount({ amount: '0.00', outstandingAmount: '1.00' }),
    ).toThrowError(/greater than zero/u);
    expect(() =>
      validatePromiseAmount({ amount: '1.01', outstandingAmount: '1.00' }),
    ).toThrowError(/cannot exceed/u);
  });

  it('accepts today or a future promise date and rejects the past', () => {
    expect(
      validatePromiseDate({
        promiseDate: '2026-07-16',
        asOfDate: '2026-07-16',
      }),
    ).toBe('2026-07-16');
    expect(() =>
      validatePromiseDate({
        promiseDate: '2026-07-15',
        asOfDate: '2026-07-16',
      }),
    ).toThrowError(/cannot be before/u);
  });

  it('fulfills only once post-promise allocations cover the amount', () => {
    expect(
      isPromiseFulfilled({
        promiseAmount: '30000000.00',
        allocatedAfterPromise: '29999999.99',
      }),
    ).toBe(false);
    expect(
      isPromiseFulfilled({
        promiseAmount: '30000000.00',
        allocatedAfterPromise: '30000000.00',
      }),
    ).toBe(true);
  });

  it('allows replacement only after a broken or final promise', () => {
    expect(promiseAcceptsReplacement(PromiseStatus.ACTIVE)).toBe(false);
    expect(promiseAcceptsReplacement(PromiseStatus.DUE)).toBe(false);
    expect(promiseAcceptsReplacement(PromiseStatus.BROKEN)).toBe(true);
    expect(promiseAcceptsReplacement(PromiseStatus.FULFILLED)).toBe(true);
    expect(promiseAcceptsReplacement(PromiseStatus.CANCELLED)).toBe(true);
  });
});
