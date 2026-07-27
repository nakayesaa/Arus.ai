import { DomainError } from './errors.js';

export const whatsappConnectionStates = [
  'DISCONNECTED',
  'LIVE',
  'PAUSED',
  'DEGRADED',
] as const;
export type WhatsAppConnectionState = (typeof whatsappConnectionStates)[number];

export const conversationMatchStates = [
  'MATCHED',
  'UNMATCHED',
  'AMBIGUOUS',
] as const;
export type ConversationMatchState = (typeof conversationMatchStates)[number];

export const evidenceStates = [
  'PROCESSING',
  'AWAITING_REVIEW',
  'ACCEPTED',
  'REJECTED',
  'UNAVAILABLE',
] as const;
export type EvidenceState = (typeof evidenceStates)[number];

export const supportedEvidenceMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type SupportedEvidenceMime = (typeof supportedEvidenceMimeTypes)[number];

export interface ValidatedImage {
  mime: SupportedEvidenceMime;
  width: number;
  height: number;
  byteSize: number;
}

export function normalizeE164PhoneNumber(value: string): string {
  const compact = value.trim().replaceAll(/[\s().-]/gu, '');
  if (!/^\+[1-9]\d{7,14}$/u.test(compact)) {
    throw new DomainError(
      'INVALID_E164_PHONE_NUMBER',
      'Phone number must use international E.164 format',
    );
  }
  return compact;
}

export function canEnqueueOutbound(state: WhatsAppConnectionState): boolean {
  return state === 'LIVE';
}

export function assertEvidenceTransition(
  current: EvidenceState,
  next: EvidenceState,
): void {
  const allowed: Record<EvidenceState, readonly EvidenceState[]> = {
    PROCESSING: ['AWAITING_REVIEW', 'UNAVAILABLE'],
    AWAITING_REVIEW: ['ACCEPTED', 'REJECTED', 'UNAVAILABLE'],
    ACCEPTED: [],
    REJECTED: [],
    UNAVAILABLE: [],
  };
  if (!allowed[current].includes(next)) {
    throw new DomainError(
      'INVALID_EVIDENCE_TRANSITION',
      `Evidence cannot transition from ${current} to ${next}`,
    );
  }
}

export function retryDelayMs(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new DomainError(
      'INVALID_RETRY_ATTEMPT',
      'Retry attempt must be a positive integer',
    );
  }
  return Math.min(1_000 * 2 ** Math.min(attempt - 1, 8), 300_000);
}

export function validateEvidenceImage(
  bytes: Uint8Array,
  maximumBytes: number,
): ValidatedImage {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) {
    throw new DomainError(
      'INVALID_IMAGE_LIMIT',
      'Image byte limit must be a positive integer',
    );
  }
  if (bytes.byteLength === 0) {
    throw new DomainError('EMPTY_IMAGE', 'Evidence image is empty');
  }
  if (bytes.byteLength > maximumBytes) {
    throw new DomainError(
      'IMAGE_TOO_LARGE',
      'Evidence image exceeds the configured byte limit',
    );
  }

  const dimensions =
    pngDimensions(bytes) ?? jpegDimensions(bytes) ?? webpDimensions(bytes);
  if (!dimensions) {
    throw new DomainError(
      'UNSUPPORTED_IMAGE',
      'Evidence must be a valid JPEG, PNG, or WebP image',
    );
  }
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > 12_000 ||
    dimensions.height > 12_000
  ) {
    throw new DomainError(
      'INVALID_IMAGE_DIMENSIONS',
      'Evidence image dimensions are outside the supported range',
    );
  }
  return { ...dimensions, byteSize: bytes.byteLength };
}

function pngDimensions(
  bytes: Uint8Array,
): Pick<ValidatedImage, 'mime' | 'width' | 'height'> | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    !signature.every((value, index) => bytes[index] === value)
  ) {
    return null;
  }
  return {
    mime: 'image/png',
    width: readUint32(bytes, 16),
    height: readUint32(bytes, 20),
  };
}

function jpegDimensions(
  bytes: Uint8Array,
): Pick<ValidatedImage, 'mime' | 'width' | 'height'> | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === undefined) return null;
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = readUint16(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        mime: 'image/jpeg',
        height: readUint16(bytes, offset + 3),
        width: readUint16(bytes, offset + 5),
      };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(
  bytes: Uint8Array,
): Pick<ValidatedImage, 'mime' | 'width' | 'height'> | null {
  if (
    bytes.length < 30 ||
    ascii(bytes, 0, 4) !== 'RIFF' ||
    ascii(bytes, 8, 4) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8X') {
    return {
      mime: 'image/webp',
      width: readUint24LittleEndian(bytes, 24) + 1,
      height: readUint24LittleEndian(bytes, 27) + 1,
    };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const b1 = bytes[21] ?? 0;
    const b2 = bytes[22] ?? 0;
    const b3 = bytes[23] ?? 0;
    const b4 = bytes[24] ?? 0;
    return {
      mime: 'image/webp',
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0xf) << 10) | (b3 << 2) | (b2 >> 6)),
    };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return {
      mime: 'image/webp',
      width: readUint16LittleEndian(bytes, 26) & 0x3fff,
      height: readUint16LittleEndian(bytes, 28) & 0x3fff,
    };
  }
  return null;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
