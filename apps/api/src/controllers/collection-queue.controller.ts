import type { RequestHandler } from 'express';
import { z } from 'zod';

import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  CollectionQueueError,
  type CollectionQueueServiceContract,
} from '../services/collection-queue.service.js';

const collectionQueueQuerySchema = z
  .object({
    asOfDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export function createCollectionQueueController(options: {
  collectionQueueService: CollectionQueueServiceContract;
}): { listQueue: RequestHandler } {
  const listQueue: RequestHandler = async (request, response, next) => {
    try {
      const query = parse(collectionQueueQuerySchema, request.query);
      const result = await options.collectionQueueService.listQueue({
        context: authenticatedContext(response),
        ...query,
      });
      response.status(200).json({
        data: result.data,
        pagination: result.pagination,
        meta: { asOfDate: result.asOfDate },
      });
    } catch (error) {
      next(mapCollectionQueueError(error));
    }
  };

  return { listQueue };
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
    fields[typeof field === 'string' ? field : 'request'] ??= issue.message;
  }
  return fields;
}

function mapCollectionQueueError(error: unknown): unknown {
  if (!(error instanceof CollectionQueueError)) return error;
  if (error.code === 'INVALID_AS_OF_DATE') {
    return new HttpError(400, error.code, error.message, {
      asOfDate: error.message,
    });
  }
  return new HttpError(422, error.code, error.message);
}
