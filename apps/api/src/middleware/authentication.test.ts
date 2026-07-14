import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { MembershipRole } from '../generated/prisma/enums.js';
import { HttpError } from '../lib/http-error.js';
import type { AuthContext } from '../services/auth.service.js';
import { requireRole } from './authentication.js';

const context: AuthContext = {
  sessionId: '30000000-0000-4000-8000-000000000001',
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'operator@demo.arus.local',
    name: 'Demo Operator',
  },
  organization: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Demo Indonesia',
    timezone: 'Asia/Jakarta',
  },
  role: MembershipRole.OPERATOR,
};

describe('role capability middleware', () => {
  it('allows an explicitly permitted role', async () => {
    const response = await request(testApp(MembershipRole.OWNER))
      .get('/owner-only')
      .expect(200);

    expect(response.body).toEqual({ allowed: true });
  });

  it('rejects an authenticated role without the capability', async () => {
    const response = await request(testApp(MembershipRole.OPERATOR))
      .get('/owner-only')
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('does not allow capability checks without authentication context', async () => {
    const response = await request(testApp()).get('/owner-only').expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});

function testApp(role?: MembershipRole) {
  const app = express();

  app.get(
    '/owner-only',
    (_request, response, next) => {
      if (role) {
        response.locals.auth = { ...context, role };
      }
      next();
    },
    requireRole(MembershipRole.OWNER),
    (_request, response) => response.status(200).json({ allowed: true }),
  );
  app.use(testErrorHandler);

  return app;
}

const testErrorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  if (!(error instanceof HttpError)) {
    next(error);
    return;
  }

  response.status(error.status).json({ error: { code: error.code } });
};
