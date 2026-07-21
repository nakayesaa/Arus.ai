import { describe, expect, it } from 'vitest';

import {
  calculateCollectionQueueCandidate,
  CollectionPromiseStatus,
  CollectionQueueReason,
  compareCollectionQueueCandidates,
  type CollectionQueueInvoiceInput,
} from './collection-queue.js';

describe('collection queue', () => {
  it('makes an overdue open invoice eligible with exact score components', () => {
    const result = candidate({
      originalAmount: '315000000.00',
      dueDate: '2026-07-15',
    });

    expect(result).toMatchObject({
      eligible: true,
      state: 'OPEN',
      outstandingAmount: '315000000.00',
      daysSinceLastContact: 30,
      reasons: [CollectionQueueReason.OVERDUE],
      priority: {
        score: '487.60',
        components: {
          amount: '472.50',
          aging: '0.10',
          stale: '15.00',
          promise: '0.00',
          dueSoon: '0.00',
        },
      },
    });
  });

  it('includes an uncontacted invoice due within seven days', () => {
    const result = candidate({
      originalAmount: '90000000.00',
      dueDate: '2026-07-23',
    });

    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([
      CollectionQueueReason.DUE_SOON_UNCONTACTED,
    ]);
    expect(result.priority).toMatchObject({
      score: '155.00',
      components: {
        amount: '135.00',
        aging: '0.00',
        stale: '15.00',
        promise: '0.00',
        dueSoon: '5.00',
      },
    });
  });

  it('caps stale-contact points at thirty days', () => {
    const result = candidate({
      originalAmount: '1000000.00',
      dueDate: '2026-07-15',
      lastContactDate: '2026-05-01',
    });

    expect(result.daysSinceLastContact).toBe(76);
    expect(result.priority.components.stale).toBe('15.00');
    expect(result.priority.score).toBe('16.60');
  });

  it('makes a future-due invoice eligible for a broken promise', () => {
    const result = candidate({
      originalAmount: '10000000.00',
      dueDate: '2026-08-16',
      lastContactDate: '2026-07-16',
      promiseStatus: CollectionPromiseStatus.BROKEN,
    });

    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([CollectionQueueReason.PROMISE_BROKEN]);
    expect(result.priority.components.promise).toBe('20.00');
    expect(result.priority.score).toBe('35.00');
  });

  it('includes due promises and explicit follow-ups in stable reason order', () => {
    const result = candidate({
      dueDate: '2026-08-16',
      lastContactDate: '2026-07-10',
      nextFollowUpDate: '2026-07-16',
      promiseStatus: CollectionPromiseStatus.DUE,
    });

    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([
      CollectionQueueReason.PROMISE_DUE,
      CollectionQueueReason.FOLLOW_UP_DUE,
    ]);
    expect(result.priority.components.promise).toBe('10.00');
  });

  it('excludes an invoice with an open dispute from the normal queue', () => {
    const result = candidate({
      dueDate: '2026-06-01',
      promiseStatus: CollectionPromiseStatus.BROKEN,
      hasOpenDispute: true,
    });

    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual([
      CollectionQueueReason.PROMISE_BROKEN,
      CollectionQueueReason.OVERDUE,
    ]);
  });

  it('excludes fully paid and inactive future invoices', () => {
    const paid = candidate({
      originalAmount: '1000000.00',
      allocations: [{ amount: '1000000.00', reversed: false }],
      dueDate: '2026-06-01',
    });
    const inactive = candidate({
      dueDate: '2026-08-16',
      lastContactDate: '2026-07-10',
      promiseStatus: CollectionPromiseStatus.ACTIVE,
    });

    expect(paid.eligible).toBe(false);
    expect(inactive.eligible).toBe(false);
  });

  it('rejects a last-contact date after the as-of date', () => {
    expect(() => candidate({ lastContactDate: '2026-07-17' })).toThrowError(
      /Last contact date cannot be after/u,
    );
  });

  it('sorts by exact score, oldest due, largest balance, then invoice ID', () => {
    const exactScore = [
      candidate({
        invoiceId: 'b',
        originalAmount: '1000000.02',
        dueDate: '2026-07-15',
      }),
      candidate({
        invoiceId: 'a',
        originalAmount: '1000000.01',
        dueDate: '2026-07-15',
      }),
    ].sort(compareCollectionQueueCandidates);
    expect(exactScore.map((item) => item.invoiceId)).toEqual(['b', 'a']);

    const oldestDue = [
      candidate({
        invoiceId: 'newer-due',
        dueDate: '2026-07-15',
        lastContactDate: '2026-07-06',
      }),
      candidate({
        invoiceId: 'older-due',
        dueDate: '2026-07-10',
        lastContactDate: '2026-07-07',
      }),
    ].sort(compareCollectionQueueCandidates);
    expect(oldestDue[0]?.invoiceId).toBe('older-due');

    const tied = candidate({ invoiceId: 'template' });
    const balanceAndId = [
      { ...tied, invoiceId: 'z', outstandingAmount: '900000.00' },
      { ...tied, invoiceId: 'b', outstandingAmount: '1000000.00' },
      { ...tied, invoiceId: 'a', outstandingAmount: '1000000.00' },
    ].sort(compareCollectionQueueCandidates);
    expect(balanceAndId.map((item) => item.invoiceId)).toEqual(['a', 'b', 'z']);
  });
});

function candidate(overrides: Partial<CollectionQueueInvoiceInput> = {}) {
  return calculateCollectionQueueCandidate({
    invoiceId: 'invoice-1',
    originalAmount: '1000000.00',
    allocations: [],
    dueDate: '2026-07-15',
    asOfDate: '2026-07-16',
    lastContactDate: null,
    nextFollowUpDate: null,
    promiseStatus: null,
    hasOpenDispute: false,
    ...overrides,
  });
}
