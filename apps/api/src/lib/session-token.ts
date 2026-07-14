import { createHmac, randomBytes } from 'node:crypto';

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function isSessionToken(value: string): boolean {
  return SESSION_TOKEN_PATTERN.test(value);
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
