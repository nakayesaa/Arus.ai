import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const fixture = (filename: string) =>
  resolve(process.cwd(), 'tests', 'fixtures', 'imports', filename);

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('recovers from a file error and reviews a mixed zero-write preview', async ({
  page,
}) => {
  await page.goto('/import');

  await expect(
    page.getByRole('heading', { name: 'Import invoices' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Download template' }),
  ).toHaveAttribute('href', '/templates/invoice-import-template.csv');

  const fileInput = page.getByLabel('Invoice CSV file');
  await fileInput.setInputFiles(fixture('missing-header.csv'));
  await page.getByRole('button', { name: 'Generate preview' }).click();

  await expect(
    page.getByRole('heading', {
      name: 'Preview stopped before row validation',
    }),
  ).toBeVisible();
  await expect(page.getByText('MISSING_REQUIRED_HEADER')).toBeVisible();

  await fileInput.setInputFiles(fixture('mixed-preview.csv'));
  await page.getByRole('button', { name: 'Generate preview' }).click();

  await expect(
    page.getByRole('heading', { name: 'Preview ready' }),
  ).toBeVisible();
  await expect(page.getByText('Zero receivable records changed')).toBeVisible();
  await expect(summaryMetric(page, 'All rows')).toContainText('5');
  await expect(summaryMetric(page, 'Valid')).toContainText('2');
  await expect(summaryMetric(page, 'Invalid')).toContainText('2');
  await expect(summaryMetric(page, 'Duplicate')).toContainText('1');
  await expect(summaryMetric(page, 'With warnings')).toContainText('1');
  await expect(page.getByText('UNKNOWN_COLUMN')).toBeVisible();

  await page.getByRole('button', { name: 'Show invalid rows, 2' }).click();
  const invalidDateRow = page
    .getByRole('row')
    .filter({ hasText: 'INV-PREVIEW-DAY4-DATE' });
  await expect(invalidDateRow).toContainText('DUE_BEFORE_INVOICE_DATE');

  await page.getByRole('button', { name: 'Show duplicate rows, 1' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: 'inv-preview-day4-dup' }),
  ).toContainText('DUPLICATE_IN_FILE');

  await page.goto('/invoices?search=INV-PREVIEW-DAY4-VALID');
  await expect(page.getByText('No invoices match these filters')).toBeVisible();
});

function summaryMetric(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('..');
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
