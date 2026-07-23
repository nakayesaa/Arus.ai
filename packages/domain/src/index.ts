/**
 * Pure business rules shared by the API and its tests live in this package.
 * Keep this package independent from HTTP, persistence, UI, environment, and wall-clock APIs.
 */
export const DOMAIN_PACKAGE = '@arus/domain' as const;

export * from './business-date.js';
export * from './collection-queue.js';
export * from './collection-workflow.js';
export * from './communication.js';
export * from './dashboard.js';
export * from './errors.js';
export * from './invoice.js';
export * from './money.js';
export * from './payment.js';
