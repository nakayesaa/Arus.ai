import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const requestIdMiddleware: RequestHandler = (
  request,
  response,
  next,
) => {
  const suppliedRequestId = request.header('x-request-id');
  const requestId =
    suppliedRequestId && SAFE_REQUEST_ID.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();

  response.locals.requestId = requestId;
  response.setHeader('X-Request-ID', requestId);
  next();
};
