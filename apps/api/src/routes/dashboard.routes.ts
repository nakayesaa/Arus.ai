import { Router } from 'express';

import type { Environment } from '../config/env.js';
import { createDashboardController } from '../controllers/dashboard.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { DashboardServiceContract } from '../services/dashboard.service.js';

export function createDashboardRouter(options: {
  authService: AuthServiceContract;
  dashboardService: DashboardServiceContract;
  environment: Environment;
}): Router {
  const router = Router();
  const controller = createDashboardController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );

  router.get(
    '/api/dashboard',
    (_request, response, next) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
    authenticate,
    controller.getDashboard,
  );
  router.get(
    '/api/dashboard/workflow-cases',
    (_request, response, next) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
    authenticate,
    controller.listWorkflowCases,
  );
  return router;
}
