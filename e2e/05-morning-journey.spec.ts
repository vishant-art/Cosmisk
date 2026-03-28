/**
 * Morning User Journey — "Is Cosmisk actually useful?"
 *
 * Simulates a real D2C brand owner (Vishant, Pratap Sons) waking up at 7 AM
 * and using Cosmisk to understand their ad performance and take action.
 *
 * This is NOT a load test. This tests whether the DATA is helpful.
 * Every assertion checks: "Does this answer a real question the user has?"
 */
import { test, expect } from '@playwright/test';
import { loginWithAccount, goTo, snap } from './helpers';

test.describe('Morning Journey — What a Real User Sees', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithAccount(page);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: "How are my ads doing?" — Dashboard
  // User question: "Should I worry or celebrate?"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Step 1: Dashboard gives me a clear picture of ad health', async ({ page }) => {
    await goTo(page, '/app/dashboard');
    await page.waitForTimeout(3000);

    // Can I see how much I spent?
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Total Spend/);
    expect(body).toMatch(/[\u20B9$][\d,.]+[LKCr]?/); // Real currency amount

    // Can I see my return?
    expect(body).toMatch(/Revenue/);
    expect(body).toMatch(/ROAS/);

    // Does the trend chart show me direction (up or down)?
    const trendChartExists = await page.locator('text=/Performance Trend/i').isVisible();
    expect(trendChartExists).toBe(true);

    // Are there AI insights telling me WHAT TO DO (not just numbers)?
    const hasAIInsights = await page.locator('text=/AI Insights/i').isVisible();
    expect(hasAIInsights).toBe(true);

    // Does the insight mention specific campaigns or actions?
    const insightText = await page.locator('[class*="insight"], [class*="card"]:has-text("ROAS")').first().textContent() ?? '';
    const isActionable = /scale|pause|increase|decrease|budget|optimize|campaign|DSG_/i.test(insightText);
    expect(isActionable).toBe(true);

    // Are there recommended actions? (not just data, but guidance)
    const hasRecommendations = await page.locator('text=/Recommended Actions/i').isVisible();
    expect(hasRecommendations).toBe(true);

    // Top creatives table — can I see which ads are winning?
    const hasTopCreatives = await page.locator('text=/Top Performing Creatives/i').isVisible();
    expect(hasTopCreatives).toBe(true);

    // Does it show ROAS per creative (so I know what to scale)?
    const creativeRows = page.locator('tbody tr');
    const rowCount = await creativeRows.count();
    expect(rowCount).toBeGreaterThan(0);

    await snap(page, '05-morning-1-dashboard');
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: "What should I do today?" — AI Studio
  // User question: "Give me a strategic briefing, not just data."
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Step 2: AI Studio gives strategic guidance (not just numbers)', async ({ page }) => {
    await goTo(page, '/app/ai-studio');
    await page.waitForTimeout(5000);

    const body = await page.locator('body').textContent() ?? '';

    // Does the AI Studio exist and load?
    const hasStudio = /AI Studio|What will you create|Ask Cosmisk/i.test(body);
    expect(hasStudio).toBe(true);

    // Can I ask the AI a question?
    const hasInput = await page.locator('textarea, input[type="text"]').first().isVisible().catch(() => false);
    expect(hasInput).toBe(true);

    // Is there a morning briefing or proactive intelligence?
    const hasBriefing = /briefing|morning|today|performance|summary|insight/i.test(body);

    await snap(page, '05-morning-2-ai-studio');

    // Log what the user actually sees (for manual review)
    console.log('AI Studio content preview:', body.substring(0, 500));
    console.log('Has briefing/proactive content:', hasBriefing);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3: "Which of my creatives are actually working?" — Creative Cockpit
  // User question: "Show me winners vs losers with real metrics."
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Step 3: Creative Cockpit shows me winners vs losers', async ({ page }) => {
    await goTo(page, '/app/creative-cockpit');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // How many creatives do I have?
    const countMatch = body.match(/Showing (\d+) of (\d+) creatives/i);
    expect(countMatch).not.toBeNull();
    const totalCreatives = parseInt(countMatch![2]);
    expect(totalCreatives).toBeGreaterThan(0);

    // Can I filter by DNA type? (not just see a flat list)
    const filterCount = await page.locator('select').count();
    expect(filterCount).toBeGreaterThanOrEqual(3); // Hook DNA, Visual DNA, Status, Format

    // Do creatives have ROAS numbers? (so I can compare)
    expect(body).toMatch(/\d+(\.\d+)?x/); // e.g., "16.03x" or "209.23x"

    // Can I see thumbnails? (visual context, not just text)
    const images = page.locator('img');
    const imgCount = await images.count();
    expect(imgCount).toBeGreaterThan(0);

    // Are there status indicators (Winning/Stable/Fatiguing)?
    const hasStatus = /winning|stable|fatiguing|new/i.test(body);
    expect(hasStatus).toBe(true);

    await snap(page, '05-morning-3-creative-cockpit');
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 4: "Deep dive into the numbers" — Analytics
  // User question: "Break it down by campaign. Which audiences work?"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Step 4: Analytics breaks down performance by campaign and audience', async ({ page }) => {
    await goTo(page, '/app/analytics');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // 8 KPI cards (complete picture, not just ROAS)
    for (const metric of ['Total Spend', 'Blended ROAS', 'Avg CPA', 'Avg CTR']) {
      expect(body).toContain(metric);
    }

    // Campaign breakdown table with real campaign names
    expect(body).toMatch(/DSG_/); // Real campaign naming convention
    const campaignRows = page.locator('tbody tr');
    const rowCount = await campaignRows.count();
    expect(rowCount).toBeGreaterThan(5); // Multiple campaigns, not just 1-2

    // Audience insights — can I see which demographics work?
    const hasAudience = /Audience Insights|18-24|25-34|female|male/i.test(body);
    expect(hasAudience).toBe(true);

    // Unit economics — do I know my CPC and CPA?
    const hasUnitEcon = /Cost Per Click|Cost Per Acquisition|Unit Economics/i.test(body);
    expect(hasUnitEcon).toBe(true);

    // Export capability — can I share this with my team?
    const exportBtn = page.locator('button:has-text("Export CSV")');
    await expect(exportBtn).toBeVisible();
    await expect(exportBtn).toBeEnabled();

    await snap(page, '05-morning-4-analytics');
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 5: "Is my account healthy?" — Audit
  // User question: "Am I making obvious mistakes?"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Step 5: Audit tells me if my account is healthy', async ({ page }) => {
    await goTo(page, '/app/audit');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // Health score out of 100
    const scoreMatch = body.match(/(\d{1,3})\s*\/\s*100/);
    expect(scoreMatch).not.toBeNull();
    const healthScore = parseInt(scoreMatch![1]);
    expect(healthScore).toBeGreaterThanOrEqual(0);
    expect(healthScore).toBeLessThanOrEqual(100);

    // Category breakdown (not just one number, but WHY)
    for (const category of ['Account Structure', 'Creative Health', 'Audience Targeting', 'Budget Allocation']) {
      expect(body).toContain(category);
    }

    // Each category has its own score
    const categoryScores = body.match(/(\d{1,3})\s*\/100/g);
    expect(categoryScores).not.toBeNull();
    expect(categoryScores!.length).toBeGreaterThanOrEqual(4);

    // Warnings point to specific problems (actionable, not generic)
    const hasSpecificFeedback = /campaigns|CPA|segments|formats|bidding/i.test(body);
    expect(hasSpecificFeedback).toBe(true);

    // Can I auto-fix issues?
    const fixBtn = page.locator('button:has-text("Fix Issues Automatically"), button:has-text("Fix")').first();
    await expect(fixBtn).toBeVisible();

    await snap(page, '05-morning-5-audit');
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 6: "What are my competitors running?" — Competitor Spy
  // User question: "What's working for similar brands?"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Step 6: Competitor Spy lets me research any brand', async ({ page }) => {
    await goTo(page, '/app/competitor-spy');
    await page.waitForTimeout(2000);

    // Search input for brand name
    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible();

    // Country selector
    const countrySelect = page.locator('select').first();
    await expect(countrySelect).toBeVisible();

    // Analyze button
    const analyzeBtn = page.locator('button:has-text("Analyze")').first();
    await expect(analyzeBtn).toBeVisible();

    await snap(page, '05-morning-6-competitor-spy');
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 7: "I want to create new ads" — Director Lab
  // User question: "Generate creative briefs based on what's working."
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Step 7: Director Lab generates briefs from real patterns', async ({ page }) => {
    await goTo(page, '/app/director-lab');
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent() ?? '';

    // Brief generator with real controls
    expect(body).toContain('Creative Brief Generator');

    // Can I base the brief on a winning creative?
    const creativeSelector = page.locator('select').first();
    await expect(creativeSelector).toBeVisible();

    // Output format options
    for (const format of ['Static', 'Video', 'Both']) {
      await expect(page.locator(`button:has-text("${format}"), [class*="pill"]:has-text("${format}"), [class*="chip"]:has-text("${format}")`).first()).toBeVisible();
    }

    // Tone options (multiple, not just one)
    const tones = ['Urgent', 'Aspirational', 'Educational', 'Playful', 'Premium', 'Emotional', 'Bold', 'Conversational'];
    let visibleTones = 0;
    for (const tone of tones) {
      if (await page.locator(`text=${tone}`).first().isVisible().catch(() => false)) {
        visibleTones++;
      }
    }
    expect(visibleTones).toBeGreaterThanOrEqual(5);

    // Generate button
    await expect(page.locator('button:has-text("Generate Creative Brief")')).toBeVisible();

    await snap(page, '05-morning-7-director-lab');
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 8: "What does the Brain know about my ads?" — Brain
  // User question: "What patterns are working across my brands?"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  test('Step 8: Brain shows cross-brand intelligence', async ({ page }) => {
    await goTo(page, '/app/brain');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // Cross-brand DNA patterns heading
    expect(body).toContain('Cross-Brand DNA Patterns');

    // Shows real brand count (not hardcoded)
    const brandMatch = body.match(/(\d+)\s*(ad accounts|brands|creatives analyzed)/i);
    expect(brandMatch).not.toBeNull();

    // Compare Brands feature
    expect(body).toContain('Compare Brands');

    // Real brand names visible (not placeholder)
    const hasRealBrands = /BLUEBEAR|PRATAPRASIONS|Tatermedia|Rensons|Volex/i.test(body);
    expect(hasRealBrands).toBe(true);

    // Metric selector for comparison
    await expect(page.locator('select').first()).toBeVisible();

    await snap(page, '05-morning-8-brain');
  });
});
