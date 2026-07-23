import { expect, test, type Page } from '@playwright/test';

import {
  cleanupPaymentFixture,
  createPaymentFixture,
  type PaymentFixture,
} from './payment-fixture';

let fixture: PaymentFixture | undefined;

test.beforeEach(async ({ page }) => {
  fixture = await createPaymentFixture();
  await login(page);
});

test.afterEach(async () => {
  await cleanupPaymentFixture(fixture);
  fixture = undefined;
});

test('records a reviewed partial payment through invoice and ledger evidence', async ({
  page,
}) => {
  if (!fixture) throw new Error('Payment fixture was not created');

  await page.goto(`/invoices/${fixture.invoiceId}`);

  await expect(
    page.getByRole('heading', { name: fixture.invoiceNumber }),
  ).toBeVisible();
  const metrics = page.locator('.record-metrics');
  await expect(metrics).toContainText('Rp 12.345.678');

  const recorder = page.getByRole('region', {
    name: 'Record verified payment',
  });
  await recorder.getByLabel('Payment amount').fill('99.000.000');
  await recorder.getByLabel('Payer reference').fill('E2E remittance advice');
  await recorder.getByRole('button', { name: 'Review payment' }).click();
  await expect(recorder.getByRole('alert')).toContainText(
    'cannot exceed the current outstanding balance',
  );

  await recorder.getByLabel('Payment amount').fill('5.000.000');
  await recorder.getByLabel('Bank reference').fill('E2E-BANK-REF-2307');
  await recorder.getByRole('button', { name: 'Review payment' }).click();

  await expect(
    recorder.getByRole('heading', { name: 'Confirm financial effect' }),
  ).toBeVisible();
  await expect(recorder).toContainText('Current outstanding');
  await expect(recorder).toContainText('Rp 12.345.678');
  await expect(recorder).toContainText('Payment');
  await expect(recorder).toContainText('Rp 5.000.000');
  await expect(recorder).toContainText('Remaining');
  await expect(recorder).toContainText('Rp 7.345.678');
  await expect(recorder).toContainText(
    'Bank and accounting reconciliation remain separate controls.',
  );

  await recorder.getByRole('button', { name: 'Confirm and record' }).click();

  const success = page.getByRole('status', { name: 'Outstanding updated' });
  await expect(
    success.getByRole('heading', { name: 'Outstanding updated' }),
  ).toBeVisible();
  await expect(success).toContainText(
    `Rp 5.000.000 allocated to ${fixture.invoiceNumber}`,
  );
  await expect(success).toContainText('Remaining Rp 7.345.678');
  await expect(metrics).toContainText('Rp 5.000.000');
  await expect(metrics).toContainText('Rp 7.345.678');

  const allocationRow = page
    .getByRole('row')
    .filter({ hasText: 'E2E remittance advice' });
  await expect(allocationRow).toContainText('E2E-BANK-REF-2307');
  await expect(allocationRow).toContainText('Active');

  await success.getByRole('link', { name: 'View payment' }).click();
  await expect(page).toHaveURL(/\/payments\/[0-9a-f-]{36}$/u);
  await expect(
    page.getByRole('heading', { name: /PAY-[0-9A-F]{8}/u }),
  ).toBeVisible();
  await expect(page.getByText('E2E remittance advice')).toBeVisible();
  await expect(page.getByText('E2E-BANK-REF-2307')).toBeVisible();
  await expect(
    page.getByRole('link', { name: fixture.invoiceNumber }),
  ).toBeVisible();

  await page.goto('/payments');
  const ledgerRow = page
    .getByRole('row')
    .filter({ hasText: 'E2E remittance advice' });
  await expect(ledgerRow).toContainText(fixture.debtorName);
  await expect(ledgerRow).toContainText(fixture.invoiceNumber);
  await expect(ledgerRow).toContainText('Rp 5.000.000');
  await expect(ledgerRow).toContainText('Allocated');
});

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
  await expect(page).toHaveURL(/\/dashboard$/u);
}
