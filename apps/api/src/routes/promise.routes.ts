import { Router } from 'express';

import type { Environment } from '../config/env.js';
import { createPromiseController } from '../controllers/promise.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import {
  requireJsonBody,
  requireTrustedOrigin,
} from '../middleware/request-security.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { PromiseServiceContract } from '../services/promise.service.js';

export function createPromiseRouter(options: {
  authService: AuthServiceContract;
  promiseService: PromiseServiceContract;
  environment: Environment;
}): Router {
  const router = Router();
  const controller = createPromiseController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );
  const trustedOrigin = requireTrustedOrigin(options.environment);
  const jsonBody = requireJsonBody();

  router.post(
    '/api/invoices/:id/promises',
    noStore,
    trustedOrigin,
    jsonBody,
    authenticate,
    controller.createPromise,
  );
  router.post(
    '/api/promises/:id/cancel',
    noStore,
    trustedOrigin,
    jsonBody,
    authenticate,
    controller.cancelPromise,
  );
  return router;
}

function noStore(
  _request: Parameters<ReturnType<typeof requireJsonBody>>[0],
  response: Parameters<ReturnType<typeof requireJsonBody>>[1],
  next: Parameters<ReturnType<typeof requireJsonBody>>[2],
): void {
  response.setHeader('Cache-Control', 'no-store');
  next();
}
