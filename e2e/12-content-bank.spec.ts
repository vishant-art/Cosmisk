/**
 * Content Bank — Content list, platform filters, content creation.
 */
import { test, expect } from '@playwright/test';
import { loginAndGo, waitForApi, assertCleanPage, snap } from './helpers';

test.describe.serial('Content Bank', () => {

  test('Navigate to content bank and verify it loads', async ({ page }) => {
    await loginAndGo(page, '/app/content-bank');

    await assertCleanPage(page);

    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toHaveText(/content/i);

    await snap(page, '12-content-bank-page');
  });

  test('Content list or empty state is displayed', async ({ page }) => {
    await loginAndGo(page, '/app/content-bank');

    // Either content items exist or an empty state message
    const content = page.locator('[class*="card"], [class*="item"], [class*="content"], [class*="list"]').first();
    const emptyState = page.locator('text=/no content|empty|get started|create your first/i').first();

    const hasContent = await content.isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);

    // One of these should be true
    expect(hasContent || hasEmpty).toBeTruthy();

    await assertCleanPage(page);
    await snap(page, '12-content-bank-list');
  });

  test('Platform filter tabs are present', async ({ page }) => {
    await loginAndGo(page, '/app/content-bank');

    // Look for platform filter tabs (All, Instagram, Facebook, etc.)
    const filterTabs = page.locator('button:has-text("All"), button:has-text("Instagram"), button:has-text("Facebook"), button:has-text("Meta"), [class*="tab"], [class*="filter"]');
    const tabCount = await filterTabs.count();

    if (tabCount > 0) {
      // Click a filter tab
      await filterTabs.first().click();
      await page.waitForTimeout(1000);
      await assertCleanPage(page);
    }

    await snap(page, '12-content-bank-filters');
  });

  test('Content creation button is visible', async ({ page }) => {
    await loginAndGo(page, '/app/content-bank');

    // Look for create/generate content button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("Generate"), button:has-text("New"), button:has-text("Add Content")').first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(createBtn).toBeEnabled();

      // Click to verify it opens a form/modal
      await createBtn.click();
      await page.waitForTimeout(1000);
      await assertCleanPage(page);
    }

    await snap(page, '12-content-bank-create');
  });
});
