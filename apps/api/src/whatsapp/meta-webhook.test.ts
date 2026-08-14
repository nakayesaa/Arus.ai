import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  inboundMessages,
  outboundStatuses,
  parseMetaWebhookPayload,
  verifyMetaSignature,
  verifyWebhookToken,
  webhookEventIdentity,
} from './meta-webhook.js';

/**
 * Webhook boundary tests protect signature, identity, and event normalization.
 * Fixtures contain only synthetic provider identifiers and customer numbers.
 * Supported messages become typed inbound work while unknown types are ignored.
 * Delivery statuses advance through safe values without retaining provider text.
 * Raw-body changes must always invalidate the original signature.
 */

const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: 'phone-1' },
            contacts: [{ wa_id: '6281210000006', profile: { name: 'Nadia' } }],
            messages: [
              {
                id: 'wamid.text',
                from: '6281210000006',
                timestamp: '1785146400',
                type: 'text',
                text: { body: 'Payment proof follows.' },
              },
              {
                id: 'wamid.image',
                from: '6281210000006',
                timestamp: '1785146460',
                type: 'image',
                image: { id: 'media-1', mime_type: 'image/png' },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe('Meta webhook boundary', () => {
  it('verifies exact raw bytes with a constant-time digest comparison', () => {
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = createHmac('sha256', 'app-secret-for-tests')
      .update(rawBody)
      .digest('hex');

    expect(
      verifyMetaSignature({
        rawBody,
        signatureHeader: `sha256=${signature}`,
        appSecret: 'app-secret-for-tests',
      }),
    ).toBe(true);
    expect(
      verifyMetaSignature({
        rawBody: Buffer.from(`${rawBody.toString()} `),
        signatureHeader: `sha256=${signature}`,
        appSecret: 'app-secret-for-tests',
      }),
    ).toBe(false);
  });

  it('compares verification tokens safely', () => {
    expect(verifyWebhookToken('expected-token', 'expected-token')).toBe(true);
    expect(verifyWebhookToken('wrong-token', 'expected-token')).toBe(false);
  });

  it('derives a stable delivery identity from raw bytes', () => {
    const rawBody = Buffer.from(JSON.stringify(payload));
    expect(webhookEventIdentity(rawBody)).toBe(webhookEventIdentity(rawBody));
    expect(webhookEventIdentity(rawBody)).not.toBe(
      webhookEventIdentity(Buffer.from('{}')),
    );
  });

  it('maps only supported inbound text and image messages', () => {
    const events = inboundMessages(parseMetaWebhookPayload(payload));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: 'text',
      providerMessageId: 'wamid.text',
      customerNumber: '+6281210000006',
      customerName: 'Nadia',
    });
    expect(events[1]).toMatchObject({
      kind: 'image',
      providerMediaId: 'media-1',
    });
  });

  it('maps delivery receipts and reduces provider failures to safe codes', () => {
    const statusPayload = structuredClone(payload);
    const value = statusPayload.entry[0]!.changes[0]!.value as Record<
      string,
      unknown
    >;
    delete value.messages;
    value.statuses = [
      { id: 'wamid.sent', status: 'delivered', timestamp: '1785146500' },
      {
        id: 'wamid.failed',
        status: 'failed',
        timestamp: '1785146501',
        errors: [{ code: 131026 }],
      },
    ];
    expect(outboundStatuses(parseMetaWebhookPayload(statusPayload))).toEqual([
      expect.objectContaining({
        providerMessageId: 'wamid.sent',
        state: 'DELIVERED',
        safeFailureCode: null,
      }),
      expect.objectContaining({
        providerMessageId: 'wamid.failed',
        state: 'FAILED',
        safeFailureCode: 'META_131026',
      }),
    ]);
  });
});
