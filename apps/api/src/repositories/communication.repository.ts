import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type {
  CommunicationChannel,
  MembershipRole,
} from '../generated/prisma/enums.js';
import { databaseDate } from '../lib/business-date.js';

export interface CommunicationRecord {
  id: string;
  invoiceId: string;
  occurredAt: Date;
  channel: CommunicationChannel;
  notes: string;
  nextFollowUpDate: string | null;
  actor: { id: string; name: string; role: MembershipRole };
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunicationWriteResult {
  record: CommunicationRecord;
  replayed: boolean;
}

export interface CommunicationRepository {
  recordCommunication(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    channel: CommunicationChannel;
    notes: string;
    nextFollowUpDate: string | null;
  }): Promise<CommunicationWriteResult | null>;
}

export class CommunicationRepositoryConflictError extends Error {
  constructor() {
    super('Communication operation key was already used for another command');
    this.name = 'CommunicationRepositoryConflictError';
  }
}

export class PrismaCommunicationRepository implements CommunicationRepository {
  constructor(private readonly database: PrismaClient) {}

  async recordCommunication(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
    channel: CommunicationChannel;
    notes: string;
    nextFollowUpDate: string | null;
  }): Promise<CommunicationWriteResult | null> {
    try {
      const record = await this.database.$transaction(async (transaction) => {
        const invoice = await transaction.invoice.findFirst({
          where: {
            id: input.invoiceId,
            organizationId: input.organizationId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!invoice) return null;

        const communication = await transaction.communication.create({
          data: {
            organizationId: input.organizationId,
            invoiceId: input.invoiceId,
            actorId: input.actorId,
            actorRole: input.actorRole,
            operationKey: input.operationKey,
            occurredAt: input.occurredAt,
            channel: input.channel,
            notes: input.notes,
            nextFollowUpDate: input.nextFollowUpDate
              ? toDatabaseDate(input.nextFollowUpDate)
              : null,
          },
          select: communicationSelect,
        });
        await transaction.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            action: 'COMMUNICATION_RECORDED',
            entityType: 'Communication',
            entityId: communication.id,
            requestId: input.requestId,
            metadata: {
              invoiceId: input.invoiceId,
              channel: input.channel,
              hasNextFollowUp: input.nextFollowUpDate !== null,
            },
          },
        });
        return toCommunicationRecord(communication);
      });
      return record ? { record, replayed: false } : null;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      return this.recoverIdempotentReplay(input);
    }
  }

  private async recoverIdempotentReplay(input: {
    organizationId: string;
    invoiceId: string;
    actorId: string;
    operationKey: string;
    channel: CommunicationChannel;
    notes: string;
    nextFollowUpDate: string | null;
  }): Promise<CommunicationWriteResult> {
    const existing = await this.database.communication.findUnique({
      where: {
        organizationId_operationKey: {
          organizationId: input.organizationId,
          operationKey: input.operationKey,
        },
      },
      select: {
        ...communicationSelect,
        actorId: true,
      },
    });
    if (
      !existing ||
      existing.invoiceId !== input.invoiceId ||
      existing.actorId !== input.actorId ||
      existing.channel !== input.channel ||
      existing.notes !== input.notes ||
      nullableDatabaseDate(existing.nextFollowUpDate) !== input.nextFollowUpDate
    ) {
      throw new CommunicationRepositoryConflictError();
    }
    return { record: toCommunicationRecord(existing), replayed: true };
  }
}

const communicationSelect = {
  id: true,
  invoiceId: true,
  occurredAt: true,
  channel: true,
  notes: true,
  nextFollowUpDate: true,
  actorRole: true,
  actor: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CommunicationSelect;

function toCommunicationRecord(record: {
  id: string;
  invoiceId: string;
  occurredAt: Date;
  channel: CommunicationChannel;
  notes: string;
  nextFollowUpDate: Date | null;
  actorRole: MembershipRole;
  actor: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}): CommunicationRecord {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    occurredAt: record.occurredAt,
    channel: record.channel,
    notes: record.notes,
    nextFollowUpDate: nullableDatabaseDate(record.nextFollowUpDate),
    actor: { ...record.actor, role: record.actorRole },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function nullableDatabaseDate(value: Date | null): string | null {
  return value ? databaseDate(value) : null;
}

function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
