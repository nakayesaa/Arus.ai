import type { RequestHandler } from 'express';
import { z } from 'zod';

import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  PromiseError,
  type PromiseServiceContract,
} from '../services/promise.service.js';

const idParamsSchema = z.object({ id: z.uuid() }).strict();
const operationKeySchema = z.uuid();
const createPromiseBodySchema = z
  .object({
    amount: z.string().trim().min(1).max(40),
    promiseDate: z.iso.date(),
  })
  .strict();
const cancelPromiseBodySchema = z
  .object({
    reason: z
      .string()
      .transform(normalizeMultilineText)
      .pipe(
        z
          .string()
          .min(1, 'Explain why the promise is being cancelled')
          .max(500, 'Reason must be 500 characters or fewer')
          .refine(hasSafeCharacters, 'Reason contains unsupported characters'),
      ),
  })
  .strict();

export function createPromiseController(options: {
  promiseService: PromiseServiceContract;
}): {
  createPromise: RequestHandler;
  cancelPromise: RequestHandler;
} {
  const createPromise: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const body = parse(createPromiseBodySchema, request.body);
      const operationKey = parse(
        operationKeySchema,
        request.header('Idempotency-Key'),
        'idempotencyKey',
      );
      const result = await options.promiseService.createPromise({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        invoiceId: params.id,
        operationKey,
        ...body,
      });
      response.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      next(mapPromiseError(error));
    }
  };

  const cancelPromise: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const body = parse(cancelPromiseBodySchema, request.body);
      const operationKey = parse(
        operationKeySchema,
        request.header('Idempotency-Key'),
        'idempotencyKey',
      );
      const result = await options.promiseService.cancelPromise({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        promiseId: params.id,
        operationKey,
        ...body,
      });
      response.status(200).json(result);
    } catch (error) {
      next(mapPromiseError(error));
    }
  };

  return { createPromise, cancelPromise };
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

function mapPromiseError(error: unknown): unknown {
  if (!(error instanceof PromiseError)) return error;

  switch (error.code) {
    case 'INVOICE_NOT_FOUND':
    case 'PROMISE_NOT_FOUND':
      return new HttpError(404, error.code, error.message);
    case 'ACTIVE_PROMISE_EXISTS':
    case 'PROMISE_FINALIZED':
    case 'PROMISE_IDEMPOTENCY_CONFLICT':
      return new HttpError(409, error.code, error.message);
    case 'INVALID_PROMISE_AMOUNT':
      return new HttpError(422, error.code, error.message, {
        amount: error.message,
      });
    case 'INVALID_PROMISE_DATE':
      return new HttpError(422, error.code, error.message, {
        promiseDate: error.message,
      });
  }
}
