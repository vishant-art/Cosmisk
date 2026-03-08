import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,  // Run sequentially so you can watch
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'https://localhost:4200',
    headless: false,       // VISIBLE BROWSER — you can watch
    slowMo: 400,           // Slow down so you can see each action
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,  // Self-signed cert
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: undefined, // We'll start servers manually
});
