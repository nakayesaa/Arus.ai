import { createHmac } from 'node:crypto';

import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { loadEnvironment } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { createWhatsAppWebhookRouter } from './routes/whatsapp.routes.js';
import type { WhatsAppServiceContract } from './services/whatsapp.service.js';

const environment = loadEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/arus_test',
  SESSION_SECRET: 'test-session-secret-at-least-32-characters',
  WHATSAPP_APP_SECRET: 'test-whatsapp-app-secret',
  WHATSAPP_VERIFY_TOKEN: 'test-whatsapp-verify-token',
});

function application(service: WhatsAppServiceContract) {
  const app = express();
  const logger = pino({ level: 'silent' });
  app.use((request, _response, next) => {
    request.log = logger;
    next();
  });
  app.use(requestIdMiddleware);
  app.use(
    createWhatsAppWebhookRouter({
      whatsappService: service,
      environment,
    }),
  );
  app.use(errorHandler);
  return app;
}

function service() {
  return {
    captures: 0,
    async captureVerifiedWebhook() {
      this.captures += 1;
      return { replayed: false };
    },
    async getConnection() {
      return { data: null };
    },
    async updateConnectionState() {
      throw new Error('not used');
    },
    async getThread() {
      return { data: { connection: null, thread: null } };
    },
    async getEvidence() {
      throw new Error('not used');
    },
    async createEvidenceView() {
      throw new Error('not used');
    },
  } satisfies WhatsAppServiceContract & { captures: number };
}

describe('WhatsApp public webhook', () => {
  it('answers only the configured Meta challenge token', async () => {
    const fake = service();
    await request(application(fake))
      .get('/api/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test-whatsapp-verify-token',
        'hub.challenge': 'challenge-value',
      })
      .expect(200, 'challenge-value');
    await request(application(fake))
      .get('/api/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'challenge-value',
      })
      .expect(403);
  });

  it('rejects invalid signatures before any inbox write', async () => {
    const fake = service();
    await request(application(fake))
      .post('/api/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', `sha256=${'0'.repeat(64)}`)
      .send({ object: 'whatsapp_business_account', entry: [] })
      .expect(401);
    expect(fake.captures).toBe(0);
  });

  it('captures a valid raw signed delivery and acknowledges it quickly', async () => {
    const fake = service();
    const rawBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [],
    });
    const signature = createHmac('sha256', environment.WHATSAPP_APP_SECRET!)
      .update(rawBody)
      .digest('hex');
    await request(application(fake))
      .post('/api/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', `sha256=${signature}`)
      .send(rawBody)
      .expect(200, { received: true });
    expect(fake.captures).toBe(1);
  });
});
