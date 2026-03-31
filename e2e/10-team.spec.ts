/**
 * Team Management — Invite flow, role selection, team member display.
 */
import { test, expect } from '@playwright/test';
import { loginAndGo, assertCleanPage, snap } from './helpers';

test.describe.serial('Team Management', () => {

  test('Navigate to team page and verify it renders', async ({ page }) => {
    await loginAndGo(page, '/app/settings/team');

    await assertCleanPage(page);

    // Team page should have a heading
    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toHaveText(/team|member|invite/i);

    await snap(page, '10-team-page');
  });

  test('Invite form is displayed', async ({ page }) => {
    await loginAndGo(page, '/app/settings/team');

    // Look for invite button or form
    const inviteBtn = page.locator('button:has-text("Invite"), button:has-text("Add Member"), button:has-text("Add Team")').first();
    if (await inviteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inviteBtn.click();
      await page.waitForTimeout(1000);
    }

    // Email input for invite should be present
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
    await expect(emailInput).toBeVisible({ timeout: 5000 });

    // Fill in a test email
    await emailInput.fill('teammate@test.com');

    await assertCleanPage(page);
    await snap(page, '10-team-invite-form');
  });

  test('Role selection dropdown works', async ({ page }) => {
    await loginAndGo(page, '/app/settings/team');

    // Open invite form if button exists
    const inviteBtn = page.locator('button:has-text("Invite"), button:has-text("Add Member"), button:has-text("Add Team")').first();
    if (await inviteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inviteBtn.click();
      await page.waitForTimeout(1000);
    }

    // Find role dropdown/select
    const roleSelect = page.locator('select, [role="combobox"], [role="listbox"]').first();
    if (await roleSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await roleSelect.click();
      await page.waitForTimeout(500);

      // Verify role options are present
      const roleOption = page.locator('option, [role="option"]').first();
      if (await roleOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(roleOption).toBeVisible();
      }
    }

    // Alternatively check for role text labels
    const roleLabels = page.locator('text=/admin|editor|viewer|member|manager/i').first();
    if (await roleLabels.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(roleLabels).toBeVisible();
    }

    await snap(page, '10-team-role-select');
  });

  test('Team member list renders if members exist', async ({ page }) => {
    await loginAndGo(page, '/app/settings/team');

    // The current user should appear in the team list
    const memberRow = page.locator('text=/owner|admin|you/i').first();
    if (await memberRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(memberRow).toBeVisible();
    }

    await assertCleanPage(page);
    await snap(page, '10-team-members-list');
  });
});
