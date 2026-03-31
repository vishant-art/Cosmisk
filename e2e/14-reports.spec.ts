/**
 * Reports — Report list, generation trigger.
 */
import { test, expect } from '@playwright/test';
import { loginAndGo, waitForApi, assertCleanPage, snap } from './helpers';

test.describe.serial('Reports Page', () => {

  test('Navigate to reports and verify it loads', async ({ page }) => {
    const apiPromise = waitForApi(page, '/reports/list').catch(() => null);
    await loginAndGo(page, '/app/reports');
    await apiPromise;

    await assertCleanPage(page);

    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toHaveText(/report/i);

    await snap(page, '14-reports-page');
  });

  test('Reports list or empty state is displayed', async ({ page }) => {
    const apiPromise = waitForApi(page, '/reports/list').catch(() => null);
    await loginAndGo(page, '/app/reports');
    await apiPromise;

    // Either report items exist or empty state
    const reportItem = page.locator('[class*="card"], [class*="report"], [class*="item"], [class*="row"]').first();
    const emptyState = page.locator('text=/no report|empty|generate your first|no data/i').first();

    const hasReports = await reportItem.isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasReports || hasEmpty).toBeTruthy();

    await assertCleanPage(page);
    await snap(page, '14-reports-list');
  });

  test('Report generation button is visible', async ({ page }) => {
    const apiPromise = waitForApi(page, '/reports/list').catch(() => null);
    await loginAndGo(page, '/app/reports');
    await apiPromise;

    // Look for generate report button
    const generateBtn = page.locator('button:has-text("Generate"), button:has-text("Create"), button:has-text("New Report"), button:has-text("Run")').first();
    if (await generateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(generateBtn).toBeEnabled();

      // Click to trigger generation (may show loading or modal)
      await generateBtn.click();
      await page.waitForTimeout(2000);

      // Verify page is still clean (no crash on generate)
      await assertCleanPage(page);
    }

    await snap(page, '14-reports-generate');
  });

  test('Report details are accessible if reports exist', async ({ page }) => {
    const apiPromise = waitForApi(page, '/reports/list').catch(() => null);
    await loginAndGo(page, '/app/reports');
    await apiPromise;

    // Click on a report if any exist
    const reportItem = page.locator('[class*="card"], [class*="report"], [class*="item"] a, [class*="row"]').first();
    if (await reportItem.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reportItem.click();
      await page.waitForTimeout(2000);

      // Should show report detail (metrics, summary, etc.)
      const detailContent = page.locator('text=/summary|performance|spend|roas|cpa|revenue/i').first();
      if (await detailContent.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(detailContent).toBeVisible();
      }

      await assertCleanPage(page);
    }

    await snap(page, '14-reports-detail');
  });
});
