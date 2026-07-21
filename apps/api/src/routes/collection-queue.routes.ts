import { Router } from 'express';

import type { Environment } from '../config/env.js';
import { createCollectionQueueController } from '../controllers/collection-queue.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { CollectionQueueServiceContract } from '../services/collection-queue.service.js';

export function createCollectionQueueRouter(options: {
  authService: AuthServiceContract;
  collectionQueueService: CollectionQueueServiceContract;
  environment: Environment;
}): Router {
  const router = Router();
  const controller = createCollectionQueueController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );

  router.get(
    '/api/collection-queue',
    (_request, response, next) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
    authenticate,
    controller.listQueue,
  );
  return router;
}
