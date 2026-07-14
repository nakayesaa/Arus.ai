import { createHmac, randomBytes } from 'node:crypto';

import type { AccountTokenPurpose } from '../generated/prisma/enums.js';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createAccountToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function isAccountToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function hashAccountToken(
  token: string,
  purpose: AccountTokenPurpose,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`account:${purpose}:${token}`)
    .digest('hex');
}
