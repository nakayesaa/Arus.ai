import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

import { cleanupInvoiceImportJobs } from './import-cleanup';

const fixture = (filename: string) =>
  resolve(process.cwd(), 'tests', 'fixtures', 'imports', filename);
let createdImportJobIds: string[] = [];

test.beforeEach(async ({ page }) => {
  createdImportJobIds = [];
  await login(page);
});

test.afterEach(async () => {
  await cleanupInvoiceImportJobs(createdImportJobIds);
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
  createdImportJobIds.push(await generatePreview(page));

  await expect(
    page.getByRole('heading', {
      name: 'Preview stopped before row validation',
    }),
  ).toBeVisible();
  await expect(page.getByText('MISSING_REQUIRED_HEADER')).toBeVisible();

  await fileInput.setInputFiles(fixture('mixed-preview.csv'));
  createdImportJobIds.push(await generatePreview(page));

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

test('commits a reviewed preview once and reconciles invoices and dashboard', async ({
  page,
}) => {
  await page.goto('/import');
  await page
    .getByLabel('Invoice CSV file')
    .setInputFiles(fixture('mixed-preview.csv'));
  const importJobId = await generatePreview(page);
  createdImportJobIds.push(importJobId);

  const invoiceBefore = await apiJson<InvoiceListEnvelope>(
    page,
    '/api/invoices?search=INV-PREVIEW-DAY4-VALID&asOfDate=2026-07-16',
  );
  const dashboardBefore = await apiJson<DashboardEnvelope>(
    page,
    '/api/dashboard?asOfDate=2026-07-16',
  );
  expect(invoiceBefore.pagination.total).toBe(0);

  await page.getByRole('button', { name: 'Review commit' }).click();
  await expect(
    page.getByText('Post 2 invoices to Demo Indonesia', {
      exact: true,
    }),
  ).toBeVisible();

  const commitResponsePromise = page.waitForResponse(isImportCommitResponse);
  await page.getByRole('button', { name: 'Commit 2 invoices' }).click();
  const commitResponse = await commitResponsePromise;
  expect(commitResponse.status()).toBe(200);
  const commit = (await commitResponse.json()) as ImportCommitEnvelope;
  expect(commit.data.replayed).toBe(false);
  expect(commit.data.reconciliation).toEqual({
    committedInvoices: 2,
    skippedRows: 3,
    createdDebtors: 1,
    openingPayments: 0,
    openingAllocatedAmount: '0.00',
  });

  await expect(page.getByText('Ledger posting reconciled')).toBeVisible();
  await expect(
    page.getByText('Every valid row was posted in one transaction'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Show committed rows, 2' }),
  ).toBeVisible();

  const replay = await page.evaluate(async (jobId) => {
    const response = await fetch(`/api/imports/${jobId}/commit`, {
      method: 'POST',
    });
    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  }, importJobId);
  expect(replay.status).toBe(200);
  const replayBody = replay.body as ImportCommitEnvelope;
  expect(replayBody.data.replayed).toBe(true);
  expect(replayBody.data.reconciliation).toEqual(commit.data.reconciliation);

  const invoiceAfter = await apiJson<InvoiceListEnvelope>(
    page,
    '/api/invoices?search=INV-PREVIEW-DAY4-VALID&asOfDate=2026-07-16',
  );
  const dashboardAfter = await apiJson<DashboardEnvelope>(
    page,
    '/api/dashboard?asOfDate=2026-07-16',
  );
  expect(invoiceAfter.pagination.total).toBe(1);
  expect(
    moneyMinorUnits(dashboardAfter.data.summary.totalAr) -
      moneyMinorUnits(dashboardBefore.data.summary.totalAr),
  ).toBe(300_000_000n);

  await page.goto('/invoices?search=INV-PREVIEW-DAY4-VALID');
  await expect(
    page.getByRole('link', { name: 'INV-PREVIEW-DAY4-VALID' }),
  ).toBeVisible();

  await page.goto('/dashboard?asOfDate=2026-07-16');
  await expect(
    page.getByText('Total receivables', { exact: true }).locator('..'),
  ).toContainText(formatRupiah(dashboardAfter.data.summary.totalAr));
});

function summaryMetric(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('..');
}

async function generatePreview(page: Page): Promise<string> {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'POST' &&
      url.pathname === '/api/imports/invoices/preview'
    );
  });
  await page.getByRole('button', { name: 'Generate preview' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as ImportJobEnvelope;
  return body.data.id;
}

function isImportCommitResponse(response: {
  request(): { method(): string };
  url(): string;
}): boolean {
  const url = new URL(response.url());
  return (
    response.request().method() === 'POST' &&
    /^\/api\/imports\/[0-9a-f-]+\/commit$/u.test(url.pathname)
  );
}

async function apiJson<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath);
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }, path);
}

function moneyMinorUnits(value: string): bigint {
  return BigInt(value.replace('.', ''));
}

function formatRupiah(value: string): string {
  const [integer = '0', fraction = '00'] = value.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp\u00a0${grouped}${fraction === '00' ? '' : `,${fraction}`}`;
}

interface ImportJobEnvelope {
  data: { id: string };
}

interface ImportCommitEnvelope {
  data: {
    replayed: boolean;
    reconciliation: {
      committedInvoices: number;
      skippedRows: number;
      createdDebtors: number;
      openingPayments: number;
      openingAllocatedAmount: string;
    };
  };
}

interface InvoiceListEnvelope {
  pagination: { total: number };
}

interface DashboardEnvelope {
  data: { summary: { totalAr: string } };
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
