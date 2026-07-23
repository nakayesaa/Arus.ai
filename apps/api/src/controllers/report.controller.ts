import type { RequestHandler } from 'express';
import { z } from 'zod';

import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  ReportError,
  type ReportServiceContract,
} from '../services/report.service.js';

const reportQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export function createReportController(options: {
  reportService: ReportServiceContract;
}): { generateWeeklyReport: RequestHandler } {
  const generateWeeklyReport: RequestHandler = async (
    request,
    response,
    next,
  ) => {
    try {
      const query = parse(reportQuerySchema, request.query);
      const result = await options.reportService.generateWeeklyReport({
        context: authenticatedContext(response),
        requestId: response.locals.requestId,
        ...query,
      });
      response.status(200).json(result);
    } catch (error) {
      next(mapReportError(error));
    }
  };

  return { generateWeeklyReport };
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

function mapReportError(error: unknown): unknown {
  if (!(error instanceof ReportError)) return error;
  if (error.code === 'INVALID_REPORT_PERIOD') {
    return new HttpError(400, error.code, error.message, {
      period: error.message,
    });
  }
  return new HttpError(422, error.code, error.message);
}
