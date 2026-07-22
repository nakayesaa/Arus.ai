import type { RequestHandler } from 'express';
import { z } from 'zod';

import { HttpError, type ErrorFields } from '../lib/http-error.js';
import { authenticatedContext } from '../middleware/authentication.js';
import {
  DashboardError,
  type DashboardServiceContract,
} from '../services/dashboard.service.js';

const dashboardQuerySchema = z
  .object({
    asOfDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

const workflowCasesQuerySchema = z
  .object({
    kind: z.enum(['BROKEN_PROMISE', 'OPEN_DISPUTE']),
    asOfDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    page: z.coerce.number().int().min(1).max(1_000).default(1),
    limit: z.coerce.number().int().min(1).max(25).default(10),
  })
  .strict();

export function createDashboardController(options: {
  dashboardService: DashboardServiceContract;
}): { getDashboard: RequestHandler; listWorkflowCases: RequestHandler } {
  const getDashboard: RequestHandler = async (request, response, next) => {
    try {
      const query = parse(dashboardQuerySchema, request.query);
      const result = await options.dashboardService.getDashboard({
        context: authenticatedContext(response),
        ...query,
      });
      response.status(200).json({
        data: {
          summary: result.summary,
          aging: result.aging,
          largestOverdue: result.largestOverdue,
          workflows: result.workflows,
        },
        meta: { asOfDate: result.asOfDate },
      });
    } catch (error) {
      next(mapDashboardError(error));
    }
  };

  const listWorkflowCases: RequestHandler = async (request, response, next) => {
    try {
      const query = parse(workflowCasesQuerySchema, request.query);
      const result = await options.dashboardService.listWorkflowCases({
        context: authenticatedContext(response),
        ...query,
      });
      response.status(200).json({
        data: result.data,
        pagination: result.pagination,
        meta: { asOfDate: result.asOfDate },
      });
    } catch (error) {
      next(mapDashboardError(error));
    }
  };

  return { getDashboard, listWorkflowCases };
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

function mapDashboardError(error: unknown): unknown {
  if (!(error instanceof DashboardError)) return error;
  if (error.code === 'INVALID_AS_OF_DATE') {
    return new HttpError(400, error.code, error.message, {
      asOfDate: error.message,
    });
  }
  return new HttpError(422, error.code, error.message);
}
