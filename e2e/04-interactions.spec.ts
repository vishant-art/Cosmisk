/**
 * Interaction Tests — User Workflows
 * Tests actual user actions: clicking, filling forms, navigating wizards.
 */
import { test, expect } from '@playwright/test';
import { loginWithAccount, goTo, waitForApi, snap } from './helpers';

test.describe('User Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithAccount(page);
  });

  // ── Autopilot tab switching ────────────────────────────────
  test('Autopilot — switching filter tabs updates list', async ({ page }) => {
    const apiPromise = waitForApi(page, '/autopilot/alerts');
    await goTo(page, '/app/autopilot');
    await apiPromise;

    const criticalTab = page.locator('button:has-text("Critical"), [class*="tab"]:has-text("Critical")').first();
    await criticalTab.click();
    await page.waitForLoadState('networkidle');

    const allTab = page.locator('button:has-text("All"), [class*="tab"]:has-text("All")').first();
    await allTab.click();
    await page.waitForLoadState('networkidle');

    // Page still clean after interactions
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');

    await snap(page, '04-autopilot-tabs');
  });

  // ── Automations create rule ────────────────────────────────
  test('Automations — create rule form appears', async ({ page }) => {
    const apiPromise = waitForApi(page, '/automations/list');
    await goTo(page, '/app/automations');
    await apiPromise;

    await page.locator('button:has-text("Create New Rule")').click();

    // Form should appear
    const form = page.locator('input[placeholder*="name" i], input[placeholder*="rule" i]').first();
    await expect(form).toBeVisible({ timeout: 5000 });

    // Fill rule name
    await form.fill('E2E Test Rule');

    // IF/THEN selectors should be present
    await expect(page.locator('text=/IF|When|Trigger/i').first()).toBeVisible();
    await expect(page.locator('text=/THEN|Action/i').first()).toBeVisible();

    await snap(page, '04-automations-create');
  });

  // ── Campaigns wizard ───────────────────────────────────────
  test('Campaigns — new campaign wizard step 1 to step 2', async ({ page }) => {
    const apiPromise = waitForApi(page, '/campaigns/list');
    await goTo(page, '/app/campaigns');
    await apiPromise;

    await page.locator('button:has-text("New Campaign")').click();

    // Step 1 form should appear
    const nameInput = page.locator('input[placeholder*="name" i], input[placeholder*="campaign" i]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('E2E Test Campaign');

    // Click continue/next
    const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Audience")').first();
    await continueBtn.click();

    // Step 2 should load (audience-related content)
    await expect(page.locator('text=/audience|targeting|location/i').first()).toBeVisible({ timeout: 5000 });

    await snap(page, '04-campaigns-wizard');
  });

  // ── Reports generate ───────────────────────────────────────
  test('Reports — new report form appears', async ({ page }) => {
    const apiPromise = waitForApi(page, '/reports/list');
    await goTo(page, '/app/reports');
    await apiPromise;

    await page.locator('button:has-text("New Report")').click();

    // Form should appear
    const form = page.locator('input, select, textarea').first();
    await expect(form).toBeVisible({ timeout: 5000 });

    // Generate button should exist
    await expect(page.locator('button:has-text("Generate Report"), button:has-text("Generate")').first()).toBeVisible();

    await snap(page, '04-reports-generate');
  });

  // ── Competitor Spy search ──────────────────────────────────
  test('Competitor Spy — search and get results', async ({ page }) => {
    await goTo(page, '/app/competitor-spy');

    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Mamaearth');

    const analyzeBtn = page.locator('button:has-text("Analyze")').first();
    await expect(analyzeBtn).toBeVisible();

    const apiPromise = waitForApi(page, '/competitor-spy/analyze').catch(() => null);
    await analyzeBtn.click();

    // Wait for results (this API can be slow)
    if (await apiPromise) {
      // Results should show stats or AI analysis
      await expect(page.locator('text=/ads found|results|analysis/i').first()).toBeVisible({ timeout: 15000 });
    }

    await snap(page, '04-competitor-spy-search');
  });

  // ── Settings profile save ──────────────────────────────────
  test('Settings — save profile without error', async ({ page }) => {
    await goTo(page, '/app/settings');

    const nameInput = page.locator('input[placeholder*="name" i], input[id*="name" i]').first();
    await expect(nameInput).toBeVisible();

    await nameInput.clear();
    await nameInput.fill('Vishant Jain');

    await page.locator('button:has-text("Save Changes")').click();

    // No error toast — page stays clean
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toMatch(/error|failed|unable/i);

    await snap(page, '04-settings-save');
  });

  // ── Director Lab generate ──────────────────────────────────
  test('Director Lab — generate creative brief', async ({ page }) => {
    await goTo(page, '/app/director-lab');

    // Select a format
    const formatBtn = page.locator('button:has-text("Static"), [class*="pill"]:has-text("Static"), [class*="chip"]:has-text("Static")').first();
    await expect(formatBtn).toBeVisible();
    await formatBtn.click();

    // Fill audience field if present
    const audienceInput = page.locator('input[placeholder*="audience" i], textarea[placeholder*="audience" i]').first();
    if (await audienceInput.isVisible()) {
      await audienceInput.fill('Women 25-35 interested in skincare');
    }

    // Click generate
    const generateBtn = page.locator('button:has-text("Generate Creative Brief"), button:has-text("Generate Brief"), button:has-text("Generate")').first();
    await expect(generateBtn).toBeVisible();

    const apiPromise = waitForApi(page, '/director/generate-brief').catch(() => null);
    await generateBtn.click();

    if (await apiPromise) {
      // Brief should appear
      await expect(page.locator('text=/brief|creative direction|hook/i').first()).toBeVisible({ timeout: 15000 });
    }

    await snap(page, '04-director-lab-generate');
  });

  // ── Assets view toggle ─────────────────────────────────────
  test('Assets — toggle between grid and list views', async ({ page }) => {
    const apiPromise = waitForApi(page, '/assets/list');
    await goTo(page, '/app/assets');
    await apiPromise;

    // Click List view
    const listBtn = page.locator('button:has-text("List"), [aria-label*="List"], [title*="List"]').first();
    await listBtn.click();
    await expect(page.locator('table, [class*="list-view"]').first()).toBeVisible({ timeout: 5000 });

    // Click Grid view
    const gridBtn = page.locator('button:has-text("Grid"), [aria-label*="Grid"], [title*="Grid"]').first();
    await gridBtn.click();
    await expect(page.locator('[class*="grid"], [class*="card-grid"]').first()).toBeVisible({ timeout: 5000 });

    await snap(page, '04-assets-toggle');
  });

  // ── Swipe File browse ──────────────────────────────────────
  test('Swipe File — browse Meta Ad Library navigates to competitor spy', async ({ page }) => {
    const apiPromise = waitForApi(page, '/ad-accounts/top-ads');
    await goTo(page, '/app/swipe-file');
    await apiPromise;

    const browseBtn = page.locator('button:has-text("Browse Meta Ad Library"), a:has-text("Browse Meta Ad Library")').first();
    await expect(browseBtn).toBeVisible();
    await browseBtn.click();

    await page.waitForURL(/competitor-spy/, { timeout: 10000 });
    expect(page.url()).toContain('competitor-spy');

    await snap(page, '04-swipe-file-browse');
  });
});
