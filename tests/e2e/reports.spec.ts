import { expect, test, type Page } from '@playwright/test';

const REPORT_FROM = '2026-07-17';
const REPORT_TO = '2026-07-23';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('reviews a reconciled weekly report and opens its supporting records', async ({
  page,
}) => {
  await page.goto(`/reports?from=${REPORT_FROM}&to=${REPORT_TO}`);

  await expect(
    page.getByRole('heading', { name: 'Weekly report', level: 1 }),
  ).toBeVisible();
  const report = page.getByRole('article', {
    name: 'Receivables review',
  });
  await expect(report).toBeVisible();
  await expect(report).toContainText('17 Jul 2026 – 23 Jul 2026');
  await expect(
    report.getByText('Ending receivables', { exact: true }),
  ).toBeVisible();
  await expect(
    report.getByText('Remaining overdue', { exact: true }),
  ).toBeVisible();
  await expect(
    report.getByText('Collected in period', { exact: true }),
  ).toBeVisible();
  await expect(
    report.getByText('Overdue share', { exact: true }),
  ).toBeVisible();
  await expect(report.getByRole('table')).toContainText('Current');
  await expect(report.getByRole('table')).toContainText('90+ days');
  await expect(
    report.getByRole('heading', { name: 'Commitments & exceptions' }),
  ).toBeVisible();
  await expect(
    report.getByRole('heading', { name: 'Priority follow-up' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Print / Save PDF' }),
  ).toBeVisible();

  const collected = report
    .getByRole('link')
    .filter({ hasText: 'Collected in period' });
  await expect(collected).toContainText(/Rp\s/u);
  await collected.click();
  await expect(page).toHaveURL(
    new RegExp(`/payments\\?from=${REPORT_FROM}&to=${REPORT_TO}$`, 'u'),
  );
});

test('regenerates an inclusive period and preserves exact values for print', async ({
  page,
}) => {
  await page.goto(`/reports?from=${REPORT_FROM}&to=${REPORT_TO}`);

  await page.getByLabel('From').fill(REPORT_TO);
  await page.getByLabel('To').fill(REPORT_TO);
  await page.getByRole('button', { name: 'Generate' }).click();

  await expect(page).toHaveURL(
    new RegExp(`/reports\\?from=${REPORT_TO}&to=${REPORT_TO}$`, 'u'),
  );
  await expect(page.getByText('1 calendar day, inclusive')).toBeVisible();

  const agingRow = page.getByRole('table').getByRole('row').nth(1);
  await agingRow.hover();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(
    page.getByRole('article', { name: 'Receivables review' }),
  ).toBeVisible();
  const report = page.getByRole('article', { name: 'Receivables review' });
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(agingRow).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(report).toHaveCSS('border-top-style', 'solid');
  await expect(report).toHaveCSS('border-top-width', '1px');
  const endingValue = page
    .getByRole('link', { name: /^Ending receivables/u })
    .locator('strong');
  await expect(endingValue).toContainText(/Rp\s/u);
  expect(
    await endingValue.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);

  const pdf = await page.pdf({
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
  });
  expect(pdfPageCount(pdf)).toBeLessThanOrEqual(2);
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

function pdfPageCount(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Type\s*\/Page\b/gu)?.length ?? 0;
}
