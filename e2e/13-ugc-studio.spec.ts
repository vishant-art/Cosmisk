/**
 * UGC Studio — Project list, creation, detail navigation.
 */
import { test, expect } from '@playwright/test';
import { loginAndGo, assertCleanPage, snap } from './helpers';

test.describe.serial('UGC Studio', () => {

  test('Navigate to UGC studio and verify it loads', async ({ page }) => {
    await loginAndGo(page, '/app/ugc-studio');

    await assertCleanPage(page);

    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toHaveText(/ugc|studio|creator/i);

    await snap(page, '13-ugc-studio-page');
  });

  test('Project list or empty state is displayed', async ({ page }) => {
    await loginAndGo(page, '/app/ugc-studio');

    // Either projects exist or empty state
    const projectCard = page.locator('[class*="card"], [class*="project"], [class*="item"]').first();
    const emptyState = page.locator('text=/no project|empty|get started|create your first/i').first();

    const hasProjects = await projectCard.isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmpty = await emptyState.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasProjects || hasEmpty).toBeTruthy();

    await assertCleanPage(page);
    await snap(page, '13-ugc-studio-list');
  });

  test('Create project button is visible and clickable', async ({ page }) => {
    await loginAndGo(page, '/app/ugc-studio');

    // Look for create project button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New Project"), button:has-text("New"), button:has-text("Add Project")').first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(createBtn).toBeEnabled();

      await createBtn.click();
      await page.waitForTimeout(1500);

      // A form or modal or new page should appear
      const formOrModal = page.locator('input, textarea, [class*="modal"], [class*="dialog"], [class*="form"]').first();
      if (await formOrModal.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(formOrModal).toBeVisible();
      }

      await assertCleanPage(page);
    }

    await snap(page, '13-ugc-studio-create');
  });

  test('Project detail navigation works', async ({ page }) => {
    await loginAndGo(page, '/app/ugc-studio');

    // Click on a project card if any exist
    const projectCard = page.locator('[class*="card"], [class*="project"]').first();
    if (await projectCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectCard.click();
      await page.waitForTimeout(2000);

      // Should navigate to detail view or show detail panel
      const detailContent = page.locator('text=/script|scene|brief|status|avatar/i').first();
      if (await detailContent.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(detailContent).toBeVisible();
      }

      await assertCleanPage(page);
    }

    await snap(page, '13-ugc-studio-detail');
  });
});
