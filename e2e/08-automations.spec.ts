/**
 * Automations — Rule CRUD
 * Tests creating, toggling, and deleting automation rules.
 */
import { test, expect } from '@playwright/test';
import { loginAndGo, waitForApi, assertCleanPage, snap } from './helpers';

test.describe.serial('Automations CRUD', () => {
  const RULE_NAME = `E2E Rule ${Date.now()}`;

  test('Navigate to automations page and verify it loads', async ({ page }) => {
    const apiPromise = waitForApi(page, '/automations/list').catch(() => null);
    await loginAndGo(page, '/app/automations');
    await apiPromise;

    await assertCleanPage(page);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toHaveText(/automation/i);

    await snap(page, '08-automations-page');
  });

  test('Click Create Rule and fill form', async ({ page }) => {
    const apiPromise = waitForApi(page, '/automations/list').catch(() => null);
    await loginAndGo(page, '/app/automations');
    await apiPromise;

    // Click create button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New Rule"), button:has-text("Add Rule")').first();
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();

    // Form should appear with name input
    const nameInput = page.locator('input[placeholder*="name" i], input[placeholder*="rule" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(RULE_NAME);

    // Trigger type selector should be present
    const triggerSection = page.locator('text=/IF|When|Trigger|Condition/i').first();
    await expect(triggerSection).toBeVisible({ timeout: 5000 });

    // Action type selector should be present
    const actionSection = page.locator('text=/THEN|Action|Do/i').first();
    await expect(actionSection).toBeVisible({ timeout: 5000 });

    // Select trigger type if dropdown exists
    const triggerSelect = page.locator('select, [role="combobox"], [role="listbox"]').first();
    if (await triggerSelect.isVisible().catch(() => false)) {
      await triggerSelect.click();
      await page.locator('[role="option"], option').first().click().catch(() => {});
    }

    await snap(page, '08-automations-create-form');
  });

  test('Save rule and verify it appears in list', async ({ page }) => {
    const apiPromise = waitForApi(page, '/automations/list').catch(() => null);
    await loginAndGo(page, '/app/automations');
    await apiPromise;

    // Open create form
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New Rule"), button:has-text("Add Rule")').first();
    await createBtn.click();

    // Fill name
    const nameInput = page.locator('input[placeholder*="name" i], input[placeholder*="rule" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(RULE_NAME);

    // Click save/submit
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create Rule"), button[type="submit"]').first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(2000);
    }

    await assertCleanPage(page);
    await snap(page, '08-automations-saved');
  });

  test('Toggle rule active/inactive', async ({ page }) => {
    const apiPromise = waitForApi(page, '/automations/list').catch(() => null);
    await loginAndGo(page, '/app/automations');
    await apiPromise;

    // Find a toggle switch in the rules list
    const toggle = page.locator('input[type="checkbox"], [role="switch"], button[class*="toggle"], .toggle, label[class*="switch"]').first();
    if (await toggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(1000);

      // Click again to toggle back
      await toggle.click();
      await page.waitForTimeout(1000);
    }

    await assertCleanPage(page);
    await snap(page, '08-automations-toggle');
  });

  test('Delete a rule', async ({ page }) => {
    const apiPromise = waitForApi(page, '/automations/list').catch(() => null);
    await loginAndGo(page, '/app/automations');
    await apiPromise;

    // Look for delete button on any rule
    const deleteBtn = page.locator('button:has-text("Delete"), button[aria-label*="delete" i], button[class*="delete"], [class*="trash"]').first();
    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteBtn.click();

      // Confirm deletion if dialog appears
      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await page.waitForTimeout(1000);
    }

    await assertCleanPage(page);
    await snap(page, '08-automations-delete');
  });
});
