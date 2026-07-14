import type { ErrorRequestHandler, RequestHandler } from 'express';

import { HttpError } from '../lib/http-error.js';

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
      requestId: response.locals.requestId,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (isBodyParserError(error)) {
    const status = error.status === 413 ? 413 : 400;
    response.status(status).json({
      error: {
        code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
        message:
          status === 413
            ? 'Request payload is too large'
            : 'Request body contains invalid JSON',
        requestId: response.locals.requestId,
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    if (error.status >= 500) {
      request.log.error({ err: error }, 'Request failed');
    } else {
      request.log.warn(
        { code: error.code, status: error.status },
        'Request rejected',
      );
    }

    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
        requestId: response.locals.requestId,
      },
    });
    return;
  }

  request.log.error({ err: error }, 'Unhandled request error');

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: response.locals.requestId,
    },
  });
};

interface BodyParserError {
  status: number;
  type?: string;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  if (error instanceof HttpError) {
    return false;
  }

  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return false;
  }

  const candidate = error as { status?: unknown; type?: unknown };
  return (
    candidate.status === 413 ||
    (candidate.status === 400 && candidate.type === 'entity.parse.failed')
  );
}
