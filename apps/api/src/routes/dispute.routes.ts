import { Router, type RequestHandler } from 'express';

import type { Environment } from '../config/env.js';
import { createDisputeController } from '../controllers/dispute.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import {
  requireJsonBody,
  requireTrustedOrigin,
} from '../middleware/request-security.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { DisputeServiceContract } from '../services/dispute.service.js';

export function createDisputeRouter(options: {
  authService: AuthServiceContract;
  disputeService: DisputeServiceContract;
  environment: Environment;
}): Router {
  const router = Router();
  const controller = createDisputeController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );
  const trustedOrigin = requireTrustedOrigin(options.environment);
  const jsonBody = requireJsonBody();

  router.post(
    '/api/invoices/:id/disputes',
    noStore,
    trustedOrigin,
    jsonBody,
    authenticate,
    controller.createDispute,
  );
  router.post(
    '/api/disputes/:id/resolve',
    noStore,
    trustedOrigin,
    jsonBody,
    authenticate,
    controller.resolveDispute,
  );
  return router;
}

const noStore: RequestHandler = (_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
};
