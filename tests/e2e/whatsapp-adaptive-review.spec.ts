import { expect, test, type Page } from '@playwright/test';

/**
 * This blocker path joins the focused drawer, controlled send, and payment boundary.
 * Only the private image URL is substituted because local memory storage is process-local.
 * Message and payment commands still execute against the real API and PostgreSQL data.
 * The test asserts the exact review gate before send and the final invoice outstanding.
 * Demo reset must run before this destructive, single-worker E2E suite.
 */

const INVOICE_ID = '30000000-0000-4000-8000-000000000002';
const EVIDENCE_ID = 'e0000000-0000-4000-8000-000000000001';

test.beforeEach(async ({ page }) => login(page));

test('reviews a send and converts evidence into an auditable partial payment', async ({
  page,
}) => {
  await page.route(
    `**/api/payment-evidence/${EVIDENCE_ID}/view`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAQAAABWKLW/AAAADElEQVR42mNk+A8EAAn7A/0kR3QAAAAASUVORK5CYII=',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        }),
      });
    },
  );
  await page.goto(`/invoices/${INVOICE_ID}`);
  await page.getByRole('button', { name: 'WhatsApp' }).click();

  const drawer = page.getByRole('dialog', {
    name: /PT Cipta Pangan Indonesia/u,
  });
  await expect(drawer).toContainText('Rp 315.000.000');
  await drawer.getByLabel('Message').fill('E2E exact approved reminder.');
  await drawer
    .getByRole('button', { name: 'Review WhatsApp message before sending' })
    .click();
  await expect(
    drawer.getByText('Review exact customer-visible text'),
  ).toBeVisible();
  await expect(drawer).toContainText('E2E exact approved reminder.');
  await drawer.getByRole('button', { name: 'Approve and send' }).click();
  await expect(drawer.getByText('E2E exact approved reminder.')).toBeVisible();

  await drawer
    .getByRole('button', { name: /Evidence received · awaiting review/u })
    .click();
  const review = drawer.getByRole('region', {
    name: 'Review before changing money',
  });
  await expect(review).toContainText('Rp 315.000.000');
  await review
    .getByLabel('Payment date')
    .fill(new Date().toISOString().slice(0, 10));
  await review.getByLabel('Amount received').fill('5000000');
  await review.getByLabel('Payer reference').fill('PT Cipta Pangan Indonesia');
  await review.getByLabel(/Bank reference/u).fill('E2E-BANK-001');
  await review
    .getByRole('button', { name: 'Confirm and record payment' })
    .click();
  await expect(review).toContainText('Outstanding is now Rp 310.000.000');

  await page.reload();
  await expect(page.locator('.record-metrics')).toContainText('Rp 310.000.000');
});

async function login(page: Page): Promise<void> {
  const password = process.env.DEMO_SEED_PASSWORD;
  if (!password)
    throw new Error(
      'DEMO_SEED_PASSWORD is required for deterministic E2E login',
    );
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: 'Work email' })
    .fill('owner@demo.arus.local');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}
