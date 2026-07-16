import { Router } from 'express';

import type { Environment } from '../config/env.js';
import { createReceivablesController } from '../controllers/receivables.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import {
  requireJsonBody,
  requireTrustedOrigin,
} from '../middleware/request-security.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { ReceivablesServiceContract } from '../services/receivables.service.js';

interface ReceivablesRouterOptions {
  authService: AuthServiceContract;
  receivablesService: ReceivablesServiceContract;
  environment: Environment;
}

export function createReceivablesRouter(
  options: ReceivablesRouterOptions,
): Router {
  const router = Router();
  const controller = createReceivablesController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );
  const trustedOrigin = requireTrustedOrigin(options.environment);
  const json = requireJsonBody();

  router.use('/api/debtors', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use('/api/invoices', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/api/debtors', authenticate, controller.listDebtors);
  router.post(
    '/api/debtors',
    trustedOrigin,
    json,
    authenticate,
    controller.createDebtor,
  );
  router.get('/api/debtors/:id', authenticate, controller.getDebtor);
  router.patch(
    '/api/debtors/:id',
    trustedOrigin,
    json,
    authenticate,
    controller.updateDebtor,
  );
  router.get('/api/invoices', authenticate, controller.listInvoices);
  router.get('/api/invoices/:id', authenticate, controller.getInvoice);

  return router;
}
