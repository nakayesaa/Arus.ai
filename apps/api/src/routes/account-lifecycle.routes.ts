import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import type { Environment } from '../config/env.js';
import { createAccountLifecycleController } from '../controllers/account-lifecycle.controller.js';
import { MembershipRole } from '../generated/prisma/enums.js';
import {
  requireAuthentication,
  requireRole,
} from '../middleware/authentication.js';
import {
  requireJsonBody,
  requireTrustedOrigin,
} from '../middleware/request-security.js';
import type { AuthServiceContract } from '../services/auth.service.js';
import type { AccountLifecycleServiceContract } from '../services/account-lifecycle.service.js';

interface AccountLifecycleRouterOptions {
  authService: AuthServiceContract;
  lifecycleService: AccountLifecycleServiceContract;
  environment: Environment;
}

export function createAccountLifecycleRouter(
  options: AccountLifecycleRouterOptions,
): Router {
  const router = Router();
  const controller = createAccountLifecycleController(options);
  const authenticate = requireAuthentication(
    options.authService,
    options.environment,
  );
  const ownerOnly = requireRole(MembershipRole.OWNER);
  const trustedOrigin = requireTrustedOrigin(options.environment);
  const json = requireJsonBody();
  const publicActionLimiter = rateLimit({
    windowMs: options.environment.PASSWORD_RESET_WINDOW_MS,
    limit: options.environment.PASSWORD_RESET_MAX_ATTEMPTS,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many account requests. Try again later.',
          requestId: response.locals.requestId,
        },
      });
    },
  });

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/api/members', authenticate, ownerOnly, controller.listMembers);
  router.post(
    '/api/members',
    trustedOrigin,
    json,
    authenticate,
    ownerOnly,
    controller.inviteMember,
  );
  router.patch(
    '/api/members/:id',
    trustedOrigin,
    json,
    authenticate,
    ownerOnly,
    controller.updateMember,
  );
  router.post(
    '/api/auth/invitations/accept',
    trustedOrigin,
    json,
    publicActionLimiter,
    controller.acceptInvitation,
  );
  router.post(
    '/api/auth/password-reset/request',
    trustedOrigin,
    json,
    publicActionLimiter,
    controller.requestPasswordReset,
  );
  router.post(
    '/api/auth/password-reset/complete',
    trustedOrigin,
    json,
    publicActionLimiter,
    controller.completePasswordReset,
  );

  return router;
}
