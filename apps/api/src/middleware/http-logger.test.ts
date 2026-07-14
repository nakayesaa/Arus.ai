import { Writable } from 'node:stream';

import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createHttpLogger } from './http-logger.js';
import { requestIdMiddleware } from './request-id.js';

describe('HTTP log minimization', () => {
  it('does not serialize headers, cookies, or query values', async () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = pino({ level: 'info' }, destination);
    const app = express();

    app.use(requestIdMiddleware);
    app.use(createHttpLogger(logger));
    app.get('/logged', (_request, response) => {
      response.status(200).json({ ok: true });
    });

    await request(app)
      .get('/logged?sensitive=customer-reference')
      .set('Authorization', 'Bearer should-never-be-logged')
      .set('Cookie', 'arus_session=should-never-be-logged')
      .expect(200);

    const output = lines.join('');
    const completionLog = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((line) => line['res'] !== undefined);

    expect(output).not.toContain('customer-reference');
    expect(output).not.toContain('should-never-be-logged');
    expect(completionLog?.['req']).toMatchObject({
      method: 'GET',
      path: '/logged',
    });
    expect(completionLog?.['req']).not.toHaveProperty('headers');
    expect(completionLog?.['req']).not.toHaveProperty('query');
  });
});
