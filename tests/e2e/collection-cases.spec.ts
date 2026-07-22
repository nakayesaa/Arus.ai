import { expect, test, type Page } from '@playwright/test';

import { cleanupCollectionCases } from './collection-case-cleanup';

const BROKEN_PROMISE_INVOICE_ID = '30000000-0000-4000-8000-000000000002';
const ACTIVE_PROMISE_INVOICE_ID = '30000000-0000-4000-8000-000000000003';
let createdPromiseIds: string[] = [];
let createdDisputeIds: string[] = [];

test.beforeEach(async ({ page }) => {
  createdPromiseIds = [];
  createdDisputeIds = [];
  await login(page);
});

test.afterEach(async () => {
  await cleanupCollectionCases({
    promiseIds: createdPromiseIds,
    disputeIds: createdDisputeIds,
  });
});

test('records and closes a customer promise with durable UI evidence', async ({
  page,
}) => {
  await page.goto(`/invoices/${BROKEN_PROMISE_INVOICE_ID}`);
  const manager = page.getByRole('region', {
    name: 'Commitments & exceptions',
  });
  await expect(manager).toContainText('Broken');

  await manager.getByRole('button', { name: 'Add promise' }).click();
  await manager.getByLabel('Promised amount').fill('1000000');
  const dateInput = manager.getByLabel('Promise date');
  const minimumDate = await dateInput.getAttribute('min');
  if (!minimumDate) throw new Error('Promise date did not expose its minimum');
  await dateInput.fill(addDays(minimumDate, 3));

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/promises'),
  );
  await manager.getByRole('button', { name: 'Secure promise' }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as CaseCommandEnvelope;
  createdPromiseIds.push(created.data.id);

  await expect(manager.getByText('Evidence secured.')).toBeVisible();
  await expect(manager).toContainText('The queue now knows what to protect.');
  const promiseItem = manager
    .locator('li')
    .filter({ hasText: 'Rp 1.000.000' })
    .first();
  await expect(promiseItem).toContainText('Active');

  await promiseItem.getByRole('button', { name: 'Cancel promise' }).click();
  await promiseItem
    .getByLabel('Cancellation reason')
    .fill('E2E: customer replaced the commitment with a new schedule.');
  const cancelResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/cancel'),
  );
  await promiseItem
    .getByRole('button', { name: 'Confirm cancellation' })
    .click();
  const cancelResponse = await cancelResponsePromise;
  expect(cancelResponse.status()).toBe(200);

  await expect(manager).toContainText(
    'Promise closed with its reason preserved.',
  );
  await expect(promiseItem).toContainText('Cancelled');
  await expect(promiseItem).toContainText(
    'E2E: customer replaced the commitment with a new schedule.',
  );
});

test('opens and resolves a dispute while preserving the exception trail', async ({
  page,
}) => {
  await page.goto(`/invoices/${ACTIVE_PROMISE_INVOICE_ID}`);
  const manager = page.getByRole('region', {
    name: 'Commitments & exceptions',
  });

  await manager.getByRole('button', { name: 'Open dispute' }).click();
  await manager.getByLabel('Category').selectOption('MISSING_POD');
  const details = 'E2E: customer needs signed proof of delivery.';
  await manager.getByLabel('What is disputed?').fill(details);
  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/disputes'),
  );
  await manager.getByRole('button', { name: 'Open dispute' }).last().click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as CaseCommandEnvelope;
  createdDisputeIds.push(created.data.id);

  await expect(manager).toContainText(
    'Normal collection is paused for this invoice.',
  );
  const disputeItem = manager
    .locator('li')
    .filter({ hasText: details })
    .first();
  await expect(disputeItem).toContainText('Open');

  await disputeItem.getByRole('button', { name: 'Resolve dispute' }).click();
  await disputeItem
    .getByLabel('Resolution note · optional')
    .fill('E2E: signed POD shared and acknowledged.');
  const resolveResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/resolve'),
  );
  await disputeItem.getByRole('button', { name: 'Mark resolved' }).click();
  const resolveResponse = await resolveResponsePromise;
  expect(resolveResponse.status()).toBe(200);

  await expect(manager).toContainText(
    'This invoice can return to the collection flow.',
  );
  await expect(disputeItem).toContainText('Resolved');
  await expect(disputeItem).toContainText(
    'E2E: signed POD shared and acknowledged.',
  );
});

interface CaseCommandEnvelope {
  data: { id: string };
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function login(page: Page): Promise<void> {
  const password = process.env.DEMO_SEED_PASSWORD;
  if (!password) {
    throw new Error(
      'DEMO_SEED_PASSWORD is required for deterministic E2E login',
    );
  }

  await page.goto('/login');
  await page
    .getByRole('textbox', { name: 'Work email' })
    .fill(process.env.E2E_USER_EMAIL ?? 'owner@demo.arus.local');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
