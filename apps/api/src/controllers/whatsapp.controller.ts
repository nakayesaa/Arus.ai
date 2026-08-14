import type { RequestHandler } from 'express';
import { z } from 'zod';

import type { Environment } from '../config/env.js';
import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  WhatsAppError,
  type WhatsAppServiceContract,
} from '../services/whatsapp.service.js';
import {
  verifyMetaSignature,
  verifyWebhookToken,
} from '../whatsapp/meta-webhook.js';

/**
 * WhatsApp controllers validate every public and authenticated request edge.
 * Exact message text and financial fields are bounded before service execution.
 * Mutating commands require UUID idempotency keys supplied by the browser.
 * Errors expose stable, actionable codes while preserving internal details.
 * Webhook verification remains isolated from session-backed application routes.
 */

const challengeSchema = z
  .object({
    'hub.mode': z.literal('subscribe'),
    'hub.verify_token': z.string().min(1).max(2_048),
    'hub.challenge': z.string().min(1).max(2_048),
  })
  .strict();
const debtorParamsSchema = z.object({ id: z.uuid() }).strict();
const evidenceParamsSchema = z.object({ id: z.uuid() }).strict();
const threadParamsSchema = z.object({ id: z.uuid() }).strict();
const operationKeySchema = z.uuid();
const threadQuerySchema = z
  .object({
    invoiceId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const connectionStateSchema = z
  .object({ state: z.enum(['LIVE', 'PAUSED']) })
  .strict();
const cleanText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine(
      (value) =>
        Array.from(value).every((character) => {
          const point = character.codePointAt(0);
          return (
            point !== undefined &&
            (point >= 32 || point === 10) &&
            point !== 127
          );
        }),
      'Contains unsupported characters',
    );
const sendMessageSchema = z
  .object({ invoiceId: z.uuid(), body: cleanText(4_096) })
  .strict();
const linkThreadSchema = z
  .object({ debtorId: z.uuid(), invoiceId: z.uuid() })
  .strict();
const rejectEvidenceSchema = z.object({ reason: cleanText(500) }).strict();
const confirmPaymentSchema = z
  .object({
    invoiceId: z.uuid(),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    amount: z.string().min(1).max(32),
    payerReference: cleanText(100),
    bankReference: cleanText(100).nullable(),
  })
  .strict();

export function createWhatsAppWebhookController(options: {
  whatsappService: WhatsAppServiceContract;
  environment: Environment;
}): {
  verifyChallenge: RequestHandler;
  captureWebhook: RequestHandler;
} {
  const verifyChallenge: RequestHandler = (request, response, next) => {
    try {
      const query = parse(challengeSchema, request.query);
      if (
        !options.environment.WHATSAPP_VERIFY_TOKEN ||
        !verifyWebhookToken(
          query['hub.verify_token'],
          options.environment.WHATSAPP_VERIFY_TOKEN,
        )
      ) {
        throw new HttpError(
          403,
          'WHATSAPP_CHALLENGE_REJECTED',
          'Webhook challenge rejected',
        );
      }
      response.status(200).type('text/plain').send(query['hub.challenge']);
    } catch (error) {
      next(error);
    }
  };

  const captureWebhook: RequestHandler = async (request, response, next) => {
    try {
      if (
        !options.environment.WHATSAPP_APP_SECRET ||
        !Buffer.isBuffer(request.body)
      ) {
        throw new HttpError(
          503,
          'WHATSAPP_WEBHOOK_UNAVAILABLE',
          'WhatsApp webhook is not configured',
        );
      }
      const rawBody = new Uint8Array(request.body);
      if (
        !verifyMetaSignature({
          rawBody,
          signatureHeader: request.header('x-hub-signature-256'),
          appSecret: options.environment.WHATSAPP_APP_SECRET,
        })
      ) {
        throw new HttpError(
          401,
          'INVALID_WHATSAPP_SIGNATURE',
          'Webhook signature is invalid',
        );
      }
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(request.body.toString('utf8'));
      } catch {
        throw new HttpError(
          400,
          'MALFORMED_WHATSAPP_PAYLOAD',
          'Webhook payload is malformed',
        );
      }
      await options.whatsappService.captureVerifiedWebhook({
        rawBody,
        parsedBody,
        receivedAt: new Date(),
      });
      response.status(200).json({ received: true });
    } catch (error) {
      next(mapWhatsAppError(error));
    }
  };

  return { verifyChallenge, captureWebhook };
}

export function createWhatsAppController(options: {
  whatsappService: WhatsAppServiceContract;
}): {
  getConnection: RequestHandler;
  updateConnectionState: RequestHandler;
  getThread: RequestHandler;
  getEvidence: RequestHandler;
  createEvidenceView: RequestHandler;
  sendMessage: RequestHandler;
  linkThread: RequestHandler;
  rejectEvidence: RequestHandler;
  confirmEvidencePayment: RequestHandler;
} {
  const getConnection: RequestHandler = async (_request, response, next) => {
    try {
      response.status(200).json(
        await options.whatsappService.getConnection({
          context: authenticatedContext(response),
        }),
      );
    } catch (error) {
      next(mapWhatsAppError(error));
    }
  };
  const updateConnectionState: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    try {
      const body = parse(connectionStateSchema, request.body);
      response.status(200).json(
        await options.whatsappService.updateConnectionState({
          context: authenticatedContext(response),
          requestId: response.locals.requestId,
          state: body.state,
        }),
      );
    } catch (error) {
      next(mapWhatsAppError(error));
    }
  };
  const getThread: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(debtorParamsSchema, request.params);
      const query = parse(threadQuerySchema, request.query);
      response.status(200).json(
        await options.whatsappService.getThread({
          context: authenticatedContext(response),
          debtorId: params.id,
          ...query,
        }),
      );
    } catch (error) {
      next(mapWhatsAppError(error));
    }
  };
  const getEvidence: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(evidenceParamsSchema, request.params);
      response.status(200).json(
        await options.whatsappService.getEvidence({
          context: authenticatedContext(response),
          evidenceId: params.id,
        }),
      );
    } catch (error) {
      next(mapWhatsAppError(error));
    }
  };
  const createEvidenceView: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    try {
      const params = parse(evidenceParamsSchema, request.params);
      response.status(200).json(
        await options.whatsappService.createEvidenceView({
          context: authenticatedContext(response),
          evidenceId: params.id,
        }),
      );
    } catch (error) {
      next(mapWhatsAppError(error));
    }
  };
  const sendMessage: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(debtorParamsSchema, request.params);
      const body = parse(sendMessageSchema, request.body);
      const result = await requireCommand(
        options.whatsappService.sendMessage,
      ).call(options.whatsappService, {
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        debtorId: params.id,
        operationKey: parseOperationKey(request.header('Idempotency-Key')),
        ...body,
      });
      response.status(result.replayed ? 200 : 202).json(result);
    } catch (error) {
      next(mapWhatsAppError(error));
    }
  };
  const linkThread: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(threadParamsSchema, request.params);
      const body = parse(linkThreadSchema, request.body);
      response.status(200).json(
        await requireCommand(options.whatsappService.linkThread).call(
          options.whatsappService,
          {
            context: authenticatedContext(response),
            requestId: response.locals.requestId,
            threadId: params.id,
            operationKey: parseOperationKey(request.header('Idempotency-Key')),
            ...body,
          },
        ),
      );
    } catch (error) {
      next(mapWhatsAppError(error));
    }
  };
  const rejectEvidence: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(evidenceParamsSchema, request.params);
      const body = parse(rejectEvidenceSchema, request.body);
      const result = await requireCommand(
        options.whatsappService.rejectEvidence,
      ).call(options.whatsappService, {
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        evidenceId: params.id,
        operationKey: parseOperationKey(request.header('Idempotency-Key')),
        reason: body.reason,
      });
      response.status(200).json(result);
    } catch (error) {
      next(mapWhatsAppError(error));
    }
  };
  const confirmEvidencePayment: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    try {
      const params = parse(evidenceParamsSchema, request.params);
      const body = parse(confirmPaymentSchema, request.body);
      const result = await requireCommand(
        options.whatsappService.confirmEvidencePayment,
      ).call(options.whatsappService, {
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        evidenceId: params.id,
        operationKey: parseOperationKey(request.header('Idempotency-Key')),
        ...body,
      });
      response.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      next(mapWhatsAppError(error));
    }
  };
  return {
    getConnection,
    updateConnectionState,
    getThread,
    getEvidence,
    createEvidenceView,
    sendMessage,
    linkThread,
    rejectEvidence,
    confirmEvidencePayment,
  };
}

function parseOperationKey(value: unknown): string {
  return parse(operationKeySchema, value);
}

function requireCommand<T extends (...args: never[]) => unknown>(
  command: T | undefined,
): T {
  if (!command) {
    throw new HttpError(
      503,
      'WHATSAPP_COMMAND_UNAVAILABLE',
      'WhatsApp command is unavailable',
    );
  }
  return command;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const fields: ErrorFields = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'request');
      fields[key] ??= issue.message;
    }
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request is invalid', fields);
  }
  return parsed.data;
}

function mapWhatsAppError(error: unknown): unknown {
  if (!(error instanceof WhatsAppError)) return error;
  switch (error.code) {
    case 'CONNECTION_NOT_FOUND':
    case 'EVIDENCE_NOT_FOUND':
    case 'THREAD_NOT_FOUND':
      return new HttpError(404, error.code, error.message);
    case 'EVIDENCE_NOT_READY':
    case 'EVIDENCE_NOT_REVIEWABLE':
    case 'CHANNEL_NOT_LIVE':
      return new HttpError(409, error.code, error.message);
    case 'IDEMPOTENCY_CONFLICT':
      return new HttpError(409, error.code, error.message);
    case 'RECIPIENT_MISSING':
    case 'PAYMENT_REJECTED':
      return new HttpError(422, error.causeCode ?? error.code, error.message);
    case 'PAYMENT_UNAVAILABLE':
      return new HttpError(503, error.code, error.message);
  }
}
