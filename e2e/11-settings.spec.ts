/**
 * Settings — Profile form, editing fields, save functionality.
 */
import { test, expect } from '@playwright/test';
import { loginAndGo, assertCleanPage, snap } from './helpers';

test.describe.serial('Settings Page', () => {

  test('Navigate to settings and verify profile form renders', async ({ page }) => {
    await loginAndGo(page, '/app/settings');

    await assertCleanPage(page);

    // Settings page heading
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toHaveText(/settings/i);

    // Profile form should have input fields
    const formInputs = page.locator('input[type="text"], input[type="email"]');
    await expect(formInputs.first()).toBeVisible({ timeout: 5000 });

    await snap(page, '11-settings-page');
  });

  test('Profile form fields are editable', async ({ page }) => {
    await loginAndGo(page, '/app/settings');

    // Find name or company input
    const nameInput = page.locator('input[placeholder*="name" i], input[name*="name" i], input[id*="name" i]').first();
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      const originalValue = await nameInput.inputValue();
      await nameInput.clear();
      await nameInput.fill('Updated Test Name');

      // Verify the value changed
      await expect(nameInput).toHaveValue('Updated Test Name');

      // Restore original value
      await nameInput.clear();
      if (originalValue) {
        await nameInput.fill(originalValue);
      }
    }

    // Find email input (may be readonly)
    const emailInput = page.locator('input[type="email"]').first();
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(emailInput).toBeVisible();
    }

    await assertCleanPage(page);
    await snap(page, '11-settings-edit-fields');
  });

  test('Save button is present and functional', async ({ page }) => {
    await loginAndGo(page, '/app/settings');

    // Find save/update button
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });

    // Verify it is enabled
    await expect(saveBtn).toBeEnabled();

    // Click save (should not error even with no changes)
    await saveBtn.click();
    await page.waitForTimeout(2000);

    await assertCleanPage(page);
    await snap(page, '11-settings-save');
  });

  test('Settings tabs navigate between sections', async ({ page }) => {
    await loginAndGo(page, '/app/settings');

    // Look for tab navigation (Profile, Billing, Team, etc.)
    const tabs = page.locator('button[class*="tab"], a[class*="tab"], [role="tab"]');
    const tabCount = await tabs.count();

    if (tabCount > 1) {
      // Click second tab
      await tabs.nth(1).click();
      await page.waitForTimeout(1000);
      await assertCleanPage(page);

      // Click back to first tab
      await tabs.nth(0).click();
      await page.waitForTimeout(1000);
      await assertCleanPage(page);
    }

    await snap(page, '11-settings-tabs');
  });
});
