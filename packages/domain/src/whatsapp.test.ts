import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  assertEvidenceTransition,
  canAdvanceOutboundState,
  canEnqueueOutbound,
  normalizeE164PhoneNumber,
  retryDelayMs,
  validateEvidenceImage,
} from './whatsapp.js';

/**
 * Domain tests pin provider-neutral WhatsApp rules as pure deterministic behavior.
 * Phone normalization never guesses country context or accepts local ambiguity.
 * Evidence and delivery states move forward through explicit legal transitions.
 * Retry delays remain bounded so external failure cannot create a hot loop.
 * Image signature checks reject forged or oversized customer evidence.
 */

describe('WhatsApp domain rules', () => {
  it('normalizes explicit E.164 numbers without guessing a country', () => {
    expect(normalizeE164PhoneNumber('+62 812-1000-0006')).toBe(
      '+6281210000006',
    );
    expect(() => normalizeE164PhoneNumber('081210000006')).toThrowError(
      DomainError,
    );
  });

  it('only allows outbound work for a live connection', () => {
    expect(canEnqueueOutbound('LIVE')).toBe(true);
    expect(canEnqueueOutbound('PAUSED')).toBe(false);
    expect(canEnqueueOutbound('DEGRADED')).toBe(false);
    expect(canEnqueueOutbound('DISCONNECTED')).toBe(false);
  });

  it('advances delivery monotonically and keeps late receipts harmless', () => {
    expect(canAdvanceOutboundState('QUEUED', 'SENT')).toBe(true);
    expect(canAdvanceOutboundState('SENT', 'DELIVERED')).toBe(true);
    expect(canAdvanceOutboundState('DELIVERED', 'READ')).toBe(true);
    expect(canAdvanceOutboundState('READ', 'DELIVERED')).toBe(false);
    expect(canAdvanceOutboundState('READ', 'FAILED')).toBe(false);
  });

  it('keeps evidence terminal decisions immutable', () => {
    expect(() =>
      assertEvidenceTransition('PROCESSING', 'AWAITING_REVIEW'),
    ).not.toThrow();
    expect(() =>
      assertEvidenceTransition('AWAITING_REVIEW', 'ACCEPTED'),
    ).not.toThrow();
    expect(() => assertEvidenceTransition('ACCEPTED', 'REJECTED')).toThrowError(
      DomainError,
    );
  });

  it('uses bounded exponential retry delays', () => {
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(4)).toBe(8_000);
    expect(retryDelayMs(99)).toBe(256_000);
  });

  it('validates PNG bytes and rejects forged or oversized evidence', () => {
    const png = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 2,
      0, 0, 0, 3,
    ]);
    expect(validateEvidenceImage(png, 1_024)).toEqual({
      mime: 'image/png',
      width: 2,
      height: 3,
      byteSize: 24,
    });
    expect(() =>
      validateEvidenceImage(Uint8Array.from([1, 2, 3]), 1_024),
    ).toThrowError(DomainError);
    expect(() => validateEvidenceImage(png, 8)).toThrowError(DomainError);
  });
});
