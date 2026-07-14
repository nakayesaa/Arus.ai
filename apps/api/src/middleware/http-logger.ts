import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import pinoHttp from 'pino-http';

export function createHttpLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    customProps: (_request, response) => ({
      actorId: response.locals.auth?.user.id,
      organizationId: response.locals.auth?.organization.id,
      requestId: response.locals.requestId,
    }),
    customSuccessMessage: (request, response) =>
      `${request.method} ${requestPath(request.url)} completed with ${response.statusCode}`,
    customErrorMessage: (request, response) =>
      `${request.method} ${requestPath(request.url)} failed with ${response.statusCode}`,
    serializers: {
      req: (request) => ({
        id: request.id,
        method: request.method,
        path: requestPath(request.url),
        remoteAddress: request.remoteAddress,
      }),
      res: (response) => ({ statusCode: response.statusCode }),
    },
  });
}

function requestPath(url: string | undefined): string {
  return url?.split('?', 1)[0] ?? '';
}
