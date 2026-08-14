import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type { InboundMessageEvent, OutboundStatusEvent } from './contracts.js';

/**
 * This module reduces Meta webhooks to bounded, provider-neutral events.
 * Raw bytes are verified before any parser in this file is called.
 * Unknown message types are ignored while malformed envelopes are rejected.
 * Delivery errors are converted to safe codes instead of retained verbatim.
 * The durable inbox lets parsing and processing retry outside the HTTP request.
 */

const metadataSchema = z.object({
  phone_number_id: z.string().min(1).max(100),
});
const contactSchema = z.object({
  wa_id: z.string().min(8).max(32),
  profile: z.object({ name: z.string().trim().min(1).max(200) }).optional(),
});
const messageSchema = z.object({
  id: z.string().min(1).max(160),
  from: z.string().min(8).max(32),
  timestamp: z.string().regex(/^\d{1,16}$/u),
  type: z.string(),
  text: z.object({ body: z.string().max(4_096) }).optional(),
  image: z
    .object({
      id: z.string().min(1).max(160),
      mime_type: z.string().max(100).optional(),
      caption: z.string().max(4_096).optional(),
    })
    .optional(),
});
const statusSchema = z.object({
  id: z.string().min(1).max(160),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.string().regex(/^\d{1,16}$/u),
  errors: z
    .array(z.object({ code: z.number().int().optional() }))
    .max(20)
    .optional(),
});
const valueSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  metadata: metadataSchema,
  contacts: z.array(contactSchema).max(1_000).optional(),
  messages: z.array(messageSchema).max(1_000).optional(),
  statuses: z.array(statusSchema).max(1_000).optional(),
});
const payloadSchema = z
  .object({
    object: z.literal('whatsapp_business_account'),
    entry: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          changes: z
            .array(
              z.object({
                field: z.literal('messages'),
                value: valueSchema,
              }),
            )
            .max(1_000),
        }),
      )
      .max(1_000),
  })
  .strict();

export type MetaWebhookPayload = z.infer<typeof payloadSchema>;

export function verifyMetaSignature(input: {
  rawBody: Uint8Array;
  signatureHeader: string | undefined;
  appSecret: string;
}): boolean {
  const expected = createHmac('sha256', input.appSecret)
    .update(input.rawBody)
    .digest();
  const suppliedHex = input.signatureHeader?.match(
    /^sha256=([a-f0-9]{64})$/u,
  )?.[1];
  if (!suppliedHex) return false;
  const supplied = Buffer.from(suppliedHex, 'hex');
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function verifyWebhookToken(
  supplied: string,
  expected: string,
): boolean {
  const suppliedDigest = createHash('sha256').update(supplied).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

export function webhookEventIdentity(rawBody: Uint8Array): string {
  return `meta:${createHash('sha256').update(rawBody).digest('hex')}`;
}

export function parseMetaWebhookPayload(value: unknown): MetaWebhookPayload {
  return payloadSchema.parse(value);
}

export function connectionPhoneNumberId(
  payload: MetaWebhookPayload,
): string | null {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      return change.value.metadata.phone_number_id;
    }
  }
  return null;
}

export function inboundMessages(
  payload: MetaWebhookPayload,
): InboundMessageEvent[] {
  const events: InboundMessageEvent[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const contactsByNumber = new Map(
        (change.value.contacts ?? []).map((contact) => [
          contact.wa_id,
          contact.profile?.name ?? null,
        ]),
      );
      for (const message of change.value.messages ?? []) {
        const occurredAt = new Date(Number(message.timestamp) * 1_000);
        if (Number.isNaN(occurredAt.getTime())) continue;
        const base = {
          providerMessageId: message.id,
          providerPhoneNumberId: change.value.metadata.phone_number_id,
          customerNumber: `+${message.from}`,
          customerName: contactsByNumber.get(message.from) ?? null,
          occurredAt,
        };
        if (message.type === 'text' && message.text) {
          events.push({ kind: 'text', ...base, body: message.text.body });
        } else if (message.type === 'image' && message.image) {
          events.push({
            kind: 'image',
            ...base,
            providerMediaId: message.image.id,
            caption: message.image.caption ?? null,
          });
        }
      }
    }
  }
  return events;
}

export function outboundStatuses(
  payload: MetaWebhookPayload,
): OutboundStatusEvent[] {
  const events: OutboundStatusEvent[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      for (const status of change.value.statuses ?? []) {
        const occurredAt = new Date(Number(status.timestamp) * 1_000);
        if (Number.isNaN(occurredAt.getTime())) continue;
        events.push({
          providerMessageId: status.id,
          providerPhoneNumberId: change.value.metadata.phone_number_id,
          state: status.status.toUpperCase() as OutboundStatusEvent['state'],
          occurredAt,
          safeFailureCode:
            status.status === 'failed'
              ? `META_${status.errors?.[0]?.code ?? 'DELIVERY_FAILED'}`
              : null,
        });
      }
    }
  }
  return events;
}
