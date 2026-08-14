import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import type { Environment } from '../config/env.js';
import {
  createWhatsAppController,
  createWhatsAppWebhookController,
} from '../controllers/whatsapp.controller.js';
import {
  requireAuthentication,
  requireRole,
} from '../middleware/authentication.js';
import {
  requireJsonBody,
  requireTrustedOrigin,
} from '../middleware/request-security.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { WhatsAppServiceContract } from '../services/whatsapp.service.js';
import { MembershipRole } from '../generated/prisma/enums.js';

/**
 * WhatsApp routes separate the public verified webhook from session commands.
 * Browser mutations require trusted origin, JSON, authentication, and role checks.
 * Read responses disable caching because they can contain private evidence state.
 * Operators may send and review; only owners can change the sender state.
 * Request limits are applied before untrusted payloads reach application code.
 */

export function createWhatsAppWebhookRouter(options: {
  whatsappService: WhatsAppServiceContract;
  environment: Environment;
}): Router {
  const router = Router();
  const controller = createWhatsAppWebhookController(options);
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  router.get('/api/webhooks/whatsapp', limiter, controller.verifyChallenge);
  router.post(
    '/api/webhooks/whatsapp',
    limiter,
    express.raw({
      type: 'application/json',
      limit: options.environment.WHATSAPP_WEBHOOK_MAX_BYTES,
    }),
    controller.captureWebhook,
  );
  return router;
}

export function createWhatsAppRouter(options: {
  authService: AuthServiceContract;
  whatsappService: WhatsAppServiceContract;
  environment: Environment;
}): Router {
  const router = Router();
  const controller = createWhatsAppController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );
  const noStore = (
    _request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  };

  router.get(
    '/api/whatsapp/connection',
    noStore,
    authenticate,
    controller.getConnection,
  );
  router.post(
    '/api/debtors/:id/whatsapp-messages',
    noStore,
    requireTrustedOrigin(options.environment),
    requireJsonBody(),
    authenticate,
    controller.sendMessage,
  );
  router.post(
    '/api/whatsapp/threads/:id/link',
    noStore,
    requireTrustedOrigin(options.environment),
    requireJsonBody(),
    authenticate,
    controller.linkThread,
  );
  router.patch(
    '/api/whatsapp/connection/state',
    noStore,
    requireTrustedOrigin(options.environment),
    requireJsonBody(),
    authenticate,
    requireRole(MembershipRole.OWNER),
    controller.updateConnectionState,
  );
  router.get(
    '/api/debtors/:id/whatsapp-thread',
    noStore,
    authenticate,
    controller.getThread,
  );
  router.get(
    '/api/payment-evidence/:id',
    noStore,
    authenticate,
    controller.getEvidence,
  );
  router.post(
    '/api/payment-evidence/:id/view',
    noStore,
    requireTrustedOrigin(options.environment),
    requireJsonBody(),
    authenticate,
    controller.createEvidenceView,
  );
  router.post(
    '/api/payment-evidence/:id/reject',
    noStore,
    requireTrustedOrigin(options.environment),
    requireJsonBody(),
    authenticate,
    controller.rejectEvidence,
  );
  router.post(
    '/api/payment-evidence/:id/confirm-payment',
    noStore,
    requireTrustedOrigin(options.environment),
    requireJsonBody(),
    authenticate,
    controller.confirmEvidencePayment,
  );
  return router;
}
