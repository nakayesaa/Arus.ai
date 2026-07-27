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

const challengeSchema = z
  .object({
    'hub.mode': z.literal('subscribe'),
    'hub.verify_token': z.string().min(1).max(2_048),
    'hub.challenge': z.string().min(1).max(2_048),
  })
  .strict();
const debtorParamsSchema = z.object({ id: z.uuid() }).strict();
const evidenceParamsSchema = z.object({ id: z.uuid() }).strict();
const threadQuerySchema = z
  .object({
    invoiceId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const connectionStateSchema = z
  .object({ state: z.enum(['LIVE', 'PAUSED']) })
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
  return {
    getConnection,
    updateConnectionState,
    getThread,
    getEvidence,
    createEvidenceView,
  };
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
      return new HttpError(409, error.code, error.message);
  }
}
