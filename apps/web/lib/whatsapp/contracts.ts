import { z } from 'zod';

/**
 * Browser contracts distrust every WhatsApp response at the network edge.
 * Schemas expose only normalized channel, evidence, and payment-safe fields.
 * Exact message bodies remain bounded to the same limits as the API.
 * Signed evidence links are short-lived values, never durable application data.
 * Shared inferred types keep the Adaptive Review UI free of duplicate models.
 */

const timestampSchema = z.iso.datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();
const connectionStateSchema = z.enum([
  'DISCONNECTED',
  'LIVE',
  'PAUSED',
  'DEGRADED',
]);
const evidenceStateSchema = z.enum([
  'PROCESSING',
  'AWAITING_REVIEW',
  'ACCEPTED',
  'REJECTED',
  'UNAVAILABLE',
]);

export const whatsappConnectionSchema = z.object({
  id: z.uuid(),
  provider: z.literal('META'),
  displayPhoneNumber: z.string().max(32).nullable(),
  state: connectionStateSchema,
  lastWebhookAt: nullableTimestampSchema,
  lastHealthyAt: nullableTimestampSchema,
  lastFailureCode: z.string().max(80).nullable(),
});

export const whatsappMessageSchema = z.object({
  id: z.uuid(),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  type: z.enum(['TEXT', 'IMAGE']),
  state: z.enum([
    'DRAFT',
    'APPROVED',
    'QUEUED',
    'SENT',
    'DELIVERED',
    'READ',
    'FAILED',
    'RECEIVED',
    'PROCESSING',
    'READY',
  ]),
  body: z.string().max(4_096).nullable(),
  occurredAt: timestampSchema,
  safeFailureCode: z.string().max(80).nullable(),
  media: z
    .object({
      id: z.uuid(),
      mime: z.string().max(80).nullable(),
      byteSize: z.number().int().nonnegative().nullable(),
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
      processingState: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
      failureCode: z.string().max(80).nullable(),
      evidence: z
        .object({
          id: z.uuid(),
          state: evidenceStateSchema,
          invoiceId: z.uuid().nullable(),
        })
        .nullable(),
    })
    .nullable(),
});

export const whatsappThreadResponseSchema = z.object({
  data: z.object({
    connection: whatsappConnectionSchema.nullable(),
    thread: z
      .object({
        id: z.uuid(),
        customerNumber: z.string().max(32),
        customerDisplayName: z.string().max(200).nullable(),
        matchState: z.enum(['MATCHED', 'UNMATCHED', 'AMBIGUOUS']),
        lastMessageAt: nullableTimestampSchema,
        debtor: z
          .object({
            id: z.uuid(),
            name: z.string().max(200),
            code: z.string().max(50).nullable(),
          })
          .nullable(),
        currentInvoice: z
          .object({
            id: z.uuid(),
            invoiceNumber: z.string().max(50),
            originalAmount: z.string().regex(/^\d+\.\d{2}$/u),
            dueDate: z.iso.date(),
          })
          .nullable(),
        messages: z.array(whatsappMessageSchema).max(100),
      })
      .nullable(),
  }),
});

export const whatsappConnectionResponseSchema = z.object({
  data: whatsappConnectionSchema,
});
export const nullableWhatsAppConnectionResponseSchema = z.object({
  data: whatsappConnectionSchema.nullable(),
});
export const whatsappMessageResponseSchema = z.object({
  data: whatsappMessageSchema,
  replayed: z.boolean(),
});
export const paymentEvidenceSchema = z.object({
  id: z.uuid(),
  state: evidenceStateSchema,
  createdAt: timestampSchema,
  debtor: z.object({ id: z.uuid(), name: z.string().max(200) }).nullable(),
  invoice: z
    .object({ id: z.uuid(), invoiceNumber: z.string().max(100) })
    .nullable(),
  source: z.object({
    messageId: z.uuid(),
    occurredAt: timestampSchema,
    threadId: z.uuid(),
    customerNumber: z.string().max(32),
    customerDisplayName: z.string().max(200).nullable(),
  }),
  media: z.object({
    id: z.uuid(),
    mime: z.string().max(80).nullable(),
    byteSize: z.number().int().nonnegative().nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    processingState: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
  }),
});
export const paymentEvidenceResponseSchema = z.object({
  data: paymentEvidenceSchema,
});
export const evidenceDecisionResponseSchema = z.object({
  data: paymentEvidenceSchema,
  replayed: z.boolean(),
});
export const evidenceViewResponseSchema = z.object({
  data: z.object({ url: z.url(), expiresAt: timestampSchema }),
});

export type WhatsAppConnection = z.infer<typeof whatsappConnectionSchema>;
export type WhatsAppThreadResponse = z.infer<
  typeof whatsappThreadResponseSchema
>;
export type WhatsAppThread = NonNullable<
  WhatsAppThreadResponse['data']['thread']
>;
export type WhatsAppMessage = WhatsAppThread['messages'][number];
export type PaymentEvidence = z.infer<typeof paymentEvidenceSchema>;
