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

export interface DownloadedMedia {
  bytes: Uint8Array;
  declaredMime: string | null;
}

export interface WhatsAppProviderAdapter {
  downloadMedia(providerMediaId: string): Promise<DownloadedMedia>;
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
