import { describe, expect, it, vi } from 'vitest';

import {
  CommunicationChannel,
  MembershipRole,
} from '../generated/prisma/enums.js';
import {
  CommunicationRepositoryConflictError,
  type CommunicationRecord,
  type CommunicationRepository,
} from '../repositories/communication.repository.js';
import type { AuthContext } from './auth.service.js';
import {
  CommunicationError,
  CommunicationService,
} from './communication.service.js';

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
const occurredAt = new Date('2026-07-16T03:00:00.000Z');

describe('communication service', () => {
  it('uses trusted tenant and actor context with a server timestamp', async () => {
    const recordCommunication = vi.fn().mockResolvedValue({
      record: communicationRecord(),
      replayed: false,
    });
    const service = new CommunicationService({
      repository: { recordCommunication } as CommunicationRepository,
      clock: () => occurredAt,
    });

    const result = await service.recordCommunication({
      context,
      requestId: 'request-1',
      invoiceId: '30000000-0000-4000-8000-000000000001',
      operationKey: '70000000-0000-4000-8000-000000000001',
      channel: CommunicationChannel.CALL,
      notes: 'Accounts payable confirmed review.',
      nextFollowUpDate: '2026-07-17',
    });

    expect(recordCommunication).toHaveBeenCalledWith({
      organizationId: context.organization.id,
      invoiceId: '30000000-0000-4000-8000-000000000001',
      actorId: context.user.id,
      actorRole: MembershipRole.OWNER,
      operationKey: '70000000-0000-4000-8000-000000000001',
      requestId: 'request-1',
      occurredAt,
      channel: CommunicationChannel.CALL,
      notes: 'Accounts payable confirmed review.',
      nextFollowUpDate: '2026-07-17',
    });
    expect(result).toEqual({
      data: {
        id: '60000000-0000-4000-8000-000000000001',
        invoiceId: '30000000-0000-4000-8000-000000000001',
        occurredAt: '2026-07-16T03:00:00.000Z',
        channel: CommunicationChannel.CALL,
        notes: 'Accounts payable confirmed review.',
        nextFollowUpDate: '2026-07-17',
        actor: {
          id: context.user.id,
          name: context.user.name,
          role: MembershipRole.OWNER,
        },
        createdAt: '2026-07-16T03:00:00.000Z',
        updatedAt: '2026-07-16T03:00:00.000Z',
      },
      replayed: false,
    });
  });

  it('rejects a past follow-up before reaching persistence', async () => {
    const recordCommunication = vi.fn();
    const service = new CommunicationService({
      repository: { recordCommunication } as CommunicationRepository,
      clock: () => occurredAt,
    });

    await expect(
      service.recordCommunication({
        context,
        requestId: 'request-2',
        invoiceId: '30000000-0000-4000-8000-000000000001',
        operationKey: '70000000-0000-4000-8000-000000000002',
        channel: CommunicationChannel.EMAIL,
        notes: 'Sent supporting files.',
        nextFollowUpDate: '2026-07-15',
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_NEXT_FOLLOW_UP_DATE',
    } satisfies Partial<CommunicationError>);
    expect(recordCommunication).not.toHaveBeenCalled();
  });

  it('maps tenant-hidden invoices and operation conflicts safely', async () => {
    const notFoundService = new CommunicationService({
      repository: {
        recordCommunication: vi.fn().mockResolvedValue(null),
      },
      clock: () => occurredAt,
    });
    const conflictService = new CommunicationService({
      repository: {
        recordCommunication: vi
          .fn()
          .mockRejectedValue(new CommunicationRepositoryConflictError()),
      },
      clock: () => occurredAt,
    });
    const command = {
      context,
      requestId: 'request-3',
      invoiceId: '30000000-0000-4000-8000-000000000001',
      operationKey: '70000000-0000-4000-8000-000000000003',
      channel: CommunicationChannel.OTHER,
      notes: 'Recorded an external contact.',
      nextFollowUpDate: null,
    };

    await expect(
      notFoundService.recordCommunication(command),
    ).rejects.toMatchObject({ code: 'INVOICE_NOT_FOUND' });
    await expect(
      conflictService.recordCommunication(command),
    ).rejects.toMatchObject({
      code: 'COMMUNICATION_IDEMPOTENCY_CONFLICT',
    });
  });

  it('preserves repository replay evidence', async () => {
    const service = new CommunicationService({
      repository: {
        recordCommunication: vi.fn().mockResolvedValue({
          record: communicationRecord(),
          replayed: true,
        }),
      },
      clock: () => occurredAt,
    });

    const result = await service.recordCommunication({
      context,
      requestId: 'request-retry',
      invoiceId: '30000000-0000-4000-8000-000000000001',
      operationKey: '70000000-0000-4000-8000-000000000001',
      channel: CommunicationChannel.CALL,
      notes: 'Accounts payable confirmed review.',
      nextFollowUpDate: '2026-07-17',
    });

    expect(result.replayed).toBe(true);
  });
});

function communicationRecord(): CommunicationRecord {
  return {
    id: '60000000-0000-4000-8000-000000000001',
    invoiceId: '30000000-0000-4000-8000-000000000001',
    occurredAt,
    channel: CommunicationChannel.CALL,
    notes: 'Accounts payable confirmed review.',
    nextFollowUpDate: '2026-07-17',
    actor: {
      id: context.user.id,
      name: context.user.name,
      role: MembershipRole.OWNER,
    },
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}
