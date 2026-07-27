import { z } from 'zod';

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

const messageSchema = z.object({
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
        messages: z.array(messageSchema).max(100),
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

export type WhatsAppConnection = z.infer<typeof whatsappConnectionSchema>;
export type WhatsAppThreadResponse = z.infer<
  typeof whatsappThreadResponseSchema
>;
export type WhatsAppThread = NonNullable<
  WhatsAppThreadResponse['data']['thread']
>;
export type WhatsAppMessage = WhatsAppThread['messages'][number];
