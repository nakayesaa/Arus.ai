import { DomainError, validateNextFollowUpDate } from '@arus/domain';

import type { CommunicationChannel } from '../generated/prisma/enums.js';
import { businessDateInTimeZone } from '../lib/business-date.js';
import {
  CommunicationRepositoryConflictError,
  type CommunicationRecord,
  type CommunicationRepository,
} from '../repositories/communication.repository.js';
import type { AuthContext } from './auth.service.js';

export interface CommunicationView {
  id: string;
  invoiceId: string;
  occurredAt: string;
  channel: CommunicationChannel;
  notes: string;
  nextFollowUpDate: string | null;
  actor: CommunicationRecord['actor'];
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationServiceContract {
  recordCommunication(input: {
    context: AuthContext;
    requestId: string;
    invoiceId: string;
    operationKey: string;
    channel: CommunicationChannel;
    notes: string;
    nextFollowUpDate: string | null;
  }): Promise<{ data: CommunicationView; replayed: boolean }>;
}

export type CommunicationErrorCode =
  | 'COMMUNICATION_IDEMPOTENCY_CONFLICT'
  | 'INVOICE_NOT_FOUND'
  | 'INVALID_NEXT_FOLLOW_UP_DATE';

export class CommunicationError extends Error {
  constructor(
    readonly code: CommunicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CommunicationError';
  }
}

export class CommunicationService implements CommunicationServiceContract {
  private readonly clock: () => Date;

  constructor(
    private readonly options: {
      repository: CommunicationRepository;
      clock?: () => Date;
    },
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  async recordCommunication(input: {
    context: AuthContext;
    requestId: string;
    invoiceId: string;
    operationKey: string;
    channel: CommunicationChannel;
    notes: string;
    nextFollowUpDate: string | null;
  }): Promise<{ data: CommunicationView; replayed: boolean }> {
    const occurredAt = this.clock();
    const asOfDate = businessDateInTimeZone(
      occurredAt,
      input.context.organization.timezone,
    );
    const nextFollowUpDate = validNextFollowUpDate(
      asOfDate,
      input.nextFollowUpDate,
    );

    try {
      const result = await this.options.repository.recordCommunication({
        organizationId: input.context.organization.id,
        invoiceId: input.invoiceId,
        actorId: input.context.user.id,
        actorRole: input.context.role,
        operationKey: input.operationKey,
        requestId: input.requestId,
        occurredAt,
        channel: input.channel,
        notes: input.notes,
        nextFollowUpDate,
      });
      if (!result) {
        throw new CommunicationError('INVOICE_NOT_FOUND', 'Invoice not found');
      }
      return {
        data: toCommunicationView(result.record),
        replayed: result.replayed,
      };
    } catch (error) {
      if (error instanceof CommunicationRepositoryConflictError) {
        throw new CommunicationError(
          'COMMUNICATION_IDEMPOTENCY_CONFLICT',
          'This operation key was already used for another communication',
        );
      }
      throw error;
    }
  }
}

function validNextFollowUpDate(
  asOfDate: string,
  nextFollowUpDate: string | null,
): string | null {
  try {
    return validateNextFollowUpDate({ asOfDate, nextFollowUpDate });
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === 'INVALID_BUSINESS_DATE' ||
        error.code === 'NEXT_FOLLOW_UP_IN_PAST')
    ) {
      throw new CommunicationError(
        'INVALID_NEXT_FOLLOW_UP_DATE',
        error.message,
      );
    }
    throw error;
  }
}

function toCommunicationView(record: CommunicationRecord): CommunicationView {
  return {
    id: record.id,
    invoiceId: record.invoiceId,
    occurredAt: record.occurredAt.toISOString(),
    channel: record.channel,
    notes: record.notes,
    nextFollowUpDate: record.nextFollowUpDate,
    actor: record.actor,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
