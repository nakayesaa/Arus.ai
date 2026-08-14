import {
  canAdvanceOutboundState,
  canEnqueueOutbound,
  normalizeE164PhoneNumber,
} from '@arus/domain';

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  ChannelMessageDirection,
  ChannelMessageState,
  ChannelMessageType,
  CommunicationChannel,
  ConversationMatchState,
  MembershipRole,
  MediaProcessingState,
  MessageOutboxState,
  PaymentEvidenceState,
  WebhookInboxState,
  WhatsAppConnectionState,
  WhatsAppProvider,
} from '../generated/prisma/enums.js';
import type {
  InboundMessageEvent,
  OutboundStatusEvent,
} from '../whatsapp/contracts.js';

/**
 * The WhatsApp repository owns durable channel state and tenant boundaries.
 * Human sends, links, and rejections commit beside their audit evidence.
 * Inbox and outbox leases make provider retries safe across worker restarts.
 * Reads expose only normalized records and never storage or provider secrets.
 * Financial mutation is delegated to the payment repository transaction.
 */

export interface InboxLease {
  id: string;
  payload: unknown;
  attemptCount: number;
}

export interface OutboxLease {
  id: string;
  attemptCount: number;
  message: {
    id: string;
    body: string;
    recipient: string;
    providerPhoneNumberId: string;
  };
}

export interface IngestedInbound {
  duplicate: boolean;
  media: {
    id: string;
    providerMediaId: string;
    organizationId: string;
  } | null;
}

export interface WhatsAppConnectionRecord {
  id: string;
  provider: WhatsAppProvider;
  displayPhoneNumber: string | null;
  state: WhatsAppConnectionState;
  lastWebhookAt: Date | null;
  lastHealthyAt: Date | null;
  lastFailureCode: string | null;
}

export interface ThreadRecord {
  id: string;
  normalizedCustomerNumber: string;
  customerDisplayName: string | null;
  matchState: ConversationMatchState;
  lastMessageAt: Date | null;
  debtor: { id: string; name: string; code: string | null } | null;
  currentInvoice: {
    id: string;
    invoiceNumber: string;
    originalAmount: string;
    dueDate: Date;
  } | null;
  messages: MessageRecord[];
}

export interface MessageRecord {
  id: string;
  direction: ChannelMessageDirection;
  type: ChannelMessageType;
  state: ChannelMessageState;
  body: string | null;
  occurredAt: Date;
  safeFailureCode: string | null;
  mediaAsset: {
    id: string;
    detectedMime: string | null;
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
}

export interface EvidenceRecord {
  id: string;
  state: PaymentEvidenceState;
  createdAt: Date;
  mediaAsset: {
    id: string;
    objectKey: string | null;
    detectedMime: string | null;
    byteSize: number | null;
    width: number | null;
    height: number | null;
    processingState: MediaProcessingState;
    message: {
      id: string;
      occurredAt: Date;
      thread: {
        id: string;
        normalizedCustomerNumber: string;
        customerDisplayName: string | null;
      };
    };
  };
  debtor: { id: string; name: string } | null;
  invoice: { id: string; invoiceNumber: string } | null;
}

export class PrismaWhatsAppRepository {
  constructor(private readonly database: PrismaClient) {}

  async captureWebhook(input: {
    providerEventId: string;
    providerPhoneNumberId: string | null;
    payload: Prisma.InputJsonValue;
    receivedAt: Date;
  }): Promise<{ replayed: boolean }> {
    const connection = input.providerPhoneNumberId
      ? await this.database.whatsAppConnection.findUnique({
          where: {
            provider_providerPhoneNumberId: {
              provider: WhatsAppProvider.META,
              providerPhoneNumberId: input.providerPhoneNumberId,
            },
          },
          select: { id: true, organizationId: true },
        })
      : null;
    try {
      await this.database.$transaction([
        this.database.webhookInbox.create({
          data: {
            ...(connection
              ? {
                  organizationId: connection.organizationId,
                  connectionId: connection.id,
                }
              : {}),
            providerEventId: input.providerEventId,
            payload: input.payload,
            signatureVerifiedAt: input.receivedAt,
          },
        }),
        ...(connection
          ? [
              this.database.whatsAppConnection.update({
                where: { id: connection.id },
                data: { lastWebhookAt: input.receivedAt },
              }),
            ]
          : []),
      ]);
      return { replayed: false };
    } catch (error) {
      if (isUniqueConflict(error)) return { replayed: true };
      throw error;
    }
  }

  async leaseInbox(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<InboxLease | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = await this.database.webhookInbox.findFirst({
        where: {
          state: { in: [WebhookInboxState.PENDING, WebhookInboxState.RETRY] },
          nextAttemptAt: { lte: input.now },
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: input.now } },
          ],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      if (!candidate) return null;
      const claimed = await this.database.webhookInbox.updateMany({
        where: {
          id: candidate.id,
          state: { in: [WebhookInboxState.PENDING, WebhookInboxState.RETRY] },
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: input.now } },
          ],
        },
        data: {
          state: WebhookInboxState.PROCESSING,
          leaseOwner: input.workerId,
          leaseExpiresAt: input.leaseExpiresAt,
          attemptCount: { increment: 1 },
          safeErrorCode: null,
        },
      });
      if (claimed.count !== 1) continue;
      const lease = await this.database.webhookInbox.findUniqueOrThrow({
        where: { id: candidate.id },
        select: { id: true, payload: true, attemptCount: true },
      });
      return lease;
    }
    return null;
  }

  async completeInbox(id: string, processedAt: Date): Promise<void> {
    await this.database.webhookInbox.update({
      where: { id },
      data: {
        state: WebhookInboxState.COMPLETED,
        processedAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        safeErrorCode: null,
      },
    });
  }

  async retryInbox(input: {
    id: string;
    nextAttemptAt: Date;
    safeErrorCode: string;
    terminal: boolean;
  }): Promise<void> {
    await this.database.webhookInbox.update({
      where: { id: input.id },
      data: {
        state: input.terminal
          ? WebhookInboxState.FAILED
          : WebhookInboxState.RETRY,
        nextAttemptAt: input.nextAttemptAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        safeErrorCode: input.safeErrorCode,
      },
    });
  }

  async createOutboundMessage(input: {
    organizationId: string;
    debtorId: string;
    invoiceId: string;
    actorId: string;
    actorRole: MembershipRole;
    operationKey: string;
    requestId: string;
    body: string;
    occurredAt: Date;
  }): Promise<{ record: MessageRecord; replayed: boolean } | null> {
    try {
      return await this.database.$transaction(async (transaction) => {
        const replay = await transaction.channelMessage.findUnique({
          where: {
            organizationId_operationKey: {
              organizationId: input.organizationId,
              operationKey: input.operationKey,
            },
          },
          select: messageSelect,
        });
        if (replay) {
          if (
            replay.direction !== ChannelMessageDirection.OUTBOUND ||
            replay.body !== input.body ||
            replay.invoiceId !== input.invoiceId ||
            replay.approvedById !== input.actorId
          ) {
            throw new WhatsAppRepositoryError('IDEMPOTENCY_CONFLICT');
          }
          return { record: replay, replayed: true };
        }

        const [connection, invoice] = await Promise.all([
          transaction.whatsAppConnection.findUnique({
            where: {
              organizationId_provider: {
                organizationId: input.organizationId,
                provider: WhatsAppProvider.META,
              },
            },
            select: {
              id: true,
              state: true,
              providerPhoneNumberId: true,
            },
          }),
          transaction.invoice.findFirst({
            where: {
              id: input.invoiceId,
              debtorId: input.debtorId,
              organizationId: input.organizationId,
              deletedAt: null,
            },
            select: {
              id: true,
              invoiceNumber: true,
              debtor: { select: { phoneNumber: true } },
            },
          }),
        ]);
        if (!connection || !invoice) return null;
        if (!canEnqueueOutbound(connection.state)) {
          throw new WhatsAppRepositoryError('CHANNEL_NOT_LIVE');
        }
        if (!connection.providerPhoneNumberId) {
          throw new WhatsAppRepositoryError('SENDER_NOT_CONFIGURED');
        }
        const recipient = invoice.debtor.phoneNumber
          ? normalizeE164PhoneNumber(invoice.debtor.phoneNumber)
          : null;
        if (!recipient) throw new WhatsAppRepositoryError('RECIPIENT_MISSING');

        const thread = await transaction.conversationThread.upsert({
          where: {
            organizationId_normalizedCustomerNumber: {
              organizationId: input.organizationId,
              normalizedCustomerNumber: recipient,
            },
          },
          update: {
            debtorId: input.debtorId,
            currentInvoiceId: input.invoiceId,
            matchState: ConversationMatchState.MATCHED,
            lastMessageAt: input.occurredAt,
          },
          create: {
            organizationId: input.organizationId,
            connectionId: connection.id,
            debtorId: input.debtorId,
            currentInvoiceId: input.invoiceId,
            normalizedCustomerNumber: recipient,
            matchState: ConversationMatchState.MATCHED,
            lastMessageAt: input.occurredAt,
          },
          select: { id: true },
        });
        const message = await transaction.channelMessage.create({
          data: {
            organizationId: input.organizationId,
            connectionId: connection.id,
            threadId: thread.id,
            invoiceId: input.invoiceId,
            direction: ChannelMessageDirection.OUTBOUND,
            type: ChannelMessageType.TEXT,
            state: ChannelMessageState.QUEUED,
            operationKey: input.operationKey,
            body: input.body,
            approvedById: input.actorId,
            approvedAt: input.occurredAt,
            occurredAt: input.occurredAt,
            outbox: { create: { organizationId: input.organizationId } },
          },
          select: messageSelect,
        });
        await transaction.communication.create({
          data: {
            organizationId: input.organizationId,
            invoiceId: input.invoiceId,
            actorId: input.actorId,
            actorRole: input.actorRole,
            operationKey: input.operationKey,
            occurredAt: input.occurredAt,
            channel: CommunicationChannel.WHATSAPP,
            notes: `Approved WhatsApp message: ${input.body}`,
          },
        });
        await transaction.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            action: 'WHATSAPP_MESSAGE_APPROVED',
            entityType: 'ChannelMessage',
            entityId: message.id,
            requestId: input.requestId,
            metadata: {
              invoiceId: input.invoiceId,
              operationKey: input.operationKey,
              characterCount: input.body.length,
            },
          },
        });
        return { record: message, replayed: false };
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new WhatsAppRepositoryError('IDEMPOTENCY_CONFLICT');
      }
      throw error;
    }
  }

  async leaseOutbox(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<OutboxLease | null> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = await this.database.messageOutbox.findFirst({
        where: {
          state: { in: [MessageOutboxState.PENDING, MessageOutboxState.RETRY] },
          nextAttemptAt: { lte: input.now },
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: input.now } },
          ],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      if (!candidate) return null;
      const claimed = await this.database.messageOutbox.updateMany({
        where: {
          id: candidate.id,
          state: { in: [MessageOutboxState.PENDING, MessageOutboxState.RETRY] },
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: input.now } },
          ],
        },
        data: {
          state: MessageOutboxState.PROCESSING,
          leaseOwner: input.workerId,
          leaseExpiresAt: input.leaseExpiresAt,
          attemptCount: { increment: 1 },
          safeErrorCode: null,
        },
      });
      if (claimed.count !== 1) continue;
      const lease = await this.database.messageOutbox.findUniqueOrThrow({
        where: { id: candidate.id },
        select: {
          id: true,
          attemptCount: true,
          channelMessage: {
            select: {
              id: true,
              body: true,
              thread: { select: { normalizedCustomerNumber: true } },
              connection: { select: { providerPhoneNumberId: true } },
            },
          },
        },
      });
      if (
        !lease.channelMessage.body ||
        !lease.channelMessage.connection.providerPhoneNumberId
      ) {
        await this.retryOutbox({
          id: lease.id,
          nextAttemptAt: input.now,
          safeErrorCode: 'OUTBOX_DATA_INVALID',
          terminal: true,
        });
        return null;
      }
      return {
        id: lease.id,
        attemptCount: lease.attemptCount,
        message: {
          id: lease.channelMessage.id,
          body: lease.channelMessage.body,
          recipient: lease.channelMessage.thread.normalizedCustomerNumber,
          providerPhoneNumberId:
            lease.channelMessage.connection.providerPhoneNumberId,
        },
      };
    }
    return null;
  }

  async completeOutbox(input: {
    id: string;
    providerMessageId: string;
    sentAt: Date;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const outbox = await transaction.messageOutbox.update({
        where: { id: input.id },
        data: {
          state: MessageOutboxState.SENT,
          sentAt: input.sentAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          safeErrorCode: null,
        },
        select: { channelMessageId: true },
      });
      await transaction.channelMessage.update({
        where: { id: outbox.channelMessageId },
        data: {
          providerMessageId: input.providerMessageId,
          state: ChannelMessageState.SENT,
          safeFailureCode: null,
        },
      });
    });
  }

  async retryOutbox(input: {
    id: string;
    nextAttemptAt: Date;
    safeErrorCode: string;
    terminal: boolean;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const outbox = await transaction.messageOutbox.update({
        where: { id: input.id },
        data: {
          state: input.terminal
            ? MessageOutboxState.FAILED
            : MessageOutboxState.RETRY,
          nextAttemptAt: input.nextAttemptAt,
          leaseOwner: null,
          leaseExpiresAt: null,
          safeErrorCode: input.safeErrorCode,
        },
        select: { channelMessageId: true },
      });
      if (input.terminal) {
        await transaction.channelMessage.update({
          where: { id: outbox.channelMessageId },
          data: {
            state: ChannelMessageState.FAILED,
            safeFailureCode: input.safeErrorCode,
          },
        });
      }
    });
  }

  async applyOutboundStatus(event: OutboundStatusEvent): Promise<boolean> {
    const connection = await this.database.whatsAppConnection.findUnique({
      where: {
        provider_providerPhoneNumberId: {
          provider: WhatsAppProvider.META,
          providerPhoneNumberId: event.providerPhoneNumberId,
        },
      },
      select: { id: true },
    });
    if (!connection) return false;
    const message = await this.database.channelMessage.findUnique({
      where: {
        connectionId_providerMessageId: {
          connectionId: connection.id,
          providerMessageId: event.providerMessageId,
        },
      },
      select: { id: true, state: true },
    });
    if (!message || !canAdvanceOutboundState(message.state, event.state))
      return false;
    await this.database.channelMessage.updateMany({
      where: { id: message.id, state: message.state },
      data: {
        state: event.state,
        safeFailureCode: event.safeFailureCode,
      },
    });
    return true;
  }

  async ingestInbound(event: InboundMessageEvent): Promise<IngestedInbound> {
    const connection = await this.database.whatsAppConnection.findUnique({
      where: {
        provider_providerPhoneNumberId: {
          provider: WhatsAppProvider.META,
          providerPhoneNumberId: event.providerPhoneNumberId,
        },
      },
      select: { id: true, organizationId: true },
    });
    if (!connection) throw new WhatsAppRepositoryError('UNKNOWN_CONNECTION');

    const existingMessage = await this.database.channelMessage.findUnique({
      where: {
        connectionId_providerMessageId: {
          connectionId: connection.id,
          providerMessageId: event.providerMessageId,
        },
      },
      select: {
        mediaAsset: {
          select: { id: true, providerMediaId: true, organizationId: true },
        },
      },
    });
    if (existingMessage) {
      return {
        duplicate: true,
        media: requiredMedia(existingMessage.mediaAsset),
      };
    }

    const debtors = await this.database.debtor.findMany({
      where: {
        organizationId: connection.organizationId,
        deletedAt: null,
        phoneNumber: { not: null },
      },
      select: { id: true, phoneNumber: true },
      take: 10_001,
    });
    if (debtors.length > 10_000) {
      throw new WhatsAppRepositoryError('MATCH_SCOPE_TOO_LARGE');
    }
    const matches = debtors.filter(({ phoneNumber }) => {
      try {
        return (
          phoneNumber !== null &&
          normalizeE164PhoneNumber(phoneNumber) === event.customerNumber
        );
      } catch {
        return false;
      }
    });
    const matchState =
      matches.length === 1
        ? ConversationMatchState.MATCHED
        : matches.length > 1
          ? ConversationMatchState.AMBIGUOUS
          : ConversationMatchState.UNMATCHED;
    const debtorId = matches.length === 1 ? matches[0]!.id : null;

    try {
      return await this.database.$transaction(async (transaction) => {
        const existingThread = await transaction.conversationThread.findUnique({
          where: {
            organizationId_normalizedCustomerNumber: {
              organizationId: connection.organizationId,
              normalizedCustomerNumber: event.customerNumber,
            },
          },
          select: {
            id: true,
            debtorId: true,
            currentInvoiceId: true,
            matchState: true,
          },
        });
        const thread = existingThread
          ? await transaction.conversationThread.update({
              where: { id: existingThread.id },
              data: threadUpdateData({
                customerName: event.customerName,
                occurredAt: event.occurredAt,
                alreadyMatched: existingThread.debtorId !== null,
                debtorId,
                matchState,
              }),
              select: {
                id: true,
                debtorId: true,
                currentInvoiceId: true,
              },
            })
          : await transaction.conversationThread.create({
              data: {
                organizationId: connection.organizationId,
                connectionId: connection.id,
                debtorId,
                normalizedCustomerNumber: event.customerNumber,
                customerDisplayName: event.customerName,
                matchState,
                lastMessageAt: event.occurredAt,
              },
              select: {
                id: true,
                debtorId: true,
                currentInvoiceId: true,
              },
            });

        const message = await transaction.channelMessage.create({
          data: {
            organizationId: connection.organizationId,
            connectionId: connection.id,
            threadId: thread.id,
            invoiceId: thread.currentInvoiceId,
            direction: ChannelMessageDirection.INBOUND,
            type:
              event.kind === 'image'
                ? ChannelMessageType.IMAGE
                : ChannelMessageType.TEXT,
            state:
              event.kind === 'image'
                ? ChannelMessageState.PROCESSING
                : ChannelMessageState.READY,
            providerMessageId: event.providerMessageId,
            body: event.kind === 'text' ? event.body : event.caption,
            occurredAt: event.occurredAt,
            ...(event.kind === 'image'
              ? {
                  mediaAsset: {
                    create: {
                      organizationId: connection.organizationId,
                      providerMediaId: event.providerMediaId,
                      evidence: {
                        create: {
                          organizationId: connection.organizationId,
                          debtorId: thread.debtorId,
                          invoiceId: thread.currentInvoiceId,
                        },
                      },
                    },
                  },
                }
              : {}),
          },
          select: {
            mediaAsset: {
              select: { id: true, providerMediaId: true, organizationId: true },
            },
          },
        });
        return {
          duplicate: false,
          media: requiredMedia(message.mediaAsset),
        };
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      return { duplicate: true, media: null };
    }
  }

  async completeMedia(input: {
    mediaId: string;
    objectKey: string;
    sha256: string;
    mime: string;
    byteSize: number;
    width: number;
    height: number;
    processedAt: Date;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const media = await transaction.mediaAsset.update({
        where: { id: input.mediaId },
        data: {
          objectKey: input.objectKey,
          sha256: input.sha256,
          detectedMime: input.mime,
          byteSize: input.byteSize,
          width: input.width,
          height: input.height,
          processingState: MediaProcessingState.READY,
          processingStartedAt: input.processedAt,
          processedAt: input.processedAt,
          failureCode: null,
        },
        select: { messageId: true },
      });
      await transaction.paymentEvidenceReview.update({
        where: { mediaAssetId: input.mediaId },
        data: { state: PaymentEvidenceState.AWAITING_REVIEW },
      });
      await transaction.channelMessage.update({
        where: { id: media.messageId },
        data: { state: ChannelMessageState.READY },
      });
    });
  }

  async failMedia(input: {
    mediaId: string;
    failureCode: string;
    processedAt: Date;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const media = await transaction.mediaAsset.update({
        where: { id: input.mediaId },
        data: {
          processingState: MediaProcessingState.FAILED,
          failureCode: input.failureCode,
          processedAt: input.processedAt,
        },
        select: { messageId: true },
      });
      await transaction.paymentEvidenceReview.update({
        where: { mediaAssetId: input.mediaId },
        data: { state: PaymentEvidenceState.UNAVAILABLE },
      });
      await transaction.channelMessage.update({
        where: { id: media.messageId },
        data: {
          state: ChannelMessageState.FAILED,
          safeFailureCode: input.failureCode,
        },
      });
    });
  }

  async getConnection(
    organizationId: string,
  ): Promise<WhatsAppConnectionRecord | null> {
    return this.database.whatsAppConnection.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: WhatsAppProvider.META,
        },
      },
      select: connectionSelect,
    });
  }

  async updateConnectionState(input: {
    organizationId: string;
    actorId: string;
    state: WhatsAppConnectionState;
    requestId: string;
  }): Promise<WhatsAppConnectionRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const connection = await transaction.whatsAppConnection.findUnique({
        where: {
          organizationId_provider: {
            organizationId: input.organizationId,
            provider: WhatsAppProvider.META,
          },
        },
        select: { id: true },
      });
      if (!connection) return null;
      const updated = await transaction.whatsAppConnection.update({
        where: { id: connection.id },
        data: { state: input.state },
        select: connectionSelect,
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: 'WHATSAPP_CONNECTION_STATE_CHANGED',
          entityType: 'WhatsAppConnection',
          entityId: connection.id,
          requestId: input.requestId,
          metadata: { state: input.state },
        },
      });
      return updated;
    });
  }

  async linkThread(input: {
    organizationId: string;
    threadId: string;
    debtorId: string;
    invoiceId: string;
    actorId: string;
    operationKey: string;
    requestId: string;
    occurredAt: Date;
  }): Promise<ThreadRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const replay = await transaction.auditLog.findFirst({
        where: {
          organizationId: input.organizationId,
          action: 'WHATSAPP_THREAD_LINKED',
          entityType: 'ConversationThread',
          entityId: input.threadId,
          metadata: { path: ['operationKey'], equals: input.operationKey },
        },
        select: { id: true },
      });
      const [thread, invoice] = await Promise.all([
        transaction.conversationThread.findFirst({
          where: { id: input.threadId, organizationId: input.organizationId },
          select: { id: true },
        }),
        transaction.invoice.findFirst({
          where: {
            id: input.invoiceId,
            debtorId: input.debtorId,
            organizationId: input.organizationId,
            deletedAt: null,
          },
          select: { id: true },
        }),
      ]);
      if (!thread || !invoice) return null;
      if (!replay) {
        await transaction.conversationThread.update({
          where: { id: input.threadId },
          data: {
            debtorId: input.debtorId,
            currentInvoiceId: input.invoiceId,
            matchState: ConversationMatchState.MATCHED,
          },
        });
        await transaction.paymentEvidenceReview.updateMany({
          where: {
            organizationId: input.organizationId,
            debtorId: null,
            mediaAsset: { message: { threadId: input.threadId } },
          },
          data: { debtorId: input.debtorId, invoiceId: input.invoiceId },
        });
        await transaction.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorId: input.actorId,
            action: 'WHATSAPP_THREAD_LINKED',
            entityType: 'ConversationThread',
            entityId: input.threadId,
            requestId: input.requestId,
            metadata: {
              operationKey: input.operationKey,
              debtorId: input.debtorId,
              invoiceId: input.invoiceId,
            },
          },
        });
      }
      return this.threadById(
        transaction,
        input.organizationId,
        input.threadId,
        100,
      );
    });
  }

  async rejectEvidence(input: {
    organizationId: string;
    evidenceId: string;
    actorId: string;
    operationKey: string;
    requestId: string;
    reason: string;
    occurredAt: Date;
  }): Promise<{ record: EvidenceRecord; replayed: boolean } | null> {
    return this.database.$transaction(async (transaction) => {
      const evidence = await transaction.paymentEvidenceReview.findFirst({
        where: { id: input.evidenceId, organizationId: input.organizationId },
        select: {
          id: true,
          state: true,
          reviewerId: true,
          rejectionReason: true,
          operationKey: true,
        },
      });
      if (!evidence) return null;
      if (evidence.operationKey === input.operationKey) {
        if (
          evidence.state !== PaymentEvidenceState.REJECTED ||
          evidence.reviewerId !== input.actorId ||
          evidence.rejectionReason !== input.reason
        ) {
          throw new WhatsAppRepositoryError('IDEMPOTENCY_CONFLICT');
        }
        const replay = await this.evidenceById(
          transaction,
          input.organizationId,
          input.evidenceId,
        );
        return replay ? { record: replay, replayed: true } : null;
      }
      if (evidence.state !== PaymentEvidenceState.AWAITING_REVIEW) {
        throw new WhatsAppRepositoryError('EVIDENCE_NOT_REVIEWABLE');
      }
      await transaction.paymentEvidenceReview.update({
        where: { id: input.evidenceId },
        data: {
          state: PaymentEvidenceState.REJECTED,
          reviewerId: input.actorId,
          reviewedAt: input.occurredAt,
          rejectionReason: input.reason,
          operationKey: input.operationKey,
        },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorId: input.actorId,
          action: 'PAYMENT_EVIDENCE_REJECTED',
          entityType: 'PaymentEvidenceReview',
          entityId: input.evidenceId,
          requestId: input.requestId,
          metadata: { operationKey: input.operationKey, reason: input.reason },
        },
      });
      const record = await this.evidenceById(
        transaction,
        input.organizationId,
        input.evidenceId,
      );
      return record ? { record, replayed: false } : null;
    });
  }

  async getThread(input: {
    organizationId: string;
    debtorId: string;
    invoiceId?: string | undefined;
    limit: number;
  }): Promise<{ debtorExists: boolean; thread: ThreadRecord | null }> {
    const debtor = await this.database.debtor.findFirst({
      where: {
        id: input.debtorId,
        organizationId: input.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!debtor) return { debtorExists: false, thread: null };
    if (input.invoiceId) {
      const invoice = await this.database.invoice.findFirst({
        where: {
          id: input.invoiceId,
          organizationId: input.organizationId,
          debtorId: input.debtorId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!invoice) return { debtorExists: false, thread: null };
    }
    const thread = await this.database.conversationThread.findFirst({
      where: {
        organizationId: input.organizationId,
        debtorId: input.debtorId,
      },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true,
        normalizedCustomerNumber: true,
        customerDisplayName: true,
        matchState: true,
        lastMessageAt: true,
        debtor: { select: { id: true, name: true, code: true } },
        currentInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            originalAmount: true,
            dueDate: true,
          },
        },
        messages: {
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: input.limit,
          select: messageSelect,
        },
      },
    });
    return {
      debtorExists: true,
      thread: thread
        ? {
            ...thread,
            currentInvoice: thread.currentInvoice
              ? {
                  ...thread.currentInvoice,
                  originalAmount:
                    thread.currentInvoice.originalAmount.toFixed(2),
                }
              : null,
            messages: [...thread.messages].reverse(),
          }
        : null,
    };
  }

  async getEvidence(
    organizationId: string,
    evidenceId: string,
  ): Promise<EvidenceRecord | null> {
    return this.evidenceById(this.database, organizationId, evidenceId);
  }

  private async evidenceById(
    database: Prisma.TransactionClient | PrismaClient,
    organizationId: string,
    evidenceId: string,
  ): Promise<EvidenceRecord | null> {
    return database.paymentEvidenceReview.findFirst({
      where: { id: evidenceId, organizationId },
      select: {
        id: true,
        state: true,
        createdAt: true,
        debtor: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
        mediaAsset: {
          select: {
            id: true,
            objectKey: true,
            detectedMime: true,
            byteSize: true,
            width: true,
            height: true,
            processingState: true,
            message: {
              select: {
                id: true,
                occurredAt: true,
                thread: {
                  select: {
                    id: true,
                    normalizedCustomerNumber: true,
                    customerDisplayName: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private async threadById(
    database: Prisma.TransactionClient | PrismaClient,
    organizationId: string,
    threadId: string,
    limit: number,
  ): Promise<ThreadRecord | null> {
    const thread = await database.conversationThread.findFirst({
      where: { id: threadId, organizationId },
      select: {
        id: true,
        normalizedCustomerNumber: true,
        customerDisplayName: true,
        matchState: true,
        lastMessageAt: true,
        debtor: { select: { id: true, name: true, code: true } },
        currentInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            originalAmount: true,
            dueDate: true,
          },
        },
        messages: {
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: limit,
          select: messageSelect,
        },
      },
    });
    return thread
      ? {
          ...thread,
          currentInvoice: thread.currentInvoice
            ? {
                ...thread.currentInvoice,
                originalAmount: thread.currentInvoice.originalAmount.toFixed(2),
              }
            : null,
          messages: [...thread.messages].reverse(),
        }
      : null;
  }
}

export class WhatsAppRepositoryError extends Error {
  constructor(
    readonly code:
      | 'UNKNOWN_CONNECTION'
      | 'MATCH_SCOPE_TOO_LARGE'
      | 'IDEMPOTENCY_CONFLICT'
      | 'CHANNEL_NOT_LIVE'
      | 'SENDER_NOT_CONFIGURED'
      | 'RECIPIENT_MISSING'
      | 'EVIDENCE_NOT_REVIEWABLE',
  ) {
    super(code);
    this.name = 'WhatsAppRepositoryError';
  }
}

const connectionSelect = {
  id: true,
  provider: true,
  displayPhoneNumber: true,
  state: true,
  lastWebhookAt: true,
  lastHealthyAt: true,
  lastFailureCode: true,
} satisfies Prisma.WhatsAppConnectionSelect;

const messageSelect = {
  id: true,
  invoiceId: true,
  approvedById: true,
  direction: true,
  type: true,
  state: true,
  body: true,
  occurredAt: true,
  safeFailureCode: true,
  mediaAsset: {
    select: {
      id: true,
      detectedMime: true,
      byteSize: true,
      width: true,
      height: true,
      processingState: true,
      failureCode: true,
      evidence: { select: { id: true, state: true, invoiceId: true } },
    },
  },
} satisfies Prisma.ChannelMessageSelect;

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function requiredMedia(
  media: {
    id: string;
    providerMediaId: string | null;
    organizationId: string;
  } | null,
): IngestedInbound['media'] {
  return media?.providerMediaId
    ? { ...media, providerMediaId: media.providerMediaId }
    : null;
}

function threadUpdateData(input: {
  customerName: string | null;
  occurredAt: Date;
  alreadyMatched: boolean;
  debtorId: string | null;
  matchState: ConversationMatchState;
}): Prisma.ConversationThreadUncheckedUpdateInput {
  return {
    lastMessageAt: input.occurredAt,
    ...(input.customerName ? { customerDisplayName: input.customerName } : {}),
    ...(input.alreadyMatched
      ? {}
      : { debtorId: input.debtorId, matchState: input.matchState }),
  };
}
