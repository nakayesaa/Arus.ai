import type { RequestHandler } from 'express';
import { z } from 'zod';

import { DisputeCategory } from '../generated/prisma/enums.js';
import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  DisputeError,
  type DisputeServiceContract,
} from '../services/dispute.service.js';

const idParamsSchema = z.object({ id: z.uuid() }).strict();
const operationKeySchema = z.uuid();
const safeText = (maximum: number, requiredMessage: string) =>
  z
    .string()
    .transform(normalizeMultilineText)
    .pipe(
      z
        .string()
        .min(1, requiredMessage)
        .max(
          maximum,
          `Must be ${maximum.toLocaleString('en-US')} characters or fewer`,
        )
        .refine(hasSafeCharacters, 'Contains unsupported characters'),
    );
const createDisputeBodySchema = z
  .object({
    category: z.enum([
      DisputeCategory.MISSING_POD,
      DisputeCategory.WRONG_AMOUNT,
      DisputeCategory.WRONG_QUANTITY,
      DisputeCategory.QUALITY,
      DisputeCategory.ADMINISTRATIVE,
      DisputeCategory.OTHER,
    ]),
    details: safeText(2_000, 'Describe what the customer disputed'),
  })
  .strict();
const resolveDisputeBodySchema = z
  .object({
    resolutionNote: safeText(1_000, 'Describe the resolution').nullable(),
  })
  .strict();

export function createDisputeController(options: {
  disputeService: DisputeServiceContract;
}): {
  createDispute: RequestHandler;
  resolveDispute: RequestHandler;
} {
  const createDispute: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const body = parse(createDisputeBodySchema, request.body);
      const operationKey = operationKeyFrom(request.header('Idempotency-Key'));
      const result = await options.disputeService.createDispute({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        invoiceId: params.id,
        operationKey,
        ...body,
      });
      response.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      next(mapDisputeError(error));
    }
  };

  const resolveDispute: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const body = parse(resolveDisputeBodySchema, request.body);
      const operationKey = operationKeyFrom(request.header('Idempotency-Key'));
      const result = await options.disputeService.resolveDispute({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        disputeId: params.id,
        operationKey,
        ...body,
      });
      response.status(200).json(result);
    } catch (error) {
      next(mapDisputeError(error));
    }
  };

  return { createDispute, resolveDispute };
}

function operationKeyFrom(value: unknown): string {
  return parse(operationKeySchema, value, 'idempotencyKey');
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

function normalizeMultilineText(value: string): string {
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

function mapDisputeError(error: unknown): unknown {
  if (!(error instanceof DisputeError)) return error;

  switch (error.code) {
    case 'INVOICE_NOT_FOUND':
    case 'DISPUTE_NOT_FOUND':
      return new HttpError(404, error.code, error.message);
    case 'DISPUTE_IDEMPOTENCY_CONFLICT':
    case 'DISPUTE_RESOLVED':
      return new HttpError(409, error.code, error.message);
  }
}
