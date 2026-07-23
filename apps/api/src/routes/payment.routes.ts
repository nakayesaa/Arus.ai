import { Router, type RequestHandler } from 'express';

import type { Environment } from '../config/env.js';
import { createPaymentController } from '../controllers/payment.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import {
  requireJsonBody,
  requireTrustedOrigin,
} from '../middleware/request-security.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { PaymentServiceContract } from '../services/payment.service.js';

export function createPaymentRouter(options: {
  authService: AuthServiceContract;
  paymentService: PaymentServiceContract;
  environment: Environment;
}): Router {
  const router = Router();
  const controller = createPaymentController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );
  const trustedOrigin = requireTrustedOrigin(options.environment);
  const jsonBody = requireJsonBody();

  router.use('/api/payments', noStore);
  router.post(
    '/api/invoices/:id/payments',
    noStore,
    trustedOrigin,
    jsonBody,
    authenticate,
    controller.recordInvoicePayment,
  );
  router.get('/api/payments', authenticate, controller.listPayments);
  router.get('/api/payments/:id', authenticate, controller.getPayment);
  return router;
}

const noStore: RequestHandler = (_request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
};
