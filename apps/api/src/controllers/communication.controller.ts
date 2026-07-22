import type { RequestHandler } from 'express';
import { z } from 'zod';

import { CommunicationChannel } from '../generated/prisma/enums.js';
import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  CommunicationError,
  type CommunicationServiceContract,
} from '../services/communication.service.js';

const invoiceParamsSchema = z.object({ id: z.uuid() }).strict();
const operationKeySchema = z.uuid();
const communicationBodySchema = z
  .object({
    channel: z.enum([
      CommunicationChannel.WHATSAPP,
      CommunicationChannel.CALL,
      CommunicationChannel.EMAIL,
      CommunicationChannel.OTHER,
    ]),
    notes: z
      .string()
      .transform(normalizeNotes)
      .pipe(
        z
          .string()
          .min(1, 'Describe the communication outcome')
          .max(2_000, 'Notes must be 2,000 characters or fewer')
          .refine(hasSafeCharacters, 'Notes contain unsupported characters'),
      ),
    nextFollowUpDate: z.iso.date().nullable(),
  })
  .strict();

export function createCommunicationController(options: {
  communicationService: CommunicationServiceContract;
}): { recordCommunication: RequestHandler } {
  const recordCommunication: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    try {
      const params = parse(invoiceParamsSchema, request.params);
      const body = parse(communicationBodySchema, request.body);
      const operationKey = parse(
        operationKeySchema,
        request.header('Idempotency-Key'),
        'idempotencyKey',
      );
      const result = await options.communicationService.recordCommunication({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        invoiceId: params.id,
        operationKey,
        ...body,
      });
      response.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      next(mapCommunicationError(error));
    }
  };

  return { recordCommunication };
}

function parse<T>(schema: z.ZodType<T>, value: unknown, rootField?: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request is invalid',
      zodFields(parsed.error, rootField),
    );
  }
  return parsed.data;
}

function zodFields(error: z.ZodError, rootField?: string): ErrorFields {
  const fields: ErrorFields = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    const key = typeof field === 'string' ? field : (rootField ?? 'request');
    fields[key] ??= issue.message;
  }
  return fields;
}

function normalizeNotes(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
}

function hasSafeCharacters(value: string): boolean {
  return Array.from(value).every((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return false;
    if (codePoint === 9 || codePoint === 10) return true;
    if (codePoint < 32 || (codePoint >= 127 && codePoint <= 159)) return false;
    if (codePoint === 0x200e || codePoint === 0x200f) return false;
    if (codePoint >= 0x202a && codePoint <= 0x202e) return false;
    return codePoint < 0x2066 || codePoint > 0x2069;
  });
}

function mapCommunicationError(error: unknown): unknown {
  if (!(error instanceof CommunicationError)) return error;

  switch (error.code) {
    case 'INVOICE_NOT_FOUND':
      return new HttpError(404, error.code, error.message);
    case 'COMMUNICATION_IDEMPOTENCY_CONFLICT':
      return new HttpError(409, error.code, error.message);
    case 'INVALID_NEXT_FOLLOW_UP_DATE':
      return new HttpError(422, error.code, error.message, {
        nextFollowUpDate: error.message,
      });
  }
}
