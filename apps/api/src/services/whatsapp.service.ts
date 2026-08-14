import type {
  ConversationMatchState,
  MediaProcessingState,
  PaymentEvidenceState,
  WhatsAppConnectionState,
  WhatsAppProvider,
} from '../generated/prisma/enums.js';
import {
  WhatsAppRepositoryError,
  type EvidenceRecord,
  type PrismaWhatsAppRepository,
  type ThreadRecord,
  type WhatsAppConnectionRecord,
} from '../repositories/whatsapp.repository.js';
import {
  PaymentError,
  type PaymentServiceContract,
} from './payment.service.js';
import type { AuthContext } from './auth.service.js';
import type { EvidenceStorage } from '../whatsapp/contracts.js';
import {
  connectionPhoneNumberId,
  parseMetaWebhookPayload,
  webhookEventIdentity,
} from '../whatsapp/meta-webhook.js';

/**
 * The WhatsApp service orchestrates authenticated channel commands.
 * It maps durable records into browser-safe views and signed preview grants.
 * Human-approved text is persisted before the provider worker can send it.
 * Evidence rejection and linking never mutate invoice financials.
 * Acceptance delegates to the payment service's atomic transaction boundary.
 */

export interface WhatsAppConnectionView {
  id: string;
  provider: WhatsAppProvider;
  displayPhoneNumber: string | null;
  state: WhatsAppConnectionState;
  lastWebhookAt: string | null;
  lastHealthyAt: string | null;
  lastFailureCode: string | null;
}

export interface WhatsAppThreadView {
  id: string;
  customerNumber: string;
  customerDisplayName: string | null;
  matchState: ConversationMatchState;
  lastMessageAt: string | null;
  debtor: ThreadRecord['debtor'];
  currentInvoice: {
    id: string;
    invoiceNumber: string;
    originalAmount: string;
    dueDate: string;
  } | null;
  messages: Array<{
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    type: 'TEXT' | 'IMAGE';
    state: ThreadRecord['messages'][number]['state'];
    body: string | null;
    occurredAt: string;
    safeFailureCode: string | null;
    media: {
      id: string;
      mime: string | null;
      byteSize: number | null;
      width: number | null;
      height: number | null;
      processingState: MediaProcessingState;
      failureCode: string | null;
      evidence: {
        id: string;
        state: PaymentEvidenceState;
        invoiceId: string | null;
      } | null;
    } | null;
  }>;
}

export interface PaymentEvidenceView {
  id: string;
  state: PaymentEvidenceState;
  createdAt: string;
  debtor: EvidenceRecord['debtor'];
  invoice: EvidenceRecord['invoice'];
  source: {
    messageId: string;
    occurredAt: string;
    threadId: string;
    customerNumber: string;
    customerDisplayName: string | null;
  };
  media: {
    id: string;
    mime: string | null;
    byteSize: number | null;
    width: number | null;
    height: number | null;
    processingState: MediaProcessingState;
  };
}

export interface WhatsAppServiceContract {
  captureVerifiedWebhook(input: {
    rawBody: Uint8Array;
    parsedBody: unknown;
    receivedAt: Date;
  }): Promise<{ replayed: boolean }>;
  getConnection(input: {
    context: AuthContext;
  }): Promise<{ data: WhatsAppConnectionView | null }>;
  updateConnectionState(input: {
    context: AuthContext;
    requestId: string;
    state: 'LIVE' | 'PAUSED';
  }): Promise<{ data: WhatsAppConnectionView }>;
  getThread(input: {
    context: AuthContext;
    debtorId: string;
    invoiceId?: string | undefined;
    limit: number;
  }): Promise<{
    data: {
      connection: WhatsAppConnectionView | null;
      thread: WhatsAppThreadView | null;
    };
  }>;
  getEvidence(input: {
    context: AuthContext;
    evidenceId: string;
  }): Promise<{ data: PaymentEvidenceView }>;
  createEvidenceView(input: {
    context: AuthContext;
    evidenceId: string;
  }): Promise<{ data: { url: string; expiresAt: string } }>;
  sendMessage?(input: {
    context: AuthContext;
    requestId: string;
    debtorId: string;
    invoiceId: string;
    operationKey: string;
    body: string;
  }): Promise<{
    data: WhatsAppThreadView['messages'][number];
    replayed: boolean;
  }>;
  linkThread?(input: {
    context: AuthContext;
    requestId: string;
    threadId: string;
    debtorId: string;
    invoiceId: string;
    operationKey: string;
  }): Promise<{ data: WhatsAppThreadView }>;
  rejectEvidence?(input: {
    context: AuthContext;
    requestId: string;
    evidenceId: string;
    operationKey: string;
    reason: string;
  }): Promise<{ data: PaymentEvidenceView; replayed: boolean }>;
  confirmEvidencePayment?(input: {
    context: AuthContext;
    requestId: string;
    evidenceId: string;
    invoiceId: string;
    operationKey: string;
    paymentDate: string;
    amount: string;
    payerReference: string;
    bankReference: string | null;
  }): ReturnType<PaymentServiceContract['recordEvidencePayment']>;
}

export class WhatsAppService implements WhatsAppServiceContract {
  constructor(
    private readonly options: {
      repository: Pick<
        PrismaWhatsAppRepository,
        | 'captureWebhook'
        | 'getConnection'
        | 'updateConnectionState'
        | 'getThread'
        | 'getEvidence'
      > &
        Partial<
          Pick<
            PrismaWhatsAppRepository,
            'createOutboundMessage' | 'linkThread' | 'rejectEvidence'
          >
        >;
      storage: EvidenceStorage;
      paymentService?: Pick<PaymentServiceContract, 'recordEvidencePayment'>;
      clock?: () => Date;
    },
  ) {}

  async captureVerifiedWebhook(input: {
    rawBody: Uint8Array;
    parsedBody: unknown;
    receivedAt: Date;
  }): Promise<{ replayed: boolean }> {
    const payload = parseMetaWebhookPayload(input.parsedBody);
    return this.options.repository.captureWebhook({
      providerEventId: webhookEventIdentity(input.rawBody),
      providerPhoneNumberId: connectionPhoneNumberId(payload),
      payload,
      receivedAt: input.receivedAt,
    });
  }

  async getConnection(input: {
    context: AuthContext;
  }): Promise<{ data: WhatsAppConnectionView | null }> {
    const record = await this.options.repository.getConnection(
      input.context.organization.id,
    );
    return { data: record ? toConnectionView(record) : null };
  }

  async updateConnectionState(input: {
    context: AuthContext;
    requestId: string;
    state: 'LIVE' | 'PAUSED';
  }): Promise<{ data: WhatsAppConnectionView }> {
    const record = await this.options.repository.updateConnectionState({
      organizationId: input.context.organization.id,
      actorId: input.context.user.id,
      requestId: input.requestId,
      state: input.state,
    });
    if (!record) {
      throw new WhatsAppError(
        'CONNECTION_NOT_FOUND',
        'WhatsApp connection is not configured',
      );
    }
    return { data: toConnectionView(record) };
  }

  async getThread(input: {
    context: AuthContext;
    debtorId: string;
    invoiceId?: string | undefined;
    limit: number;
  }): Promise<{
    data: {
      connection: WhatsAppConnectionView | null;
      thread: WhatsAppThreadView | null;
    };
  }> {
    const [connection, result] = await Promise.all([
      this.options.repository.getConnection(input.context.organization.id),
      this.options.repository.getThread({
        organizationId: input.context.organization.id,
        debtorId: input.debtorId,
        ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
        limit: input.limit,
      }),
    ]);
    if (!result.debtorExists) {
      throw new WhatsAppError('THREAD_NOT_FOUND', 'Conversation not found');
    }
    return {
      data: {
        connection: connection ? toConnectionView(connection) : null,
        thread: result.thread ? toThreadView(result.thread) : null,
      },
    };
  }

  async getEvidence(input: {
    context: AuthContext;
    evidenceId: string;
  }): Promise<{ data: PaymentEvidenceView }> {
    const record = await this.evidenceOrThrow(
      input.context.organization.id,
      input.evidenceId,
    );
    return { data: toEvidenceView(record) };
  }

  async createEvidenceView(input: {
    context: AuthContext;
    evidenceId: string;
  }): Promise<{ data: { url: string; expiresAt: string } }> {
    const record = await this.evidenceOrThrow(
      input.context.organization.id,
      input.evidenceId,
    );
    if (
      record.mediaAsset.processingState !== 'READY' ||
      !record.mediaAsset.objectKey
    ) {
      throw new WhatsAppError(
        'EVIDENCE_NOT_READY',
        'Evidence preview is not available yet',
      );
    }
    const expiresInSeconds = 60;
    const now = this.options.clock?.() ?? new Date();
    const url = await this.options.storage.createSignedReadUrl({
      objectKey: record.mediaAsset.objectKey,
      expiresInSeconds,
    });
    return {
      data: {
        url,
        expiresAt: new Date(
          now.getTime() + expiresInSeconds * 1_000,
        ).toISOString(),
      },
    };
  }

  async sendMessage(input: {
    context: AuthContext;
    requestId: string;
    debtorId: string;
    invoiceId: string;
    operationKey: string;
    body: string;
  }): Promise<{
    data: WhatsAppThreadView['messages'][number];
    replayed: boolean;
  }> {
    try {
      const command = this.options.repository.createOutboundMessage;
      if (!command)
        throw new WhatsAppError('CHANNEL_NOT_LIVE', 'Sending is unavailable');
      const result = await command.call(this.options.repository, {
        organizationId: input.context.organization.id,
        debtorId: input.debtorId,
        invoiceId: input.invoiceId,
        actorId: input.context.user.id,
        actorRole: input.context.role,
        operationKey: input.operationKey,
        requestId: input.requestId,
        body: input.body,
        occurredAt: this.now(),
      });
      if (!result) {
        throw new WhatsAppError(
          'THREAD_NOT_FOUND',
          'Invoice conversation was not found',
        );
      }
      return { data: toMessageView(result.record), replayed: result.replayed };
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async linkThread(input: {
    context: AuthContext;
    requestId: string;
    threadId: string;
    debtorId: string;
    invoiceId: string;
    operationKey: string;
  }): Promise<{ data: WhatsAppThreadView }> {
    const command = this.options.repository.linkThread;
    if (!command)
      throw new WhatsAppError('THREAD_NOT_FOUND', 'Linking is unavailable');
    const record = await command.call(this.options.repository, {
      organizationId: input.context.organization.id,
      threadId: input.threadId,
      debtorId: input.debtorId,
      invoiceId: input.invoiceId,
      actorId: input.context.user.id,
      operationKey: input.operationKey,
      requestId: input.requestId,
      occurredAt: this.now(),
    });
    if (!record)
      throw new WhatsAppError('THREAD_NOT_FOUND', 'Conversation was not found');
    return { data: toThreadView(record) };
  }

  async rejectEvidence(input: {
    context: AuthContext;
    requestId: string;
    evidenceId: string;
    operationKey: string;
    reason: string;
  }): Promise<{ data: PaymentEvidenceView; replayed: boolean }> {
    try {
      const command = this.options.repository.rejectEvidence;
      if (!command)
        throw new WhatsAppError(
          'EVIDENCE_NOT_REVIEWABLE',
          'Review is unavailable',
        );
      const result = await command.call(this.options.repository, {
        organizationId: input.context.organization.id,
        evidenceId: input.evidenceId,
        actorId: input.context.user.id,
        operationKey: input.operationKey,
        requestId: input.requestId,
        reason: input.reason,
        occurredAt: this.now(),
      });
      if (!result)
        throw new WhatsAppError('EVIDENCE_NOT_FOUND', 'Evidence not found');
      return { data: toEvidenceView(result.record), replayed: result.replayed };
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async confirmEvidencePayment(input: {
    context: AuthContext;
    requestId: string;
    evidenceId: string;
    invoiceId: string;
    operationKey: string;
    paymentDate: string;
    amount: string;
    payerReference: string;
    bankReference: string | null;
  }): ReturnType<PaymentServiceContract['recordEvidencePayment']> {
    if (!this.options.paymentService) {
      throw new WhatsAppError(
        'PAYMENT_UNAVAILABLE',
        'Payment recording is unavailable',
      );
    }
    try {
      return await this.options.paymentService.recordEvidencePayment(input);
    } catch (error) {
      if (error instanceof PaymentError) {
        throw new WhatsAppError('PAYMENT_REJECTED', error.message, error.code);
      }
      throw error;
    }
  }

  private now(): Date {
    return this.options.clock?.() ?? new Date();
  }

  private async evidenceOrThrow(
    organizationId: string,
    evidenceId: string,
  ): Promise<EvidenceRecord> {
    const record = await this.options.repository.getEvidence(
      organizationId,
      evidenceId,
    );
    if (!record) {
      throw new WhatsAppError('EVIDENCE_NOT_FOUND', 'Evidence not found');
    }
    return record;
  }
}

export type WhatsAppErrorCode =
  | 'CONNECTION_NOT_FOUND'
  | 'EVIDENCE_NOT_FOUND'
  | 'EVIDENCE_NOT_READY'
  | 'CHANNEL_NOT_LIVE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_UNAVAILABLE'
  | 'RECIPIENT_MISSING'
  | 'EVIDENCE_NOT_REVIEWABLE'
  | 'THREAD_NOT_FOUND';

export class WhatsAppError extends Error {
  constructor(
    readonly code: WhatsAppErrorCode,
    message: string,
    readonly causeCode?: string,
  ) {
    super(message);
    this.name = 'WhatsAppError';
  }
}

function toConnectionView(
  record: WhatsAppConnectionRecord,
): WhatsAppConnectionView {
  return {
    ...record,
    lastWebhookAt: record.lastWebhookAt?.toISOString() ?? null,
    lastHealthyAt: record.lastHealthyAt?.toISOString() ?? null,
  };
}

function toThreadView(record: ThreadRecord): WhatsAppThreadView {
  return {
    id: record.id,
    customerNumber: record.normalizedCustomerNumber,
    customerDisplayName: record.customerDisplayName,
    matchState: record.matchState,
    lastMessageAt: record.lastMessageAt?.toISOString() ?? null,
    debtor: record.debtor,
    currentInvoice: record.currentInvoice
      ? {
          ...record.currentInvoice,
          dueDate: record.currentInvoice.dueDate.toISOString().slice(0, 10),
        }
      : null,
    messages: record.messages.map(toMessageView),
  };
}

function toMessageView(
  message: ThreadRecord['messages'][number],
): WhatsAppThreadView['messages'][number] {
  return {
    id: message.id,
    direction: message.direction,
    type: message.type,
    state: message.state,
    body: message.body,
    occurredAt: message.occurredAt.toISOString(),
    safeFailureCode: message.safeFailureCode,
    media: message.mediaAsset
      ? {
          id: message.mediaAsset.id,
          mime: message.mediaAsset.detectedMime,
          byteSize: message.mediaAsset.byteSize,
          width: message.mediaAsset.width,
          height: message.mediaAsset.height,
          processingState: message.mediaAsset.processingState,
          failureCode: message.mediaAsset.failureCode,
          evidence: message.mediaAsset.evidence,
        }
      : null,
  };
}

function toEvidenceView(record: EvidenceRecord): PaymentEvidenceView {
  return {
    id: record.id,
    state: record.state,
    createdAt: record.createdAt.toISOString(),
    debtor: record.debtor,
    invoice: record.invoice,
    source: {
      messageId: record.mediaAsset.message.id,
      occurredAt: record.mediaAsset.message.occurredAt.toISOString(),
      threadId: record.mediaAsset.message.thread.id,
      customerNumber: record.mediaAsset.message.thread.normalizedCustomerNumber,
      customerDisplayName: record.mediaAsset.message.thread.customerDisplayName,
    },
    media: {
      id: record.mediaAsset.id,
      mime: record.mediaAsset.detectedMime,
      byteSize: record.mediaAsset.byteSize,
      width: record.mediaAsset.width,
      height: record.mediaAsset.height,
      processingState: record.mediaAsset.processingState,
    },
  };
}

function mapRepositoryError(error: unknown): unknown {
  if (!(error instanceof WhatsAppRepositoryError)) return error;
  switch (error.code) {
    case 'CHANNEL_NOT_LIVE':
    case 'SENDER_NOT_CONFIGURED':
      return new WhatsAppError(
        'CHANNEL_NOT_LIVE',
        'WhatsApp must be live with an approved sender before sending',
      );
    case 'RECIPIENT_MISSING':
      return new WhatsAppError(
        'RECIPIENT_MISSING',
        'Customer needs a valid international WhatsApp number',
      );
    case 'IDEMPOTENCY_CONFLICT':
      return new WhatsAppError(
        'IDEMPOTENCY_CONFLICT',
        'This operation key was already used for another action',
      );
    case 'EVIDENCE_NOT_REVIEWABLE':
      return new WhatsAppError(
        'EVIDENCE_NOT_REVIEWABLE',
        'Evidence is no longer awaiting review',
      );
    case 'UNKNOWN_CONNECTION':
    case 'MATCH_SCOPE_TOO_LARGE':
      return error;
  }
}
