import type { RequestHandler } from 'express';
import { z } from 'zod';

import { InvoiceImportRowResult } from '../generated/prisma/enums.js';
import { HttpError, type ErrorFields } from '../lib/http-error.js';
import {
  InvoiceCsvUploadError,
  readInvoiceCsvUpload,
} from '../lib/invoice-csv-upload.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  InvoiceImportServiceError,
  type InvoiceImportServiceContract,
} from '../services/invoice-import.service.js';

const idParamsSchema = z.object({ id: z.uuid() }).strict();
const rowsQuerySchema = z
  .object({
    result: z
      .enum([
        InvoiceImportRowResult.VALID,
        InvoiceImportRowResult.INVALID,
        InvoiceImportRowResult.DUPLICATE,
        InvoiceImportRowResult.COMMITTED,
      ])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

interface InvoiceImportControllerOptions {
  invoiceImportService: InvoiceImportServiceContract;
}

export function createInvoiceImportController(
  options: InvoiceImportControllerOptions,
): {
  previewInvoices: RequestHandler;
  getJob: RequestHandler;
  listRows: RequestHandler;
  commitInvoices: RequestHandler;
} {
  const previewInvoices: RequestHandler = async (request, response, next) => {
    try {
      const upload = await readInvoiceCsvUpload(request);
      const job = await options.invoiceImportService.previewInvoices({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        upload,
      });
      response.status(201).json({ data: job });
    } catch (error) {
      next(mapInvoiceImportError(error));
    }
  };

  const getJob: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const job = await options.invoiceImportService.getJob({
        context: authenticatedContext(response),
        importJobId: params.id,
      });
      response.status(200).json({ data: job });
    } catch (error) {
      next(mapInvoiceImportError(error));
    }
  };

  const listRows: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const query = parse(rowsQuerySchema, request.query);
      const result = await options.invoiceImportService.listRows({
        context: authenticatedContext(response),
        importJobId: params.id,
        ...query,
      });
      response.status(200).json(result);
    } catch (error) {
      next(mapInvoiceImportError(error));
    }
  };

  const commitInvoices: RequestHandler = async (request, response, next) => {
    try {
      const params = parse(idParamsSchema, request.params);
      const result = await options.invoiceImportService.commitInvoices({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        importJobId: params.id,
      });
      response.status(200).json({ data: result });
    } catch (error) {
      next(mapInvoiceImportError(error));
    }
  };

  return { previewInvoices, getJob, listRows, commitInvoices };
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

function mapInvoiceImportError(error: unknown): unknown {
  if (error instanceof InvoiceCsvUploadError) {
    return new HttpError(error.status, error.code, error.message);
  }
  if (error instanceof InvoiceImportServiceError) {
    const status =
      error.code === 'IMPORT_JOB_NOT_FOUND'
        ? 404
        : error.code === 'IMPORT_NO_VALID_ROWS'
          ? 422
          : 409;
    return new HttpError(status, error.code, error.message);
  }
  return error;
}
