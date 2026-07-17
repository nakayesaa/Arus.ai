import 'dotenv/config';

import { defineConfig, devices } from '@playwright/test';

const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';
const inCi = Boolean(process.env.CI);
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: inCi ? 1 : 0,
  forbidOnly: inCi,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: 'list',
  use: {
    baseURL: appOrigin,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run start -w @arus/api',
      url: new URL('/health', apiOrigin).toString(),
      reuseExistingServer,
      timeout: 60_000,
    },
    {
      command: 'npm run start -w @arus/web',
      url: new URL('/login', appOrigin).toString(),
      reuseExistingServer,
      timeout: 60_000,
    },
  ],
});
