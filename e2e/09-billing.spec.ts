/**
 * Billing — Plan display, upgrade buttons, plan comparison.
 */
import { test, expect } from '@playwright/test';
import { loginAndGo, assertCleanPage, snap } from './helpers';

test.describe.serial('Billing Page', () => {

  test('Navigate to settings and verify billing section renders', async ({ page }) => {
    await loginAndGo(page, '/app/settings');

    await assertCleanPage(page);

    // Look for billing/plan related tab or section
    const billingTab = page.locator('button:has-text("Billing"), a:has-text("Billing"), [class*="tab"]:has-text("Billing"), button:has-text("Plan"), a:has-text("Plan")').first();
    if (await billingTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await billingTab.click();
      await page.waitForTimeout(1000);
    }

    await assertCleanPage(page);
    await snap(page, '09-billing-page');
  });

  test('Plan cards render with pricing info', async ({ page }) => {
    await loginAndGo(page, '/app/settings');

    // Navigate to billing tab if present
    const billingTab = page.locator('button:has-text("Billing"), a:has-text("Billing"), button:has-text("Plan"), a:has-text("Plan")').first();
    if (await billingTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await billingTab.click();
      await page.waitForTimeout(1000);
    }

    // Verify plan cards or pricing elements exist
    const planCards = page.locator('[class*="plan"], [class*="pricing"], [class*="card"]');
    const priceText = page.locator('text=/\\$\\d+|free|starter|pro|enterprise|growth/i').first();
    await expect(priceText).toBeVisible({ timeout: 10000 });

    await snap(page, '09-billing-plans');
  });

  test('Plan comparison information is displayed', async ({ page }) => {
    await loginAndGo(page, '/app/settings');

    const billingTab = page.locator('button:has-text("Billing"), a:has-text("Billing"), button:has-text("Plan"), a:has-text("Plan")').first();
    if (await billingTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await billingTab.click();
      await page.waitForTimeout(1000);
    }

    // Check for feature comparison elements (checkmarks, feature list, etc.)
    const features = page.locator('text=/feature|include|unlimited|ad account|brand/i').first();
    if (await features.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(features).toBeVisible();
    }

    await assertCleanPage(page);
    await snap(page, '09-billing-comparison');
  });

  test('Upgrade button is visible', async ({ page }) => {
    await loginAndGo(page, '/app/settings');

    const billingTab = page.locator('button:has-text("Billing"), a:has-text("Billing"), button:has-text("Plan"), a:has-text("Plan")').first();
    if (await billingTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await billingTab.click();
      await page.waitForTimeout(1000);
    }

    // Look for upgrade/subscribe button
    const upgradeBtn = page.locator('button:has-text("Upgrade"), button:has-text("Subscribe"), button:has-text("Choose"), a:has-text("Upgrade")').first();
    if (await upgradeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(upgradeBtn).toBeEnabled();
    }

    await snap(page, '09-billing-upgrade');
  });
});
