/**
 * Provider contracts are deliberately smaller than Meta's public payloads.
 * The worker receives only normalized data needed by Arus workflows.
 * Outbound sends return stable provider identity without implying delivery.
 * Delivery remains webhook-driven and advances through explicit states.
 * No access token, signed URL, or raw provider response crosses this boundary.
 */
export interface InboundTextEvent {
  kind: 'text';
  providerMessageId: string;
  providerPhoneNumberId: string;
  customerNumber: string;
  customerName: string | null;
  body: string;
  occurredAt: Date;
}

export interface InboundImageEvent {
  kind: 'image';
  providerMessageId: string;
  providerPhoneNumberId: string;
  providerMediaId: string;
  customerNumber: string;
  customerName: string | null;
  caption: string | null;
  occurredAt: Date;
}

export type InboundMessageEvent = InboundTextEvent | InboundImageEvent;

export interface OutboundStatusEvent {
  providerMessageId: string;
  providerPhoneNumberId: string;
  state: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  occurredAt: Date;
  safeFailureCode: string | null;
}

export interface DownloadedMedia {
  bytes: Uint8Array;
  declaredMime: string | null;
}

export interface WhatsAppProviderAdapter {
  downloadMedia(providerMediaId: string): Promise<DownloadedMedia>;
  sendText?(input: {
    providerPhoneNumberId: string;
    recipient: string;
    body: string;
  }): Promise<{ providerMessageId: string }>;
}

export interface EvidenceStorage {
  putPrivateObject(input: {
    objectKey: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<void>;
  createSignedReadUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string>;
}
