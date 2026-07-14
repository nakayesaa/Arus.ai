import type { Request, Response } from 'express';

import type { Environment } from '../config/env.js';

const DEVELOPMENT_COOKIE_NAME = 'arus_session';
const PRODUCTION_COOKIE_NAME = '__Host-arus_session';

export function sessionCookieName(
  environment: Pick<Environment, 'NODE_ENV'>,
): string {
  return environment.NODE_ENV === 'production'
    ? PRODUCTION_COOKIE_NAME
    : DEVELOPMENT_COOKIE_NAME;
}

export function readSessionCookie(
  request: Request,
  environment: Pick<Environment, 'NODE_ENV'>,
): string | null {
  const header = request.headers.cookie;

  if (!header) {
    return null;
  }

  const targetName = sessionCookieName(environment);

  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');

    if (separator < 1) {
      continue;
    }

    const name = segment.slice(0, separator).trim();

    if (name !== targetName) {
      continue;
    }

    const value = segment.slice(separator + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}

export function setSessionCookie(
  response: Response,
  environment: Pick<Environment, 'NODE_ENV'>,
  token: string,
  expiresAt: Date,
): void {
  response.cookie(sessionCookieName(environment), token, {
    expires: expiresAt,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: environment.NODE_ENV === 'production',
  });
}

export function clearSessionCookie(
  response: Response,
  environment: Pick<Environment, 'NODE_ENV'>,
): void {
  response.clearCookie(sessionCookieName(environment), {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: environment.NODE_ENV === 'production',
  });
}
