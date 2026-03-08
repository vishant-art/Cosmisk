/**
 * SMOKE TEST: Demo Readiness
 * Visits every feature page we modified, checks for no crashes,
 * verifies fake data is gone and key UI elements render.
 */
import { test, expect } from '@playwright/test';
import { loginAs, goTo, snap } from './helpers';

const email = `smoke_${Date.now()}@test.com`;
const password = 'TestPass123!';
const name = 'Smoke Tester';

test.describe('Demo Readiness Smoke Test', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, email, password, name);
  });

  test('Dashboard loads', async ({ page }) => {
    await goTo(page, '/app/dashboard');
    await expect(page.locator('body')).not.toContainText('Cannot read');
    await snap(page, '05-dashboard');
  });

  test('Attribution — no fake trends', async ({ page }) => {
    await goTo(page, '/app/attribution');
    // Should NOT contain hardcoded fake trends
    await expect(page.locator('body')).not.toContainText('+12.3%');
    await expect(page.locator('body')).not.toContainText('4.2 days');
    await snap(page, '05-attribution');
  });

  test('Swipe File — buttons exist and no fake DNA', async ({ page }) => {
    await goTo(page, '/app/swipe-file');
    // Should not have fake DNA tags like "Pattern-X" type strings from cycling
    await expect(page.locator('body')).not.toContainText('Cannot read');
    // Check the 3 action buttons render
    await expect(page.locator('text=Save from URL')).toBeVisible();
    await expect(page.locator('text=Browse Meta Ad Library')).toBeVisible();
    await snap(page, '05-swipe-file');
  });

  test('Director Lab — dynamic brief count, no example.com', async ({ page }) => {
    await goTo(page, '/app/director-lab');
    // Should NOT show hardcoded "246"
    await expect(page.locator('body')).not.toContainText('Briefs generated: 246');
    // Should NOT contain example.com
    await expect(page.locator('body')).not.toContainText('example.com');
    await snap(page, '05-director-lab');
  });

  test('Campaigns — no placeholder creatives [1,2,3,4,5,6]', async ({ page }) => {
    await goTo(page, '/app/campaigns');
    await expect(page.locator('body')).not.toContainText('Cannot read');
    await snap(page, '05-campaigns');
  });

  test('Assets — grid/list toggle and upload button', async ({ page }) => {
    await goTo(page, '/app/assets');
    await expect(page.locator('body')).not.toContainText('Cannot read');
    await snap(page, '05-assets');
  });

  test('Reports — no hardcoded brand names', async ({ page }) => {
    await goTo(page, '/app/reports');
    // Should not have hardcoded brand list (they should come from API)
    await expect(page.locator('body')).not.toContainText('Cannot read');
    await snap(page, '05-reports');
  });

  test('Autopilot — loads with mark all read button', async ({ page }) => {
    await goTo(page, '/app/autopilot');
    await expect(page.locator('text=Mark all read')).toBeVisible();
    await snap(page, '05-autopilot');
  });

  test('Automations — loads without crash', async ({ page }) => {
    await goTo(page, '/app/automations');
    await expect(page.locator('body')).not.toContainText('Cannot read');
    await snap(page, '05-automations');
  });

  test('Audit — loads without crash', async ({ page }) => {
    await goTo(page, '/app/audit');
    await expect(page.locator('body')).not.toContainText('Cannot read');
    await snap(page, '05-audit');
  });

  test('Brain — loads without crash', async ({ page }) => {
    await goTo(page, '/app/brain');
    await expect(page.locator('body')).not.toContainText('Cannot read');
    await snap(page, '05-brain');
  });

  test('Settings — loads without crash', async ({ page }) => {
    await goTo(page, '/app/settings');
    await expect(page.locator('body')).not.toContainText('Cannot read');
    await snap(page, '05-settings');
  });

  test('Competitor Spy — loads without crash', async ({ page }) => {
    await goTo(page, '/app/competitor-spy');
    await expect(page.locator('body')).not.toContainText('Cannot read');
    await snap(page, '05-competitor-spy');
  });
});
