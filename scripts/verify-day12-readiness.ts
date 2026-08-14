/**
 * Day 12 readiness reports durable channel health without disclosing secrets.
 * It checks connection state plus inbox, outbox, and evidence blocker counts.
 * Provider-double mode is labeled simulation so it cannot be mistaken for live Meta.
 * Failed or stuck work makes the command non-zero for staging release gates.
 * External webhook and sender smoke still require the documented manual test.
 */

import { loadEnvironment } from '../apps/api/src/config/env.js';
import { createDatabaseClient } from '../apps/api/src/lib/database.js';

const environment = loadEnvironment();
const database = createDatabaseClient(environment);

try {
  const [
    connections,
    failedInbox,
    pendingInbox,
    failedOutbox,
    pendingOutbox,
    awaitingEvidence,
  ] = await Promise.all([
    database.whatsAppConnection.groupBy({ by: ['state'], _count: true }),
    database.webhookInbox.count({ where: { state: 'FAILED' } }),
    database.webhookInbox.count({
      where: { state: { in: ['PENDING', 'RETRY', 'PROCESSING'] } },
    }),
    database.messageOutbox.count({ where: { state: 'FAILED' } }),
    database.messageOutbox.count({
      where: { state: { in: ['PENDING', 'RETRY', 'PROCESSING'] } },
    }),
    database.paymentEvidenceReview.count({
      where: { state: 'AWAITING_REVIEW' },
    }),
  ]);
  const report = {
    provider:
      environment.WHATSAPP_PROVIDER_MODE === 'meta'
        ? 'LIVE_META'
        : 'SIMULATED_PROVIDER_DOUBLE',
    storage: environment.EVIDENCE_STORAGE_MODE,
    connections,
    queues: { failedInbox, pendingInbox, failedOutbox, pendingOutbox },
    awaitingEvidence,
  };
  console.info(JSON.stringify(report));
  if (failedInbox > 0 || failedOutbox > 0) process.exitCode = 1;
} finally {
  await database.$disconnect();
}
