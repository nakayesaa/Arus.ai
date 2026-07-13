import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import pinoHttp from 'pino-http';

export function createHttpLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    customProps: (_request, response) => ({
      requestId: response.locals.requestId,
    }),
    customSuccessMessage: (request, response) =>
      `${request.method} ${request.url ?? ''} completed with ${response.statusCode}`,
    customErrorMessage: (request, response) =>
      `${request.method} ${request.url ?? ''} failed with ${response.statusCode}`,
  });
}
