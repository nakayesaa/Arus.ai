import type { RequestHandler } from 'express';
import { z } from 'zod';

import { AgingBucket, InvoiceState } from '@arus/domain';

import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  ReceivablesError,
  type ReceivablesServiceContract,
} from '../services/receivables.service.js';

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(25);
const searchSchema = z.string().trim().max(200).optional();
const optionalBooleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();
const asOfDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const idParamsSchema = z.object({ id: z.uuid() }).strict();

const debtorListQuerySchema = z
  .object({
    search: searchSchema,
    asOfDate: asOfDateSchema,
    page: pageSchema,
    limit: limitSchema,
  })
  .strict();
const debtorDetailQuerySchema = z.object({ asOfDate: asOfDateSchema }).strict();
const invoiceListQuerySchema = z
  .object({
    search: searchSchema,
    debtorId: z.uuid().optional(),
    state: z
      .enum([InvoiceState.OPEN, InvoiceState.PARTIALLY_PAID, InvoiceState.PAID])
      .optional(),
    agingBucket: z
      .enum([
        AgingBucket.CURRENT,
        AgingBucket.OVERDUE_1_7,
        AgingBucket.OVERDUE_8_30,
        AgingBucket.OVERDUE_31_60,
        AgingBucket.OVERDUE_61_90,
        AgingBucket.OVERDUE_90_PLUS,
      ])
      .optional(),
    outstandingOnly: optionalBooleanQuerySchema,
    asOfDate: asOfDateSchema,
    page: pageSchema,
    limit: limitSchema,
  })
  .strict();

const requiredText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine(noControlCharacters, 'Must not contain control characters');
const nullableText = (maximum: number) =>
  requiredText(maximum).nullable().optional();
const nullableEmail = z.email().max(320).nullable().optional();

const createDebtorBodySchema = z
  .object({
    code: nullableText(50),
    name: requiredText(200),
    contactName: nullableText(200),
    phoneNumber: nullableText(50),
    email: nullableEmail,
  })
  .strict();
const updateDebtorBodySchema = z
  .object({
    code: nullableText(50),
    name: requiredText(200).optional(),
    contactName: nullableText(200),
    phoneNumber: nullableText(50),
    email: nullableEmail,
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one change is required',
  });

interface ReceivablesControllerOptions {
  receivablesService: ReceivablesServiceContract;
}

export function createReceivablesController(
  options: ReceivablesControllerOptions,
): {
  listDebtors: RequestHandler;
  getDebtor: RequestHandler;
  createDebtor: RequestHandler;
  updateDebtor: RequestHandler;
  listInvoices: RequestHandler;
  getInvoice: RequestHandler;
} {
  const listDebtors: RequestHandler = async (request, response, next) => {
    try {
      const query = parse(debtorListQuerySchema, request.query);
      const result = await options.receivablesService.listDebtors({
        context: authenticatedContext(response),
        ...query,
      });
      response.status(200).json({
        data: result.data,
        pagination: result.pagination,
        meta: { asOfDate: result.asOfDate },
      });
    } catch (error) {
      next(mapReceivablesError(error));
    }
  };

  const getDebtor: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const query = parse(debtorDetailQuerySchema, request.query);
      const result = await options.receivablesService.getDebtor({
        context: authenticatedContext(response),
        debtorId: params.id,
        ...query,
      });
      response
        .status(200)
        .json({ data: result.data, meta: { asOfDate: result.asOfDate } });
    } catch (error) {
      next(mapReceivablesError(error));
    }
  };

  const createDebtor: RequestHandler = async (request, response, next) => {
    try {
      const body = parse(createDebtorBodySchema, request.body);
      const debtor = await options.receivablesService.createDebtor({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        ...body,
      });
      response.status(201).json({ data: debtor });
    } catch (error) {
      next(mapReceivablesError(error));
    }
  };

  const updateDebtor: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const body = parse(updateDebtorBodySchema, request.body);
      const debtor = await options.receivablesService.updateDebtor({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        debtorId: params.id,
        ...body,
      });
      response.status(200).json({ data: debtor });
    } catch (error) {
      next(mapReceivablesError(error));
    }
  };

  const listInvoices: RequestHandler = async (request, response, next) => {
    try {
      const query = parse(invoiceListQuerySchema, request.query);
      const result = await options.receivablesService.listInvoices({
        context: authenticatedContext(response),
        ...query,
      });
      response.status(200).json({
        data: result.data,
        pagination: result.pagination,
        meta: { asOfDate: result.asOfDate },
      });
    } catch (error) {
      next(mapReceivablesError(error));
    }
  };

  const getInvoice: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const query = parse(debtorDetailQuerySchema, request.query);
      const result = await options.receivablesService.getInvoice({
        context: authenticatedContext(response),
        invoiceId: params.id,
        ...query,
      });
      response.status(200).json({
        data: result.data,
        meta: {
          asOfDate: result.asOfDate,
          workflowBusinessDate: result.workflowBusinessDate,
          timeZone: result.organizationTimeZone,
        },
      });
    } catch (error) {
      next(mapReceivablesError(error));
    }
  };

  return {
    listDebtors,
    getDebtor,
    createDebtor,
    updateDebtor,
    listInvoices,
    getInvoice,
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
    const key = typeof field === 'string' ? field : 'request';
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

function mapReceivablesError(error: unknown): unknown {
  if (!(error instanceof ReceivablesError)) return error;

  switch (error.code) {
    case 'DEBTOR_NOT_FOUND':
    case 'INVOICE_NOT_FOUND':
      return new HttpError(404, error.code, error.message);
    case 'DEBTOR_CODE_IN_USE':
      return new HttpError(409, error.code, error.message);
    case 'INVALID_AS_OF_DATE':
      return new HttpError(400, error.code, error.message, {
        asOfDate: error.message,
      });
    case 'QUERY_TOO_BROAD':
      return new HttpError(422, error.code, error.message);
  }
}
