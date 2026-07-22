import { describe, expect, it, vi } from 'vitest';

import { MembershipRole } from '../generated/prisma/enums.js';
import type {
  CollectionQueueSourceRecord,
  ReceivablesRepository,
} from '../repositories/receivables.repository.js';
import type { AuthContext } from './auth.service.js';
import {
  CollectionQueueError,
  CollectionQueueService,
} from './collection-queue.service.js';

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

describe('collection queue service', () => {
  it('scopes, sorts, and paginates eligible invoices after derivation', async () => {
    const listCollectionQueueCandidates = vi.fn().mockResolvedValue([
      invoice({
        id: '30000000-0000-4000-8000-000000000001',
        invoiceNumber: 'INV-PARTIAL',
        dueDate: '2026-05-30',
        originalAmount: '185000000.00',
        allocations: [{ amount: '50000000.00', reversed: false }],
        latestCommunication: {
          occurredAt: new Date('2026-07-14T03:30:00.000Z'),
          nextFollowUpDate: '2026-07-18',
        },
      }),
      invoice({
        id: '30000000-0000-4000-8000-000000000002',
        invoiceNumber: 'INV-LARGEST',
        dueDate: '2026-07-15',
        originalAmount: '315000000.00',
      }),
      invoice({
        id: '30000000-0000-4000-8000-000000000003',
        invoiceNumber: 'INV-DUE-SOON',
        dueDate: '2026-07-23',
        originalAmount: '90000000.00',
      }),
      invoice({
        id: '30000000-0000-4000-8000-000000000004',
        invoiceNumber: 'INV-DISPUTED',
        dueDate: '2026-01-01',
        originalAmount: '999000000.00',
        hasOpenDispute: true,
      }),
    ]);
    const service = new CollectionQueueService({
      repository: {
        listCollectionQueueCandidates,
      } as unknown as ReceivablesRepository,
    });

    const firstPage = await service.listQueue({
      context,
      asOfDate: '2026-07-16',
      page: 1,
      limit: 2,
    });
    const secondPage = await service.listQueue({
      context,
      asOfDate: '2026-07-16',
      page: 2,
      limit: 2,
    });

    expect(listCollectionQueueCandidates).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      communicationOccurredBefore: new Date('2026-07-16T17:00:00.000Z'),
      take: 10_001,
    });
    expect(firstPage.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(firstPage.data.map((item) => item.invoiceNumber)).toEqual([
      'INV-LARGEST',
      'INV-PARTIAL',
    ]);
    expect(firstPage.data.map((item) => item.priority.score)).toEqual([
      '487.60',
      '208.20',
    ]);
    expect(firstPage.data[1]).toMatchObject({
      lastContactAt: '2026-07-14T03:30:00.000Z',
      lastContactDate: '2026-07-14',
      nextFollowUpDate: '2026-07-18',
      daysSinceLastContact: 2,
      priority: { components: { stale: '1.00' } },
    });
    expect(secondPage.data.map((item) => item.invoiceNumber)).toEqual([
      'INV-DUE-SOON',
    ]);
    expect(secondPage.data[0]).toMatchObject({
      reasons: ['DUE_SOON_UNCONTACTED'],
      daysSinceLastContact: 30,
      priority: {
        score: '155.00',
        components: {
          amount: '135.00',
          aging: '0.00',
          stale: '15.00',
          promise: '0.00',
          dueSoon: '5.00',
        },
      },
    });
    expect(JSON.stringify(firstPage)).not.toContain('scoreBasis');
  });

  it('rejects impossible dates before reading tenant records', async () => {
    const listCollectionQueueCandidates = vi.fn();
    const service = new CollectionQueueService({
      repository: {
        listCollectionQueueCandidates,
      } as unknown as ReceivablesRepository,
    });

    await expect(
      service.listQueue({
        context,
        asOfDate: '2026-02-30',
        page: 1,
        limit: 25,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_AS_OF_DATE',
    } satisfies Partial<CollectionQueueError>);
    expect(listCollectionQueueCandidates).not.toHaveBeenCalled();
  });

  it('fails safely when the pilot derivation bound is exceeded', async () => {
    const source = invoice({
      id: '30000000-0000-4000-8000-000000000001',
      invoiceNumber: 'INV-BOUND',
      dueDate: '2026-07-15',
      originalAmount: '1.00',
    });
    const service = new CollectionQueueService({
      repository: {
        listCollectionQueueCandidates: vi
          .fn()
          .mockResolvedValue(Array.from({ length: 10_001 }, () => source)),
      } as unknown as ReceivablesRepository,
    });

    await expect(
      service.listQueue({
        context,
        asOfDate: '2026-07-16',
        page: 1,
        limit: 25,
      }),
    ).rejects.toMatchObject({
      code: 'QUEUE_TOO_BROAD',
    } satisfies Partial<CollectionQueueError>);
  });
});

function invoice(
  input: Pick<
    CollectionQueueSourceRecord,
    'id' | 'invoiceNumber' | 'dueDate' | 'originalAmount'
  > &
    Partial<CollectionQueueSourceRecord>,
): CollectionQueueSourceRecord {
  const { id, invoiceNumber, dueDate, originalAmount, ...overrides } = input;
  return {
    id,
    debtor: {
      id: '20000000-0000-4000-8000-000000000001',
      code: 'CUST-001',
      name: 'PT Sinar Abadi Retail',
    },
    invoiceNumber,
    invoiceDate: '2026-04-30',
    dueDate,
    originalAmount,
    description: null,
    allocations: [],
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    latestCommunication: null,
    promiseStatus: null,
    hasOpenDispute: false,
    ...overrides,
  };
}
