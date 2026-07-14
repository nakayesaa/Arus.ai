import type { RequestHandler } from 'express';
import { z } from 'zod';

import { MembershipRole } from '../generated/prisma/enums.js';
import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  LifecycleError,
  type AccountLifecycleServiceContract,
} from '../services/account-lifecycle.service.js';

const inviteBodySchema = z
  .object({
    email: z.email().max(320),
    name: z.string().trim().min(2).max(200),
    role: z.enum([MembershipRole.OWNER, MembershipRole.OPERATOR]),
  })
  .strict();

const updateMemberBodySchema = z
  .object({
    role: z.enum([MembershipRole.OWNER, MembershipRole.OPERATOR]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((body) => body.role !== undefined || body.isActive !== undefined, {
    message: 'At least one change is required',
  });

const memberParamsSchema = z.object({ id: z.uuid() });
const tokenPasswordSchema = z
  .object({
    token: z.string().max(128),
    password: z.string().min(12).max(128),
  })
  .strict();
const resetRequestSchema = z.object({ email: z.email().max(320) }).strict();

interface AccountLifecycleControllerOptions {
  lifecycleService: AccountLifecycleServiceContract;
}

export function createAccountLifecycleController(
  options: AccountLifecycleControllerOptions,
): {
  listMembers: RequestHandler;
  inviteMember: RequestHandler;
  updateMember: RequestHandler;
  acceptInvitation: RequestHandler;
  requestPasswordReset: RequestHandler;
  completePasswordReset: RequestHandler;
} {
  const listMembers: RequestHandler = async (_request, response, next) => {
    try {
      const members = await options.lifecycleService.listMembers(
        authenticatedContext(response),
      );
      response.status(200).json({ data: members });
    } catch (error) {
      next(mapLifecycleError(error));
    }
  };

  const inviteMember: RequestHandler = async (request, response, next) => {
    try {
      const body = parse(inviteBodySchema, request.body);
      const member = await options.lifecycleService.inviteMember({
        context: authenticatedContext(response),
        ...body,
        requestId: response.locals.requestId,
      });
      response.status(201).json({ data: member });
    } catch (error) {
      next(mapLifecycleError(error));
    }
  };

  const updateMember: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(memberParamsSchema, request.params);
      const body = parse(updateMemberBodySchema, request.body);
      const member = await options.lifecycleService.updateMember({
        context: authenticatedContext(response),
        membershipId: params.id,
        ...(body.role ? { role: body.role } : {}),
        ...(body.isActive === undefined ? {} : { isActive: body.isActive }),
        requestId: response.locals.requestId,
      });
      response.status(200).json({ data: member });
    } catch (error) {
      next(mapLifecycleError(error));
    }
  };

  const acceptInvitation: RequestHandler = async (request, response, next) => {
    try {
      const body = parse(tokenPasswordSchema, request.body);
      await options.lifecycleService.acceptInvitation({
        ...body,
        requestId: response.locals.requestId,
      });
      response.status(204).end();
    } catch (error) {
      next(mapLifecycleError(error));
    }
  };

  const requestPasswordReset: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    try {
      const body = parse(resetRequestSchema, request.body);
      await options.lifecycleService.requestPasswordReset({
        ...body,
        requestId: response.locals.requestId,
      });
      response.status(202).json({
        data: {
          message:
            'If an active account exists for that email, a reset link has been sent.',
        },
      });
    } catch (error) {
      next(mapLifecycleError(error));
    }
  };

  const completePasswordReset: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    try {
      const body = parse(tokenPasswordSchema, request.body);
      await options.lifecycleService.completePasswordReset({
        ...body,
        requestId: response.locals.requestId,
      });
      response.status(204).end();
    } catch (error) {
      next(mapLifecycleError(error));
    }
  };

  return {
    listMembers,
    inviteMember,
    updateMember,
    acceptInvitation,
    requestPasswordReset,
    completePasswordReset,
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request is invalid',
      zodFields(parsed.error),
    );
  }
  return parsed.data;
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

function mapLifecycleError(error: unknown): unknown {
  if (!(error instanceof LifecycleError)) {
    return error;
  }
  switch (error.code) {
    case 'MEMBER_NOT_FOUND':
      return new HttpError(404, error.code, error.message);
    case 'EMAIL_IN_USE':
    case 'LAST_OWNER':
    case 'PENDING_MEMBER':
    case 'SELF_ACCESS_CHANGE':
      return new HttpError(409, error.code, error.message);
    case 'EMAIL_DELIVERY_FAILED':
      return new HttpError(502, error.code, error.message);
    case 'INVALID_TOKEN':
    case 'WEAK_PASSWORD':
      return new HttpError(400, error.code, error.message);
  }
}
