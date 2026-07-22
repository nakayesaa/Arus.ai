import { Router } from 'express';

import type { Environment } from '../config/env.js';
import { createCommunicationController } from '../controllers/communication.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import {
  requireJsonBody,
  requireTrustedOrigin,
} from '../middleware/request-security.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { CommunicationServiceContract } from '../services/communication.service.js';

export function createCommunicationRouter(options: {
  authService: AuthServiceContract;
  communicationService: CommunicationServiceContract;
  environment: Environment;
}): Router {
  const router = Router();
  const controller = createCommunicationController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );

  router.post(
    '/api/invoices/:id/communications',
    (_request, response, next) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
    requireTrustedOrigin(options.environment),
    requireJsonBody(),
    authenticate,
    controller.recordCommunication,
  );
  return router;
}
