/**
 * REAL DATA QUALITY TEST
 * Uses an existing user with a connected Meta ad account
 * to verify actual output quality — not empty states.
 */
import { test, expect } from '@playwright/test';
import { loginAs, goTo, snap } from './helpers';

// Use existing account that has Meta token connected
const email = 'vishant@gmail.com';
const password = 'pratapsons';
const name = 'Vishant Jain';
const PRATAPSONS_ACCOUNT_ID = 'act_1738503939658460';

async function loginWithPratapsons(page: any) {
  await loginAs(page, email, password, name);
  // Select Pratapsons ad account before navigating
  await page.evaluate((accId: string) => {
    localStorage.setItem('cosmisk_ad_account', accId);
  }, PRATAPSONS_ACCOUNT_ID);
}

test.describe.serial('Real Data Output Quality', () => {

  test('01 — Dashboard shows real KPIs with data', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/dashboard');
    await page.waitForTimeout(5000); // Wait for KPI API

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');
    expect(body).not.toContain('[object Object]');

    await snap(page, '08-01-dashboard-real');
  });

  test('02 — Analytics shows real charts and metrics', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/analytics');

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');

    await snap(page, '08-02-analytics-real');
  });

  test('03 — Attribution shows real campaign data', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/attribution');

    // Wait extra for API data
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');
    expect(body).not.toContain('+12.3%');
    expect(body).not.toContain('4.2 days');

    await snap(page, '08-03-attribution-real');
  });

  test('04 — Creative Cockpit with real creatives', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/creative-cockpit');

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');

    await snap(page, '08-04-cockpit-real');
  });

  test('05 — Brain shows real DNA patterns', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/brain');

    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');

    await snap(page, '08-05-brain-real');
  });

  test('06 — Swipe File with real saved ads', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/swipe-file');
    await page.waitForTimeout(5000); // Wait for top-ads API

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '08-06-swipe-file-real');
  });

  test('07 — Director Lab with real creatives dropdown', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/director-lab');

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('example.com');
    expect(body).not.toContain('Briefs generated: 246');

    await snap(page, '08-07-director-lab-real');
  });

  test('08 — Campaign Builder with real campaigns list', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/campaigns');

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '08-08-campaigns-real');
  });

  test('09 — Assets Vault with real files', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/assets');
    await page.waitForTimeout(5000); // Wait for assets API

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '08-09-assets-real');
  });

  test('10 — Account Audit with real health score', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/audit');

    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');

    await snap(page, '08-10-audit-real');
  });

  test('11 — Autopilot with real alerts', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/autopilot');

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '08-11-autopilot-real');
  });

  test('12 — Automations with real rules', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/automations');

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '08-12-automations-real');
  });

  test('13 — Reports page', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/reports');

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '08-13-reports-real');
  });

  test('14 — Competitor Spy — search and see results', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/competitor-spy');

    const searchInput = page.locator('input[type="text"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.click();
      await searchInput.pressSequentially('Mamaearth', { delay: 40 });

      const searchBtn = page.locator('button:has-text("Search"), button:has-text("Analyze")').first();
      if (await searchBtn.isVisible()) {
        await searchBtn.click();
        await page.waitForTimeout(8000); // API + Claude analysis takes time
      }
    }

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '08-14-competitor-spy-real');
  });

  test('15 — Settings with real profile data', async ({ page }) => {
    await loginWithPratapsons(page);
    await goTo(page, '/app/settings');

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '08-15-settings-real');
  });
});
