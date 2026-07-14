import type { RequestHandler } from 'express';
import { z } from 'zod';

import type { Environment } from '../config/env.js';
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from '../lib/auth-cookie.js';
import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  InvalidCredentialsError,
  type AuthContext,
  type AuthServiceContract,
} from '../services/auth.service.js';

const loginBodySchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(1).max(1_024),
  })
  .strict();

interface AuthControllerOptions {
  authService: AuthServiceContract;
  environment: Pick<Environment, 'NODE_ENV'>;
}

export interface AuthResponse {
  user: AuthContext['user'];
  organization: AuthContext['organization'];
  role: AuthContext['role'];
  expiresAt?: string;
}

export function createAuthController(options: AuthControllerOptions): {
  login: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
} {
  const login: RequestHandler = async (request, response, next) => {
    try {
      const parsed = loginBodySchema.safeParse(request.body);

      if (!parsed.success) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Request is invalid',
          zodFields(parsed.error),
        );
      }

      const result = await options.authService.login({
        ...parsed.data,
        requestId: response.locals.requestId,
      });

      setSessionCookie(
        response,
        options.environment,
        result.token,
        result.expiresAt,
      );
      response.status(200).json({
        data: toResponse(result.context, result.expiresAt),
      });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        next(new HttpError(401, 'INVALID_CREDENTIALS', error.message));
        return;
      }

      next(error);
    }
  };

  const logout: RequestHandler = async (request, response, next) => {
    const token = readSessionCookie(request, options.environment);
    clearSessionCookie(response, options.environment);

    try {
      if (token) {
        await options.authService.logout(token);
      }

      response.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  const me: RequestHandler = (_request, response) => {
    response.status(200).json({
      data: toResponse(authenticatedContext(response)),
    });
  };

  return { login, logout, me };
}

function toResponse(context: AuthContext, expiresAt?: Date): AuthResponse {
  return {
    user: context.user,
    organization: context.organization,
    role: context.role,
    ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
  };
}

function zodFields(error: z.ZodError): ErrorFields {
  const fields: ErrorFields = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    const key = typeof field === 'string' ? field : 'body';
    fields[key] ??= issue.message;
  }

  return fields;
}
