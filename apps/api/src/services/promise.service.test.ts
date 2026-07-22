import { describe, expect, it, vi } from 'vitest';

import {
  MembershipRole,
  PromiseFinalStatus,
} from '../generated/prisma/enums.js';
import type {
  PromiseRecord,
  PromiseRepository,
} from '../repositories/promise.repository.js';
import type { AuthContext } from './auth.service.js';
import { PromiseError, PromiseService } from './promise.service.js';

const now = new Date('2026-07-16T03:00:00.000Z');
const context: AuthContext = {
  sessionId: '60000000-0000-4000-8000-000000000001',
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'owner@demo.arus.local',
    name: 'Demo Owner',
  },
  organization: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Demo Indonesia',
    timezone: 'Asia/Jakarta',
  },
  role: MembershipRole.OWNER,
};

describe('promise service', () => {
  it('passes trusted tenant, actor, clock, and canonical money to persistence', async () => {
    const createPromise = vi.fn().mockResolvedValue({
      record: promiseRecord(),
      replayed: false,
    });
    const service = testService({ createPromise });

    const result = await service.createPromise({
      context,
      requestId: 'request-1',
      invoiceId: '30000000-0000-4000-8000-000000000001',
      operationKey: '81000000-0000-4000-8000-000000000001',
      amount: '75000000',
      promiseDate: '2026-07-16',
    });

    expect(createPromise).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      invoiceId: '30000000-0000-4000-8000-000000000001',
      actorId: context.user.id,
      actorRole: context.role,
      operationKey: '81000000-0000-4000-8000-000000000001',
      requestId: 'request-1',
      occurredAt: now,
      asOfDate: '2026-07-16',
      amount: '75000000.00',
      promiseDate: '2026-07-16',
    });
    expect(result.data.status).toBe('DUE');
  });

  it('rejects past dates and invalid money before persistence', async () => {
    const createPromise = vi.fn();
    const service = testService({ createPromise });

    await expect(
      service.createPromise({
        context,
        requestId: 'request-1',
        invoiceId: '30000000-0000-4000-8000-000000000001',
        operationKey: '81000000-0000-4000-8000-000000000002',
        amount: '0.00',
        promiseDate: '2026-07-16',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_PROMISE_AMOUNT',
    } satisfies Partial<PromiseError>);
    await expect(
      service.createPromise({
        context,
        requestId: 'request-1',
        invoiceId: '30000000-0000-4000-8000-000000000001',
        operationKey: '81000000-0000-4000-8000-000000000003',
        amount: '1.00',
        promiseDate: '2026-07-15',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_PROMISE_DATE',
    } satisfies Partial<PromiseError>);
    expect(createPromise).not.toHaveBeenCalled();
  });

  it('returns cancelled evidence using the current derived view', async () => {
    const record = promiseRecord({
      finalStatus: PromiseFinalStatus.CANCELLED,
      cancelledAt: now,
      cancelReason: 'Customer corrected the date.',
      cancelledBy: {
        id: context.user.id,
        name: context.user.name,
        role: context.role,
      },
    });
    const cancelPromise = vi.fn().mockResolvedValue({
      record,
      replayed: true,
    });
    const result = await testService({ cancelPromise }).cancelPromise({
      context,
      requestId: 'request-2',
      promiseId: record.id,
      operationKey: '82000000-0000-4000-8000-000000000001',
      reason: 'Customer corrected the date.',
    });

    expect(result).toMatchObject({
      replayed: true,
      data: {
        status: 'CANCELLED',
        cancelReason: 'Customer corrected the date.',
        cancelledBy: { role: 'OWNER' },
      },
    });
  });
});

function testService(repository: Partial<PromiseRepository>): PromiseService {
  return new PromiseService({
    repository: repository as PromiseRepository,
    clock: () => now,
  });
}

function promiseRecord(overrides: Partial<PromiseRecord> = {}): PromiseRecord {
  return {
    id: '80000000-0000-4000-8000-000000000001',
    invoiceId: '30000000-0000-4000-8000-000000000001',
    amount: '75000000.00',
    promiseDate: '2026-07-16',
    finalStatus: null,
    fulfilledAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdBy: {
      id: context.user.id,
      name: context.user.name,
      role: context.role,
    },
    cancelledBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
