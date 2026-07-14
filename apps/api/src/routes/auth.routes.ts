import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import type { Environment } from '../config/env.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import {
  requireJsonBody,
  requireTrustedOrigin,
} from '../middleware/request-security.js';
import type { AuthServiceContract } from '../services/auth.service.js';

interface AuthRouterOptions {
  authService: AuthServiceContract;
  environment: Environment;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const controller = createAuthController(options);
  const trustedOrigin = requireTrustedOrigin(options.environment);
  const loginLimiter = rateLimit({
    windowMs: options.environment.AUTH_LOGIN_WINDOW_MS,
    limit: options.environment.AUTH_LOGIN_MAX_ATTEMPTS,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (_request, response) => {
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many login attempts. Try again later.',
          requestId: response.locals.requestId,
        },
      });
    },
  });

  router.post(
    '/api/auth/login',
    trustedOrigin,
    requireJsonBody(),
    loginLimiter,
    controller.login,
  );
  router.post('/api/auth/logout', trustedOrigin, controller.logout);
  router.get(
    '/api/auth/me',
    requireAuthentication(options.authService, options.environment),
    controller.me,
  );

  return router;
}
