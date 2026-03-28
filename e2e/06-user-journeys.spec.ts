/**
 * Real User Journeys — Does Cosmisk SOLVE problems or just SHOW data?
 *
 * Each test simulates a real person with a real emotional state and a real problem.
 * We test: Can they find the answer? Can they take action? Does the app give relief?
 *
 * Verdict categories:
 *   SOLVES    = User can find problem AND take action to fix it
 *   INFORMS   = User can find problem but must act elsewhere (Meta Ads Manager)
 *   FAILS     = User cannot even find what they need
 */
import { test, expect } from '@playwright/test';
import { loginWithAccount, goTo, snap } from './helpers';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERSONA 1: FRUSTRATED D2C FOUNDER
// "I'm losing Rs 50K/week on ads. What's going wrong? Fix it NOW."
// Emotional state: Anxious, impatient, needs answers in < 2 minutes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('Persona 1: Frustrated Founder Losing Money', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithAccount(page);
  });

  test('1A: Can I instantly see I\'m losing money? (< 5 seconds)', async ({ page }) => {
    await goTo(page, '/app/dashboard');
    await page.waitForTimeout(4000);

    const body = await page.locator('body').textContent() ?? '';

    // CRITICAL: Do I see spend vs revenue at a glance?
    const hasSpend = /Total Spend/.test(body);
    const hasRevenue = /Revenue/.test(body);
    const hasROAS = /ROAS/.test(body);
    expect(hasSpend).toBe(true);
    expect(hasRevenue).toBe(true);
    expect(hasROAS).toBe(true);

    // CRITICAL: Is the ROAS trend showing me direction?
    // A frustrated founder needs to know: is it getting WORSE?
    const hasTrendIndicator = /[\u2191\u2193]|trending|↑|↓|\+|-|\d+(\.\d+)?%/i.test(body);
    expect(hasTrendIndicator).toBe(true);

    // VERDICT CHECK: Are there red/negative indicators visible?
    // (The founder needs to FEEL the urgency the data conveys)
    const hasNegativeSignal = page.locator('text=/-\\d|\\u2193|trending-down/i, .text-red-500, .text-red-400, .text-red-600').first();
    const negativeVisible = await hasNegativeSignal.isVisible().catch(() => false);
    console.log('VERDICT 1A - Negative trend visible:', negativeVisible);
    console.log('VERDICT 1A - ROAS value visible:', hasROAS);

    await snap(page, '06-founder-1a-dashboard-glance');
  });

  test('1B: Can I find WHICH campaigns are bleeding money?', async ({ page }) => {
    await goTo(page, '/app/analytics');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // Can I see campaigns sorted by performance?
    const campaignRows = page.locator('tbody tr');
    const rowCount = await campaignRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // CRITICAL: Can I identify 0x ROAS campaigns (money burners)?
    const has0xROAS = /\b0x\b/.test(body);
    console.log('VERDICT 1B - Can spot 0x ROAS campaigns:', has0xROAS);

    // Can I see spend per campaign? (to know HOW MUCH I'm losing)
    const hasSpendColumn = /Spend/.test(body);
    expect(hasSpendColumn).toBe(true);

    // CRITICAL: Can I see which campaigns have high spend + low ROAS?
    // This is the "money burner" identification
    const allRows = await campaignRows.allTextContents();
    let moneyBurners = 0;
    for (const row of allRows) {
      if (/0x/.test(row) && /\d{3,}/.test(row)) { // 0x ROAS + 3+ digit spend
        moneyBurners++;
      }
    }
    console.log('VERDICT 1B - Money-burning campaigns found:', moneyBurners);

    // BUT: Can I DO anything about it from here?
    // Check for action buttons (pause, adjust budget, etc.)
    const hasPauseButton = await page.locator('button:has-text("Pause"), button:has-text("Stop"), button[aria-label*="pause"]').first().isVisible().catch(() => false);
    const hasActionMenu = await page.locator('button:has-text("Actions"), [class*="action"], button:has-text("Manage")').first().isVisible().catch(() => false);
    console.log('VERDICT 1B - Can PAUSE bad campaigns from here:', hasPauseButton);
    console.log('VERDICT 1B - Has action menu:', hasActionMenu);

    await snap(page, '06-founder-1b-find-bleeders');
  });

  test('1C: Can the AI just TELL ME what to do?', async ({ page }) => {
    await goTo(page, '/app/dashboard');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // AI Insights section — does it give SPECIFIC recommendations?
    const insightsSection = page.locator('text=/AI Insights/i').first();
    const hasInsights = await insightsSection.isVisible().catch(() => false);
    expect(hasInsights).toBe(true);

    // Does the recommendation name SPECIFIC campaigns?
    const hasSpecificCampaign = /DSG_|campaign.*name|BOF|TOF|ABO/i.test(body);
    console.log('VERDICT 1C - Mentions specific campaigns:', hasSpecificCampaign);

    // Does it give SPECIFIC actions? (not just "improve your ROAS")
    const hasSpecificAction = /scale|pause|increase.*budget|decrease.*budget|kill|stop|reallocate|shift/i.test(body);
    console.log('VERDICT 1C - Gives specific actions:', hasSpecificAction);

    // Does it mention AMOUNTS? (not just "increase budget")
    const hasAmounts = /\d+%|₹[\d,.]+|Rs[\d,.]+|\d+x/i.test(body);
    console.log('VERDICT 1C - Mentions specific amounts:', hasAmounts);

    // CRITICAL: Is there a "Do it" button next to the recommendation?
    const hasDoItButton = await page.locator('button:has-text("Apply"), button:has-text("Execute"), button:has-text("Do it"), button:has-text("Scale"), button:has-text("Pause")').first().isVisible().catch(() => false);
    console.log('VERDICT 1C - Has "Do it" action button:', hasDoItButton);

    // Recommended Actions section
    const recActions = page.locator('text=/Recommended Actions/i');
    const hasRecActions = await recActions.isVisible().catch(() => false);
    console.log('VERDICT 1C - Has Recommended Actions section:', hasRecActions);

    await snap(page, '06-founder-1c-ai-tells-me');
  });

  test('1D: Can I set up autopilot to PREVENT future losses?', async ({ page }) => {
    await goTo(page, '/app/automations');
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent() ?? '';

    // Is the Create Rule button accessible?
    const createBtn = page.locator('button:has-text("Create New Rule")');
    await expect(createBtn).toBeVisible();

    // CRITICAL: Are there TEMPLATE rules for common scenarios?
    // "Pause if CPA > X", "Scale if ROAS > 3x", etc.
    const hasTemplates = /template|preset|suggested|common|popular|pause.*CPA|scale.*ROAS/i.test(body);
    console.log('VERDICT 1D - Has rule templates:', hasTemplates);

    // How many active rules protect the account right now?
    const activeMatch = body.match(/(\d+)\s*Active/);
    const activeRules = activeMatch ? parseInt(activeMatch[1]) : 0;
    console.log('VERDICT 1D - Active protection rules:', activeRules);

    // Stats cards visible
    expect(body).toContain('Total Rules');
    expect(body).toContain('Active');

    await snap(page, '06-founder-1d-autopilot-setup');
  });

  test('1E: Account Audit — does it tell me what I\'m doing WRONG?', async ({ page }) => {
    await goTo(page, '/app/audit');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // Health score — am I in trouble?
    const scoreMatch = body.match(/(\d{1,3})\s*\/\s*100/);
    expect(scoreMatch).not.toBeNull();
    const score = parseInt(scoreMatch![1]);

    // CRITICAL: Does each category explain WHY and HOW to fix?
    // Not just "70/100" but "11 campaigns have CPA above Rs 3902"
    const hasSpecificProblem = /\d+\s*campaigns?|CPA above|showing room|segments|formats/i.test(body);
    console.log('VERDICT 1E - Health score:', score);
    console.log('VERDICT 1E - Explains specific problems:', hasSpecificProblem);

    // "Fix Issues Automatically" button — can I one-click fix?
    const fixBtn = page.locator('button:has-text("Fix Issues Automatically"), button:has-text("Fix")').first();
    const canAutoFix = await fixBtn.isVisible().catch(() => false);
    console.log('VERDICT 1E - Can auto-fix issues:', canAutoFix);

    // "Generate Full Audit Report" — can I share this?
    const reportBtn = page.locator('button:has-text("Generate Full Audit Report"), button:has-text("Generate")').first();
    const canGenerateReport = await reportBtn.isVisible().catch(() => false);
    console.log('VERDICT 1E - Can generate shareable report:', canGenerateReport);

    await snap(page, '06-founder-1e-audit');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERSONA 2: AGENCY MEDIA BUYER MANAGING 10 BRANDS
// "I have 30 minutes before client calls. Need status on all brands."
// Emotional state: Rushed, needs efficiency, wants to look smart
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('Persona 2: Agency Media Buyer (10 brands, 30 min)', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithAccount(page);
  });

  test('2A: Can I see ALL brands at once? (multi-brand overview)', async ({ page }) => {
    await goTo(page, '/app/brain');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // How many brands/accounts can I see?
    const brandCountMatch = body.match(/(\d+)\s*(ad accounts|brands)/i);
    const brandCount = brandCountMatch ? parseInt(brandCountMatch[1]) : 0;
    console.log('VERDICT 2A - Brands visible at once:', brandCount);

    // Can I compare brands against each other?
    const hasCompare = /Compare Brands/i.test(body);
    console.log('VERDICT 2A - Can compare brands:', hasCompare);

    // CRITICAL: Can I switch between brands quickly?
    const brandSelector = page.locator('[class*="account-select"], select:has-text("Pratap"), [class*="dropdown"]').first();
    const canSwitchBrands = await brandSelector.isVisible().catch(() => false);

    // Also check sidebar for account switcher
    const sidebarSwitcher = page.locator('text=/Pratap sons/i').first();
    const hasSidebarSwitcher = await sidebarSwitcher.isVisible().catch(() => false);
    console.log('VERDICT 2A - Can switch brands quickly:', canSwitchBrands || hasSidebarSwitcher);

    await snap(page, '06-agency-2a-multi-brand');
  });

  test('2B: Can I generate a client report in < 2 minutes?', async ({ page }) => {
    await goTo(page, '/app/reports');
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent() ?? '';

    // Is there a "New Report" button?
    const newReportBtn = page.locator('button:has-text("New Report")');
    await expect(newReportBtn).toBeVisible();

    // Report type filters — different reports for different needs
    const hasReportTypes = /All|Performance|Creative|Audience|AI Agent/i.test(body);
    console.log('VERDICT 2B - Multiple report types:', hasReportTypes);

    // CRITICAL: Are there any pre-generated reports?
    const hasExistingReports = !/No reports generated yet/i.test(body);
    console.log('VERDICT 2B - Has pre-generated reports:', hasExistingReports);

    // Can I generate a PDF to send to client?
    console.log('VERDICT 2B - New Report button exists: true');

    await snap(page, '06-agency-2b-reports');
  });

  test('2C: Can I quickly identify which brand needs attention?', async ({ page }) => {
    await goTo(page, '/app/analytics');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // Campaign breakdown — can I see all campaigns at once?
    const campaignRows = page.locator('tbody tr');
    const rowCount = await campaignRows.count();
    console.log('VERDICT 2C - Campaigns visible:', rowCount);

    // CRITICAL: Can I sort/filter by worst performers?
    // (Agency buyer needs to find fires FAST)
    const hasSortHeaders = await page.locator('th:has-text("ROAS"), th:has-text("Spend"), th:has-text("CPA")').first().isVisible().catch(() => false);
    console.log('VERDICT 2C - Can sort by ROAS/Spend/CPA:', hasSortHeaders);

    // Trend arrows — which campaigns are getting worse?
    const hasTrendArrows = page.locator('[class*="trending"], lucide-icon[name="trending-up"], lucide-icon[name="trending-down"]');
    const trendCount = await hasTrendArrows.count();
    console.log('VERDICT 2C - Trend indicators on campaigns:', trendCount);

    // Export for client deck
    const exportBtn = page.locator('button:has-text("Export CSV")');
    const canExport = await exportBtn.isVisible().catch(() => false);
    console.log('VERDICT 2C - Can export data:', canExport);

    await snap(page, '06-agency-2c-find-fires');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERSONA 3: SOLO D2C CONTENT CREATOR
// "I need 5 new ad creatives by tonight. I have no team."
// Emotional state: Overwhelmed, creative block, needs AI to do the work
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('Persona 3: Solo Creator Needs 5 Ads Tonight', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithAccount(page);
  });

  test('3A: Can I generate a creative brief from my winning patterns?', async ({ page }) => {
    await goTo(page, '/app/director-lab');
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent() ?? '';

    // Can I select a winning creative to base my brief on?
    const creativeDropdown = page.locator('select').first();
    await expect(creativeDropdown).toBeVisible();

    // CRITICAL: Are the options populated from my REAL creatives?
    const options = await creativeDropdown.locator('option').allTextContents();
    const realOptions = options.filter(o => o.trim() && !o.includes('Select'));
    console.log('VERDICT 3A - Real creatives available to base brief on:', realOptions.length);

    // Can I specify format (Static/Video/Both)?
    for (const fmt of ['Static', 'Video', 'Both']) {
      const fmtBtn = page.locator(`button:has-text("${fmt}"), [class*="pill"]:has-text("${fmt}")`).first();
      await expect(fmtBtn).toBeVisible();
    }

    // Can I choose tone?
    const toneCount = await page.locator('button:has-text("Urgent"), button:has-text("Aspirational"), button:has-text("Educational"), button:has-text("Bold")').count();
    console.log('VERDICT 3A - Tone options available:', toneCount);

    // Generate button exists
    const generateBtn = page.locator('button:has-text("Generate Creative Brief")');
    await expect(generateBtn).toBeVisible();
    const isEnabled = await generateBtn.isEnabled();
    console.log('VERDICT 3A - Generate button enabled:', isEnabled);

    await snap(page, '06-creator-3a-brief-setup');
  });

  test('3B: Can I access UGC/video generation tools?', async ({ page }) => {
    await goTo(page, '/app/creative-studio');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // Does the creative studio exist?
    const hasStudio = /Creative Studio|UGC|Generate|Video/i.test(body);
    console.log('VERDICT 3B - Creative Studio loads:', hasStudio);

    // Can I generate different formats?
    const hasFormats = /UGC|Static|Carousel|Video|Podcast/i.test(body);
    console.log('VERDICT 3B - Multiple format options:', hasFormats);

    // CRITICAL: Is there a path from "I have nothing" to "I have an ad"?
    const hasGenerateAction = await page.locator('button:has-text("Generate"), button:has-text("Create"), button:has-text("New")').first().isVisible().catch(() => false);
    console.log('VERDICT 3B - Has generation action:', hasGenerateAction);

    await snap(page, '06-creator-3b-creative-studio');
  });

  test('3C: Can Creative Engine plan a full sprint for me?', async ({ page }) => {
    await goTo(page, '/app/creative-engine');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // Does it explain what a sprint is?
    const hasSprintConcept = /sprint|batch|generate|plan/i.test(body);
    console.log('VERDICT 3C - Explains sprint concept:', hasSprintConcept);

    // Can I start a new sprint?
    const hasNewSprint = await page.locator('button:has-text("New Sprint"), button:has-text("Start Sprint"), button:has-text("Create Sprint"), button:has-text("Generate")').first().isVisible().catch(() => false);
    console.log('VERDICT 3C - Can start new sprint:', hasNewSprint);

    // Are there existing sprints to review?
    const hasExistingSprints = !/no sprints|get started|empty/i.test(body);
    console.log('VERDICT 3C - Has existing sprints:', hasExistingSprints);

    await snap(page, '06-creator-3c-creative-engine');
  });

  test('3D: Can I spy on competitors for inspiration?', async ({ page }) => {
    await goTo(page, '/app/competitor-spy');
    await page.waitForTimeout(2000);

    // Search for a real brand
    const searchInput = page.locator('input[type="text"]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Boat');

    // Click analyze
    const analyzeBtn = page.locator('button:has-text("Analyze")').first();
    await expect(analyzeBtn).toBeVisible();
    await expect(analyzeBtn).toBeEnabled();

    // Click and wait for results
    await analyzeBtn.click();
    await page.waitForTimeout(10000);

    const body = await page.locator('body').textContent() ?? '';

    // Did we get results? (ads, insights, anything)
    const hasResults = /ad|creative|result|found|active|estimated/i.test(body);
    console.log('VERDICT 3D - Competitor results loaded:', hasResults);

    // Does it show actual competitor ads?
    const adCards = page.locator('[class*="card"], [class*="ad-"], img').first();
    const hasAdCards = await adCards.isVisible().catch(() => false);
    console.log('VERDICT 3D - Shows competitor ad creatives:', hasAdCards);

    await snap(page, '06-creator-3d-competitor-results');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERSONA 4: NEW USER (JUST SIGNED UP)
// "I just connected my Meta account. Now what?"
// Emotional state: Curious but skeptical, judging in first 60 seconds
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('Persona 4: New User — First 60 Seconds', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithAccount(page);
  });

  test('4A: Dashboard gives me instant value (not empty screens)', async ({ page }) => {
    await goTo(page, '/app/dashboard');
    await page.waitForTimeout(4000);

    const body = await page.locator('body').textContent() ?? '';

    // Is there a welcome/onboarding prompt telling me what to do?
    const hasGuidance = /what will you create|get started|recommended|try|explore/i.test(body);
    console.log('VERDICT 4A - Has guidance for new users:', hasGuidance);

    // Are KPIs populated immediately? (from Meta data sync)
    const hasRealData = /₹[\d,.]+[LKCr]?|\d+\.\d+x/i.test(body);
    console.log('VERDICT 4A - Shows real data immediately:', hasRealData);

    // Quick action buttons exist
    const quickActions = page.locator('button:has-text("Creative Engine"), a:has-text("Creative Engine"), button:has-text("Generate"), a:has-text("Generate")');
    const actionCount = await quickActions.count();
    console.log('VERDICT 4A - Quick action buttons:', actionCount);

    await snap(page, '06-newuser-4a-first-dashboard');
  });

  test('4B: Can I get my first "aha" moment in < 2 minutes?', async ({ page }) => {
    // Go to Audit — this gives the fastest "wow" moment
    await goTo(page, '/app/audit');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // Health score — instant visual impact
    const scoreMatch = body.match(/(\d{1,3})\s*\/\s*100/);
    expect(scoreMatch).not.toBeNull();
    const score = parseInt(scoreMatch![1]);
    console.log('VERDICT 4B - Health score (instant wow):', score);

    // Specific insights — not generic tips but real analysis of MY account
    const hasMyData = /\d+\s*(active|campaigns?|creatives?|segments?|formats?)/i.test(body);
    console.log('VERDICT 4B - Uses MY account data:', hasMyData);

    // Category scores give me a clear picture
    const categories = ['Account Structure', 'Creative Health', 'Audience Targeting', 'Budget Allocation', 'Bidding Strategy', 'Creative Diversity'];
    let visibleCategories = 0;
    for (const cat of categories) {
      if (body.includes(cat)) visibleCategories++;
    }
    console.log('VERDICT 4B - Audit categories shown:', visibleCategories, '/ 6');

    await snap(page, '06-newuser-4b-first-aha');
  });

  test('4C: Does the Swipe File give me creative inspiration?', async ({ page }) => {
    await goTo(page, '/app/swipe-file');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // Are there real ads with real images?
    const images = page.locator('img');
    const imgCount = await images.count();
    console.log('VERDICT 4C - Ad images in swipe file:', imgCount);

    // Do ads have performance data (ROAS, spend)?
    const hasPerformance = /\d+(\.\d+)?x|₹\d|spend/i.test(body);
    console.log('VERDICT 4C - Ads show performance data:', hasPerformance);

    // Can I analyze any ad deeper?
    const analyzeButtons = page.locator('button:has-text("Analyze"), button:has-text("DNA"), button:has-text("View")');
    const analyzeCount = await analyzeButtons.count();
    console.log('VERDICT 4C - Can analyze ads deeper:', analyzeCount, 'buttons');

    // CRITICAL: Can I save ads for inspiration?
    const saveButtons = page.locator('button:has-text("Save"), button:has-text("Bookmark")');
    const saveCount = await saveButtons.count();
    console.log('VERDICT 4C - Can save ads:', saveCount, 'save buttons');

    await snap(page, '06-newuser-4c-swipe-file');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERSONA 5: EVENING REVIEW — "What happened today?"
// "I've been in meetings all day. Give me the 2-minute summary."
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('Persona 5: Evening Review — What Happened Today?', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithAccount(page);
  });

  test('5A: Attribution — where did my conversions actually come from?', async ({ page }) => {
    await goTo(page, '/app/attribution');
    await page.waitForTimeout(3000);

    const body = await page.locator('body').textContent() ?? '';

    // Multiple attribution models available (sophisticated, not basic)
    for (const model of ['First Touch', 'Last Touch', 'Linear', 'Time Decay', 'Data-Driven']) {
      expect(body).toContain(model);
    }

    // Total conversions — clear number
    expect(body).toMatch(/Total Conversions/);
    const convMatch = body.match(/Total Conversions[\s\S]*?([\d,.]+[KMB]?)/);
    console.log('VERDICT 5A - Total conversions:', convMatch?.[1]);

    // Attributed revenue
    expect(body).toMatch(/Attributed Revenue/);

    // Top conversion paths — which campaigns actually drive sales?
    const hasConvPaths = /Conversion Paths|Top Conversion/i.test(body);
    console.log('VERDICT 5A - Shows conversion paths:', hasConvPaths);

    // CRITICAL: Real campaign names in paths (not generic)
    const hasRealPaths = /DSG_/.test(body);
    console.log('VERDICT 5A - Paths reference real campaigns:', hasRealPaths);

    await snap(page, '06-evening-5a-attribution');
  });

  test('5B: Autopilot — did the system protect me while I was away?', async ({ page }) => {
    await goTo(page, '/app/autopilot');
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent() ?? '';

    // Filter tabs for different alert types
    for (const tab of ['All', 'Critical', 'Warnings', 'Success']) {
      const tabBtn = page.locator(`button:has-text("${tab}")`).first();
      const isVisible = await tabBtn.isVisible().catch(() => false);
      expect(isVisible).toBe(true);
    }

    // Are there any alerts showing the system was watching?
    const hasAlerts = !/No alerts found/i.test(body);
    console.log('VERDICT 5B - System generated alerts:', hasAlerts);

    // CRITICAL: If no alerts, is that clearly communicated?
    if (!hasAlerts) {
      const hasEmptyExplanation = /monitoring|watching|appear here|detected/i.test(body);
      console.log('VERDICT 5B - Empty state explains why:', hasEmptyExplanation);
    }

    await snap(page, '06-evening-5b-autopilot');
  });

  test('5C: Settings — is my account properly configured?', async ({ page }) => {
    await goTo(page, '/app/settings');
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent() ?? '';

    // All settings tabs accessible
    for (const tab of ['Profile', 'Connected Accounts', 'Team', 'Billing', 'Notifications']) {
      expect(body).toContain(tab);
    }

    // Profile shows real user data
    expect(body).toMatch(/Vishant|vishant/i);

    // Connected Accounts tab — can I check Meta connection?
    const connectedTab = page.locator('text=Connected Accounts').first();
    await connectedTab.click();
    await page.waitForTimeout(2000);

    const connBody = await page.locator('body').textContent() ?? '';
    const hasMeta = /Meta|Facebook|Connected|Active/i.test(connBody);
    console.log('VERDICT 5C - Meta connection visible:', hasMeta);

    await snap(page, '06-evening-5c-settings');
  });
});
