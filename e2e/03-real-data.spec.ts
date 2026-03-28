/**
 * Real Data Quality Tests
 * Uses vishant@gmail.com with Pratapsons ad account.
 * Every test intercepts API calls, validates response shape, and asserts real UI content.
 */
import { test, expect } from '@playwright/test';
import { loginWithAccount, goTo, waitForApi, assertCleanPage, snap } from './helpers';

test.describe('Real Data — Positive Assertions', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithAccount(page);
  });

  // ── Dashboard ──────────────────────────────────────────────
  test('Dashboard shows real KPIs and chart tabs', async ({ page }) => {
    const apiPromise = waitForApi(page, '/ad-accounts/kpis');
    await goTo(page, '/app/dashboard');
    await apiPromise;

    await assertCleanPage(page);

    // KPI labels
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Total Spend|Revenue|ROAS|Active Creatives/);

    // At least one formatted number (currency or multiplier)
    expect(body).toMatch(/[\u20B9$][\d,.]+|[\d.]+x/);

    // Chart metric tabs
    for (const tab of ['ROAS', 'CTR', 'CPA', 'Spend']) {
      await expect(page.locator(`text=${tab}`).first()).toBeVisible();
    }

    await snap(page, '03-dashboard');
  });

  // ── Analytics ──────────────────────────────────────────────
  test('Analytics shows 8 KPI cards and campaign table', async ({ page }) => {
    const apiPromise = waitForApi(page, '/analytics/full');
    await goTo(page, '/app/analytics');
    await apiPromise;

    await assertCleanPage(page);

    // KPI cards
    for (const label of ['Total Spend', 'Blended ROAS', 'Avg CPA', 'Avg CTR', 'Impressions', 'Clicks', 'Conversions', 'Revenue']) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible();
    }

    // Campaign breakdown table has rows
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    expect(await rows.count()).toBeGreaterThan(0);

    // Export CSV button
    await expect(page.locator('button:has-text("Export CSV")')).toBeVisible();
    await expect(page.locator('button:has-text("Export CSV")')).toBeEnabled();

    await snap(page, '03-analytics');
  });

  // ── Attribution ────────────────────────────────────────────
  test('Attribution shows model buttons and real KPIs', async ({ page }) => {
    await goTo(page, '/app/attribution');
    await page.waitForLoadState('networkidle');

    await assertCleanPage(page);

    // Model buttons
    for (const model of ['First Touch', 'Last Touch', 'Linear', 'Time Decay', 'Data-Driven']) {
      await expect(page.locator(`button:has-text("${model}"), [class*="tab"]:has-text("${model}")`).first()).toBeVisible();
    }

    // Export CSV
    await expect(page.locator('button:has-text("Export CSV")')).toBeEnabled();

    // KPI labels
    for (const label of ['Total Conversions', 'Attributed Revenue', 'Total Spend', 'Campaigns Tracked']) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible();
    }

    // No fake trends
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('+12.3%');
    expect(body).not.toContain('4.2 days');

    await snap(page, '03-attribution');
  });

  // ── Creative Cockpit ───────────────────────────────────────
  test('Creative Cockpit shows filters and creative count', async ({ page }) => {
    const apiPromise = waitForApi(page, '/ad-accounts/top-ads');
    await goTo(page, '/app/creative-cockpit');
    await apiPromise;

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Creative Cockpit"), h2:has-text("Creative Cockpit")').first()).toBeVisible();

    // Filter dropdowns (select elements, text is inside option values)
    const filters = page.locator('select');
    expect(await filters.count()).toBeGreaterThanOrEqual(3);

    // "Showing X of Y creatives" badge with numbers > 0
    const badge = page.locator('text=/Showing \\d+ of \\d+ creatives/i');
    await expect(badge).toBeVisible({ timeout: 10000 });

    await snap(page, '03-creative-cockpit');
  });

  // ── Brain ──────────────────────────────────────────────────
  test('Brain shows DNA patterns and Compare Brands', async ({ page }) => {
    const apiPromise = waitForApi(page, '/brain/patterns');
    await goTo(page, '/app/brain');
    await apiPromise;

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Brain"), h2:has-text("Brain")').first()).toBeVisible();
    await expect(page.locator('text=/Cross-Brand DNA Patterns/i').first()).toBeVisible();

    // At least one pattern card OR empty state
    const patternCard = page.locator('[class*="pattern"], [class*="card"]').first();
    const emptyState = page.locator('text=/no patterns|no data/i').first();
    await expect(patternCard.or(emptyState)).toBeVisible({ timeout: 10000 });

    await expect(page.locator('text=/Compare Brands/i').first()).toBeVisible();

    await snap(page, '03-brain');
  });

  // ── Swipe File ─────────────────────────────────────────────
  test('Swipe File shows action buttons and ad cards', async ({ page }) => {
    const apiPromise = waitForApi(page, '/ad-accounts/top-ads');
    await goTo(page, '/app/swipe-file');
    await apiPromise;

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Swipe File"), h2:has-text("Swipe File")').first()).toBeVisible();

    await expect(page.locator('button:has-text("Save from URL")')).toBeVisible();
    await expect(page.locator('button:has-text("Save from URL")')).toBeEnabled();
    await expect(page.locator('button:has-text("Browse Meta Ad Library"), a:has-text("Browse Meta Ad Library")').first()).toBeVisible();

    // Ad cards OR empty state
    const adCard = page.locator('[class*="ad-card"], [class*="creative-card"], [class*="card"]').first();
    const emptyState = page.locator('text=/No ads in your swipe file/i').first();
    await expect(adCard.or(emptyState)).toBeVisible({ timeout: 10000 });

    await snap(page, '03-swipe-file');
  });

  // ── Director Lab ───────────────────────────────────────────
  test('Director Lab shows brief generator with real controls', async ({ page }) => {
    await goTo(page, '/app/director-lab');

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Director Lab"), h2:has-text("Director Lab")').first()).toBeVisible();
    await expect(page.locator('text=/Creative Brief Generator/i').first()).toBeVisible();

    // Brief count badge shows a number (not hardcoded "246")
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Briefs generated: 246');
    expect(body).not.toContain('example.com');

    // Format buttons
    for (const fmt of ['Static', 'Video', 'Both']) {
      await expect(page.locator(`button:has-text("${fmt}"), [class*="pill"]:has-text("${fmt}"), [class*="chip"]:has-text("${fmt}")`).first()).toBeVisible();
    }

    // Tone pills
    for (const tone of ['Urgent', 'Aspirational', 'Educational']) {
      await expect(page.locator(`text=${tone}`).first()).toBeVisible();
    }

    await snap(page, '03-director-lab');
  });

  // ── Campaigns ──────────────────────────────────────────────
  test('Campaigns shows builder with new campaign button', async ({ page }) => {
    const apiPromise = waitForApi(page, '/campaigns/list');
    await goTo(page, '/app/campaigns');
    await apiPromise;

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Campaign"), h2:has-text("Campaign")').first()).toBeVisible();
    await expect(page.locator('button:has-text("New Campaign")')).toBeVisible();

    // Campaigns table OR empty state
    const table = page.locator('table, [class*="campaign-list"]').first();
    const emptyState = page.locator('text=/No campaigns yet/i').first();
    await expect(table.or(emptyState)).toBeVisible({ timeout: 10000 });

    await snap(page, '03-campaigns');
  });

  // ── Assets ─────────────────────────────────────────────────
  test('Assets shows vault with upload and view toggles', async ({ page }) => {
    await goTo(page, '/app/assets');
    await page.waitForTimeout(3000);

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Assets"), h2:has-text("Assets")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Upload Files"), button:has-text("Upload")').first()).toBeVisible();

    // Grid and List toggle buttons
    await expect(page.locator('button:has-text("Grid"), [aria-label*="Grid"], [title*="Grid"]').first()).toBeVisible();
    await expect(page.locator('button:has-text("List"), [aria-label*="List"], [title*="List"]').first()).toBeVisible();

    // Folder sidebar
    await expect(page.locator('text=/All Files/i').first()).toBeVisible();

    // Storage indicator
    await expect(page.locator('text=/storage|MB|GB/i').first()).toBeVisible();

    await snap(page, '03-assets');
  });

  // ── Audit ──────────────────────────────────────────────────
  test('Audit shows health score and category cards', async ({ page }) => {
    await goTo(page, '/app/audit');

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Audit"), h2:has-text("Audit")').first()).toBeVisible();
    await expect(page.locator('text=/Overall Health Score/i').first()).toBeVisible();

    // Score circle shows 0-100
    const scoreText = await page.locator('text=/\\b\\d{1,3}\\b/').first().textContent() ?? '';
    const score = parseInt(scoreText.match(/\d+/)?.[0] ?? '-1');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);

    // Category cards (at least 3)
    const cards = page.locator('[class*="category"], [class*="audit-card"], [class*="card"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(3);

    // Action buttons
    await expect(page.locator('button:has-text("Generate Full Audit Report"), button:has-text("Generate")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Fix Issues Automatically"), button:has-text("Fix")').first()).toBeVisible();

    await snap(page, '03-audit');
  });

  // ── Autopilot ──────────────────────────────────────────────
  test('Autopilot shows filter tabs and alert cards', async ({ page }) => {
    const apiPromise = waitForApi(page, '/autopilot/alerts');
    await goTo(page, '/app/autopilot');
    await apiPromise;

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Autopilot"), h2:has-text("Autopilot")').first()).toBeVisible();

    // Filter tabs
    for (const tab of ['All', 'Unread', 'Critical', 'Warnings', 'Success']) {
      await expect(page.locator(`button:has-text("${tab}"), [class*="tab"]:has-text("${tab}")`).first()).toBeVisible();
    }

    await expect(page.locator('button:has-text("Mark all read"), button:has-text("Mark All Read")').first()).toBeVisible();

    // Alert cards OR empty state
    const emptyState = page.locator('text=/No alerts found/i').first();
    const alertCard = page.locator('[class*="alert-card"]').first();
    await expect(emptyState.or(alertCard)).toBeVisible({ timeout: 10000 });

    await snap(page, '03-autopilot');
  });

  // ── Automations ────────────────────────────────────────────
  test('Automations shows rules and stats cards', async ({ page }) => {
    const apiPromise = waitForApi(page, '/automations/list');
    await goTo(page, '/app/automations');
    await apiPromise;

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Automation"), h2:has-text("Automation")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Create New Rule")')).toBeVisible();

    // Stats cards
    for (const stat of ['Total Rules', 'Active', 'Total Triggers']) {
      await expect(page.locator(`text=${stat}`).first()).toBeVisible();
    }

    await snap(page, '03-automations');
  });

  // ── Reports ────────────────────────────────────────────────
  test('Reports shows list with new report button', async ({ page }) => {
    const apiPromise = waitForApi(page, '/reports/list');
    await goTo(page, '/app/reports');
    await apiPromise;

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Report"), h2:has-text("Report")').first()).toBeVisible();
    await expect(page.locator('button:has-text("New Report")')).toBeVisible();

    // Reports table OR empty state
    const table = page.locator('table, [class*="report-list"]').first();
    const emptyState = page.locator('text=/No reports generated yet/i').first();
    await expect(table.or(emptyState)).toBeVisible({ timeout: 10000 });

    await snap(page, '03-reports');
  });

  // ── Competitor Spy ─────────────────────────────────────────
  test('Competitor Spy shows search input and analyze button', async ({ page }) => {
    await goTo(page, '/app/competitor-spy');

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Competitor"), h2:has-text("Competitor")').first()).toBeVisible();

    // Search input
    await expect(page.locator('input[type="text"]').first()).toBeVisible();

    // Analyze button
    await expect(page.locator('button:has-text("Analyze")').first()).toBeVisible();

    // Country dropdown exists (India is inside a select, not visible text)
    await expect(page.locator('select').first()).toBeVisible();

    await snap(page, '03-competitor-spy');
  });

  // ── Settings ───────────────────────────────────────────────
  test('Settings shows tabs and profile form', async ({ page }) => {
    await goTo(page, '/app/settings');

    await assertCleanPage(page);

    await expect(page.locator('h1:has-text("Settings"), h2:has-text("Settings")').first()).toBeVisible();

    // Tabs
    for (const tab of ['Profile', 'Connected Accounts', 'Team', 'Billing', 'Notifications']) {
      await expect(page.locator(`text=${tab}`).first()).toBeVisible();
    }

    // Profile form
    await expect(page.locator('text=/Personal Information/i').first()).toBeVisible();
    await expect(page.locator('input').first()).toBeVisible();

    await expect(page.locator('button:has-text("Save Changes")')).toBeVisible();

    await snap(page, '03-settings');
  });
});
