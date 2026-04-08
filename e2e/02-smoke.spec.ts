import { test, expect } from '@playwright/test';
import { loginAs, goTo, waitForApi, assertCleanPage, snap, TEST_EMAIL, TEST_PASSWORD, TEST_NAME } from './helpers';

const pages = [
  { route: '/app/dashboard', heading: /dashboard|what will you create/i, api: '/dashboard/kpis' },
  { route: '/app/analytics', heading: /analytics/i, api: '/analytics/full' },
  { route: '/app/attribution', heading: /attribution/i, api: '/ad-accounts/kpis' },
  { route: '/app/creative-cockpit', heading: /creative cockpit/i, api: '/ad-accounts/top-ads' },
  { route: '/app/brain', heading: /brain/i, api: '/brain/patterns' },
  { route: '/app/swipe-file', heading: /swipe file/i, api: '/ad-accounts/top-ads' },
  { route: '/app/director-lab', heading: /director lab/i },
  { route: '/app/campaigns', heading: /campaign/i, api: '/campaigns/list' },
  { route: '/app/assets', heading: /assets/i, api: '/assets/list' },
  { route: '/app/audit', heading: /audit/i },
  { route: '/app/autopilot', heading: /autopilot/i, api: '/autopilot/alerts' },
  { route: '/app/automations', heading: /automation/i, api: '/automations/list' },
  { route: '/app/reports', heading: /report/i, api: '/reports/list' },
  { route: '/app/competitor-spy', heading: /competitor/i },
  { route: '/app/settings', heading: /settings/i },
];

test.describe('Smoke Tests — All Pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
  });

  for (const p of pages) {
    test(`${p.route} loads correctly`, async ({ page }) => {
      const apiPromise = p.api ? waitForApi(page, p.api).catch(() => null) : null;
      await goTo(page, p.route);

      // Page loads without rendering errors
      await assertCleanPage(page);

      // Heading matches expected text
      const h1 = page.locator('h1, h2').first();
      await expect(h1).toBeVisible({ timeout: 10000 });
      await expect(h1).toHaveText(p.heading);

      // API call succeeds (if applicable)
      if (apiPromise) {
        const resp = await apiPromise;
        if (resp) expect(resp.status()).toBe(200);
      }

      await snap(page, `02-smoke-${p.route.replace(/\//g, '-').slice(1)}`);
    });
  }
});
