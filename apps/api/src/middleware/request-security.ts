import type { RequestHandler } from 'express';

import type { Environment } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';

export function requireJsonBody(): RequestHandler {
  return (request, _response, next) => {
    if (!request.is('application/json')) {
      next(
        new HttpError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'Content-Type must be application/json',
        ),
      );
      return;
    }

    next();
  };
}

export function requireTrustedOrigin(
  environment: Pick<Environment, 'APP_ORIGIN'>,
): RequestHandler {
  return (request, _response, next) => {
    const origin = request.header('origin');
    const fetchSite = request.header('sec-fetch-site');

    if (
      (origin && origin !== environment.APP_ORIGIN) ||
      fetchSite === 'cross-site'
    ) {
      next(
        new HttpError(403, 'UNTRUSTED_ORIGIN', 'Request origin is not allowed'),
      );
      return;
    }

    next();
  };
}
