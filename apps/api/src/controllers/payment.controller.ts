import type { RequestHandler } from 'express';
import { z } from 'zod';

import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  PaymentError,
  type PaymentServiceContract,
} from '../services/payment.service.js';

const idParamsSchema = z.object({ id: z.uuid() }).strict();
const operationKeySchema = z.uuid();
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(25);
const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listQuerySchema = z
  .object({
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
    page: pageSchema,
    limit: limitSchema,
  })
  .strict();
const requiredText = (maximum: number, message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .max(maximum)
    .refine(noControlCharacters, 'Contains unsupported characters');
const recordPaymentBodySchema = z
  .object({
    paymentDate: businessDateSchema,
    amount: z.string().min(1).max(32),
    payerReference: requiredText(100, 'Payer reference is required'),
    bankReference: requiredText(
      100,
      'Bank reference cannot be empty',
    ).nullable(),
  })
  .strict();

export function createPaymentController(options: {
  paymentService: PaymentServiceContract;
}): {
  listPayments: RequestHandler;
  getPayment: RequestHandler;
  recordInvoicePayment: RequestHandler;
} {
  const listPayments: RequestHandler = async (request, response, next) => {
    try {
      const query = parse(listQuerySchema, request.query);
      const result = await options.paymentService.listPayments({
        context: authenticatedContext(response),
        ...query,
      });
      response.status(200).json(result);
    } catch (error) {
      next(mapPaymentError(error));
    }
  };

  const getPayment: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const result = await options.paymentService.getPayment({
        context: authenticatedContext(response),
        paymentId: params.id,
      });
      response.status(200).json(result);
    } catch (error) {
      next(mapPaymentError(error));
    }
  };

  const recordInvoicePayment: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const body = parse(recordPaymentBodySchema, request.body);
      const operationKey = parse(
        operationKeySchema,
        request.header('Idempotency-Key'),
        'idempotencyKey',
      );
      const result = await options.paymentService.recordInvoicePayment({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        invoiceId: params.id,
        operationKey,
        ...body,
      });
      response.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      next(mapPaymentError(error));
    }
  };

  return { listPayments, getPayment, recordInvoicePayment };
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

function noControlCharacters(value: string): boolean {
  return Array.from(value).every((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
  });
}

function mapPaymentError(error: unknown): unknown {
  if (!(error instanceof PaymentError)) return error;

  switch (error.code) {
    case 'INVOICE_NOT_FOUND':
    case 'PAYMENT_NOT_FOUND':
      return new HttpError(404, error.code, error.message);
    case 'INVOICE_ALREADY_PAID':
    case 'PAYMENT_IDEMPOTENCY_CONFLICT':
      return new HttpError(409, error.code, error.message);
    case 'INVALID_DATE_RANGE':
      return new HttpError(400, error.code, error.message, {
        dateRange: error.message,
      });
    case 'INVALID_PAYMENT_AMOUNT':
    case 'PAYMENT_EXCEEDS_OUTSTANDING':
      return new HttpError(422, error.code, error.message, {
        amount: error.message,
      });
    case 'INVALID_PAYMENT_DATE':
      return new HttpError(422, error.code, error.message, {
        paymentDate: error.message,
      });
  }
}
