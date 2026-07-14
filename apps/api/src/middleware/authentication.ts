import type { RequestHandler } from 'express';

import type { Environment } from '../config/env.js';
import type { MembershipRole } from '../generated/prisma/enums.js';
import { readSessionCookie } from '../lib/auth-cookie.js';
import { HttpError } from '../lib/http-error.js';
import type {
  AuthContext,
  AuthServiceContract,
} from '../services/auth.service.js';

export function requireAuthentication(
  authService: AuthServiceContract,
  environment: Pick<Environment, 'NODE_ENV'>,
): RequestHandler {
  return async (request, response, next) => {
    try {
      const token = readSessionCookie(request, environment);
      const context = token ? await authService.authenticate(token) : null;

      if (!context) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
      }

      response.locals.auth = context;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...allowedRoles: MembershipRole[]): RequestHandler {
  return (_request, response, next) => {
    const context = response.locals.auth;

    if (!context) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication required'));
      return;
    }

    if (!allowedRoles.includes(context.role)) {
      next(new HttpError(403, 'FORBIDDEN', 'Insufficient permission'));
      return;
    }

    next();
  };
}

export function authenticatedContext(response: {
  locals: { auth?: AuthContext };
}): AuthContext {
  const context = response.locals.auth;

  if (!context) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');
  }

  return context;
}
