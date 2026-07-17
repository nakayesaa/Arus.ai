import { Router } from 'express';

import type { Environment } from '../config/env.js';
import { createInvoiceImportController } from '../controllers/invoice-import.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import { requireTrustedOrigin } from '../middleware/request-security.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { InvoiceImportServiceContract } from '../services/invoice-import.service.js';

interface InvoiceImportRouterOptions {
  authService: AuthServiceContract;
  invoiceImportService: InvoiceImportServiceContract;
  environment: Environment;
}

export function createInvoiceImportRouter(
  options: InvoiceImportRouterOptions,
): Router {
  const router = Router();
  const controller = createInvoiceImportController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );
  const trustedOrigin = requireTrustedOrigin(options.environment);

  router.use('/api/imports', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.post(
    '/api/imports/invoices/preview',
    trustedOrigin,
    authenticate,
    controller.previewInvoices,
  );
  router.get('/api/imports/:id', authenticate, controller.getJob);
  router.get('/api/imports/:id/rows', authenticate, controller.listRows);

  return router;
}
