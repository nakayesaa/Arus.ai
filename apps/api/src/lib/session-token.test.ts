import { describe, expect, it } from 'vitest';

import {
  createSessionToken,
  hashSessionToken,
  isSessionToken,
} from './session-token.js';

describe('session token primitives', () => {
  it('creates a URL-safe token with 256 bits of entropy', () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(isSessionToken(first)).toBe(true);
  });

  it('rejects malformed cookie values before repository lookup', () => {
    expect(isSessionToken('')).toBe(false);
    expect(isSessionToken('a'.repeat(42))).toBe(false);
    expect(isSessionToken(`${'a'.repeat(42)}=`)).toBe(false);
    expect(isSessionToken('a'.repeat(44))).toBe(false);
  });

  it('uses a keyed deterministic hash without storing the raw token', () => {
    const token = 'a'.repeat(43);
    const first = hashSessionToken(token, 'secret-one');
    const second = hashSessionToken(token, 'secret-two');

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
    expect(first).not.toContain(token);
  });
});
