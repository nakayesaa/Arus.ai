import { Router, type RequestHandler } from 'express';

import type { Environment } from '../config/env.js';
import { createReportController } from '../controllers/report.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { ReportServiceContract } from '../services/report.service.js';

export function createReportRouter(options: {
  authService: AuthServiceContract;
  reportService: ReportServiceContract;
  environment: Environment;
}): Router {
  const router = Router();
  const controller = createReportController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );

  router.get(
    '/api/reports/weekly',
    noStore,
    authenticate,
    controller.generateWeeklyReport,
  );
  return router;
}

const noStore: RequestHandler = (_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
};
