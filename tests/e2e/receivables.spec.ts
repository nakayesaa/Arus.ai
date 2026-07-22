import { expect, test, type Page } from '@playwright/test';

const AS_OF_DATE = '2026-07-16';
const SINAR_DEBTOR_ID = '20000000-0000-4000-8000-000000000001';
const PARTIAL_INVOICE_ID = '30000000-0000-4000-8000-000000000001';
const DISPUTED_INVOICE_ID = '30000000-0000-4000-8000-000000000005';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('reconciles a debtor account through its invoice allocation evidence', async ({
  page,
}) => {
  await page.goto(`/debtors?asOfDate=${AS_OF_DATE}`);

  await expect(
    page.getByRole('heading', { name: 'My Accounts' }),
  ).toBeVisible();
  const debtorRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'PT Sinar Abadi Retail' }) });
  await expect(debtorRow).toContainText('1 open');
  await expect(debtorRow).toContainText('Rp 135.000.000');
  await expect(page.getByText('Boundary Customer')).toHaveCount(0);

  await debtorRow.getByRole('link', { name: 'PT Sinar Abadi Retail' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/debtors/${SINAR_DEBTOR_ID}\\?asOfDate=${AS_OF_DATE}$`),
  );
  await expect(
    page.getByRole('heading', { name: 'PT Sinar Abadi Retail' }),
  ).toBeVisible();
  await expect(page.locator('.record-metrics')).toContainText('Rp 135.000.000');
  await expect(page.getByRole('link', { name: 'INV-2026-0418' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'INV-2026-0020' })).toBeVisible();

  await page.getByRole('link', { name: 'INV-2026-0418' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/invoices/${PARTIAL_INVOICE_ID}\\?asOfDate=${AS_OF_DATE}$`),
  );
  await expect(
    page.getByRole('heading', { name: 'INV-2026-0418' }),
  ).toBeVisible();
  const metrics = page.locator('.record-metrics');
  await expect(metrics).toContainText('Rp 185.000.000');
  await expect(metrics).toContainText('Rp 50.000.000');
  await expect(metrics).toContainText('Rp 135.000.000');

  const allocationRow = page
    .getByRole('row')
    .filter({ hasText: 'SEED-PARTIAL-001' });
  await expect(allocationRow).toContainText('Rp 50.000.000');
  await expect(allocationRow).toContainText('Opening balance');
  await expect(allocationRow).toContainText('Active');
});

test('keeps invoice search, state, aging, and business date in the URL', async ({
  page,
}) => {
  await page.goto(`/invoices?asOfDate=${AS_OF_DATE}`);
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();

  await page
    .getByRole('combobox', { name: 'Filter by invoice state' })
    .selectOption('OPEN');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('state'))
    .toBe('OPEN');

  await page
    .getByRole('searchbox', { name: 'Search invoices and debtors' })
    .fill('Metro');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('search'))
    .toBe('Metro');

  await page
    .getByRole('combobox', { name: 'Filter by aging' })
    .selectOption('CURRENT');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('agingBucket'))
    .toBe('CURRENT');
  expect(new URL(page.url()).searchParams.get('asOfDate')).toBe(AS_OF_DATE);

  await expect(page.getByRole('link', { name: 'INV-2026-0090' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'INV-2026-0060' })).toHaveCount(
    0,
  );
  await expect(page.getByText('Boundary Customer')).toHaveCount(0);
});

test('renders the seeded collection queue in exact priority order', async ({
  page,
}) => {
  await page.goto(`/dashboard?asOfDate=${AS_OF_DATE}`);
  await expect(
    page.getByText('Broken promises', { exact: true }).locator('..'),
  ).toContainText('1');
  await expect(
    page.getByText('Open disputes', { exact: true }).locator('..'),
  ).toContainText('1');
  const agingSegment = page.getByRole('link', {
    name: /1–7 days overdue:.*390\.000\.000.*2 invoices/u,
  });
  await agingSegment.hover();
  await expect(agingSegment.getByText('Rp\u00a0390.000.000')).toBeVisible();

  await page.goto(`/collection-queue?asOfDate=${AS_OF_DATE}`);

  await expect(
    page.getByRole('heading', { name: 'Collection Queue' }),
  ).toBeVisible();
  await expect(page.getByText('3 invoices prioritized')).toBeVisible();

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('INV-2026-0074');
  await expect(rows.nth(0)).toContainText('507.60');
  await expect(rows.nth(0)).toContainText('Broken promise');
  await expect(rows.nth(0)).toContainText(/Amount\s*472\.50/u);
  await expect(rows.nth(1)).toContainText('INV-2026-0418');
  await expect(rows.nth(1)).toContainText('218.20');
  await expect(rows.nth(1)).toContainText('Promise due');
  await expect(rows.nth(1)).toContainText('Last 14 Jul 2026');
  await expect(rows.nth(1)).toContainText('Due 18 Jul 2026');
  await expect(rows.nth(2)).toContainText('INV-2026-0090');
  await expect(rows.nth(2)).toContainText('155.00');
  await expect(rows.nth(2)).toContainText('Due soon · uncontacted');
  await expect(page.getByRole('link', { name: 'INV-2026-0060' })).toHaveCount(
    0,
  );
  await expect(page.getByText('Boundary Customer')).toHaveCount(0);

  await rows.nth(0).getByRole('link', { name: 'INV-2026-0074' }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/invoices/30000000-0000-4000-8000-000000000002\\?asOfDate=${AS_OF_DATE}$`,
    ),
  );
});

test('drills from dashboard workflow signals into the exact invoice', async ({
  page,
}) => {
  await page.goto(`/dashboard?asOfDate=${AS_OF_DATE}`);

  await page.getByRole('button', { name: /Broken promises/u }).click();
  const promiseDialog = page.getByRole('dialog', { name: 'Broken promises' });
  await expect(promiseDialog).toBeVisible();
  await expect(
    promiseDialog.getByRole('link', { name: 'Open invoice INV-2026-0074' }),
  ).toBeVisible();
  await expect(promiseDialog).toContainText('Promised Rp\u00a0100.000.000');
  await promiseDialog
    .getByRole('button', { name: 'Close workflow list' })
    .click();
  await expect(promiseDialog).toBeHidden();

  await page.getByRole('button', { name: /Open disputes/u }).click();
  const disputeDialog = page.getByRole('dialog', { name: 'Open disputes' });
  await expect(disputeDialog).toContainText('Wrong amount');
  await expect(disputeDialog).toContainText(
    'Customer requested reconciliation after a payment allocation was reversed.',
  );
  await disputeDialog
    .getByRole('link', { name: 'Open invoice INV-2026-0060' })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/invoices/${DISPUTED_INVOICE_ID}\\?asOfDate=${AS_OF_DATE}$`),
  );
  await expect(
    page.getByRole('heading', { name: 'INV-2026-0060' }),
  ).toBeVisible();
});

test('records external contact and refreshes invoice and queue evidence', async ({
  page,
}) => {
  await page.goto(`/invoices/${PARTIAL_INVOICE_ID}`);

  await expect(
    page.getByRole('heading', { name: 'Communication timeline' }),
  ).toBeVisible();
  await expect(
    page.getByText('Contact happened outside Arus').first(),
  ).toBeVisible();

  const composer = page.getByRole('region', { name: 'Log external contact' });
  const nextFollowUp = composer.getByLabel('Next follow-up');
  await expect(nextFollowUp).not.toHaveValue('');
  const expectedFollowUp = await nextFollowUp.inputValue();

  await composer
    .getByLabel('Outcome notes')
    .fill('E2E: customer confirmed the invoice is in today’s payment run.');
  await composer.getByRole('button', { name: 'Record contact' }).click();

  await expect(
    composer.getByText('Contact secured. Queue priority refreshed.'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'E2E: customer confirmed the invoice is in today’s payment run.',
    ),
  ).toBeVisible();

  await page.goto('/collection-queue');
  const queueRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'INV-2026-0418' }) });
  await expect(queueRow).toContainText(
    `Next ${displayBusinessDate(expectedFollowUp)}`,
  );
  await expect(queueRow).not.toContainText('Never contacted');
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
  await expect(page).toHaveURL(/\/dashboard$/);
}

function displayBusinessDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`));
}
