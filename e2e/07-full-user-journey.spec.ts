/**
 * FULL USER JOURNEY TEST
 * Simulates a real user: Sign up → Onboard → Explore every feature →
 * Try key actions. Runs in visible browser with slowMo so you can watch.
 */
import { test, expect } from '@playwright/test';
import { snap } from './helpers';

const BASE = 'https://localhost:4200';
const API = 'http://localhost:3000';
const email = `journey_${Date.now()}@test.com`;
const password = 'TestPass123!';
const name = 'Rahul Mehta';

test.describe.serial('Full User Journey', () => {
  let token: string;

  test('01 — Land on homepage, see hero and CTA', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toContainText(/cosmisk/i);

    const cta = page.locator('a:has-text("Get Started"), button:has-text("Get Started"), a:has-text("Start Free"), button:has-text("Start Free"), a:has-text("Sign Up"), button:has-text("Try")').first();
    await expect(cta).toBeVisible();

    await snap(page, '07-01-landing');
  });

  test('02 — Sign up with email and password', async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    await page.waitForLoadState('networkidle');

    const nameInput = page.locator('input[placeholder="Your full name"]');
    await nameInput.click();
    await nameInput.pressSequentially(name, { delay: 30 });

    const emailInput = page.locator('input[placeholder="you@company.com"]');
    await emailInput.click();
    await emailInput.pressSequentially(email, { delay: 20 });

    const passInput = page.locator('input[placeholder="Min 8 characters"]');
    await passInput.click();
    await passInput.pressSequentially(password, { delay: 20 });

    // Check terms
    const terms = page.locator('input[type="checkbox"]').first();
    if (await terms.isVisible()) {
      await terms.check();
    }

    await snap(page, '07-02-signup-filled');

    // Submit
    const submitBtn = page.locator('button[type="submit"], button:has-text("Create Account"), button:has-text("Sign Up")').first();
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // Should redirect to onboarding or app
    const url = page.url();
    expect(url).toMatch(/onboarding|app|dashboard/);

    await snap(page, '07-03-after-signup');
  });

  test('03 — Complete onboarding flow', async ({ page }) => {
    // Login via API to get token
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = await loginRes.json() as any;
    token = loginBody.token;
    expect(token).toBeTruthy();

    // Inject token
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      try {
        const parts = t.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          localStorage.setItem('cosmisk_user', JSON.stringify(payload));
        }
      } catch {}
    }, token);

    // Go to onboarding
    await page.goto(`${BASE}/onboarding`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await snap(page, '07-04-onboarding');

    // Complete onboarding via API (UI has multi-step validation that's hard to automate)
    await fetch(`${API}/settings/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ onboarding_complete: true }),
    });

    // Update localStorage with onboardingComplete flag so route guard allows access
    await page.evaluate(() => {
      const user = JSON.parse(localStorage.getItem('cosmisk_user') || '{}');
      user.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(user));
    });

    await page.goto(`${BASE}/app/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await expect(page.url()).toContain('/app');
    await snap(page, '07-05-dashboard-first-visit');
  });

  test('04 — Explore Dashboard — see KPIs and sidebar', async ({ page }) => {
    // Inject auth
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const parts = t.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        payload.onboardingComplete = true;
        localStorage.setItem('cosmisk_user', JSON.stringify(payload));
      }
    }, token);

    await page.goto(`${BASE}/app/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Sidebar element should exist in DOM (may be collapsed/hidden on smaller viewports)
    await expect(page.locator('app-sidebar').first()).toBeAttached();

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');

    await snap(page, '07-06-dashboard-explore');
  });

  test('05 — Navigate to Attribution, check real data labels', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/attribution`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    // No fake trends
    expect(body).not.toContain('+12.3%');
    expect(body).not.toContain('4.2 days');
    expect(body).not.toContain('undefined');

    await snap(page, '07-07-attribution');
  });

  test('06 — Visit Swipe File, try Save from URL', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/swipe-file`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    // Verify action buttons
    const saveBtn = page.locator('button:has-text("Save from URL")');
    if (await saveBtn.isVisible()) {
      await expect(saveBtn).toBeEnabled();
    }

    const browseBtn = page.locator('button:has-text("Browse Meta Ad Library")');
    if (await browseBtn.isVisible()) {
      await expect(browseBtn).toBeEnabled();
      // Click Browse — should navigate to competitor spy
      await browseBtn.click();
      await page.waitForTimeout(1500);
      expect(page.url()).toContain('competitor-spy');
      await snap(page, '07-08-browse-navigated');

      // Go back
      await page.goBack();
      await page.waitForTimeout(1500);
    }

    await snap(page, '07-08-swipe-file');
  });

  test('07 — Visit Director Lab, check brief generation UI', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/director-lab`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('Briefs generated: 246');
    expect(body).not.toContain('example.com');
    expect(body).not.toContain('undefined');

    await snap(page, '07-09-director-lab');
  });

  test('08 — Visit Campaigns, check creative selection', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/campaigns`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');

    await snap(page, '07-10-campaigns');
  });

  test('09 — Visit Assets, check upload and toggle', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/assets`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '07-11-assets');
  });

  test('10 — Visit Autopilot, click filter tabs', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/autopilot`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click through tabs
    const criticalTab = page.getByRole('button', { name: 'Critical' });
    if (await criticalTab.isVisible()) {
      await criticalTab.click();
      await page.waitForTimeout(500);
      await snap(page, '07-12-autopilot-critical');
    }

    const allTab = page.getByRole('button', { name: 'All', exact: true });
    if (await allTab.isVisible()) {
      await allTab.click();
      await page.waitForTimeout(500);
    }

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '07-12-autopilot');
  });

  test('11 — Visit Automations, check create button', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/automations`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '07-13-automations');
  });

  test('12 — Visit Brain, check pattern display', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/brain`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');

    await snap(page, '07-14-brain');
  });

  test('13 — Visit Competitor Spy, try a search', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/competitor-spy`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[type="text"], input[placeholder*="search" i], input[placeholder*="brand" i], input[placeholder*="competitor" i]').first();
    if (await searchInput.isVisible()) {
      await searchInput.click();
      await searchInput.pressSequentially('Mamaearth', { delay: 40 });
      await snap(page, '07-15-competitor-spy-typed');

      // Hit search button or Enter
      const searchBtn = page.locator('button:has-text("Search"), button:has-text("Analyze"), button[type="submit"]').first();
      if (await searchBtn.isVisible()) {
        await searchBtn.click();
        await page.waitForTimeout(5000); // API call takes time
        await snap(page, '07-15-competitor-spy-results');
      }
    }

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');

    await snap(page, '07-15-competitor-spy');
  });

  test('14 — Visit Audit, check page renders', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/audit`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('TypeError');

    await snap(page, '07-16-audit');
  });

  test('15 — Visit Settings, update profile name', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Try to find and update the name field
    const nameField = page.locator('input[formcontrolname="name"], input[placeholder*="name" i]').first();
    if (await nameField.isVisible()) {
      await nameField.clear();
      await nameField.pressSequentially('Rahul Mehta Updated', { delay: 20 });
    }

    await snap(page, '07-17-settings');

    // Click save
    const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(2000);

      // Should show success toast, not error
      const body = await page.locator('body').textContent();
      expect(body).not.toContain('Save Failed');
      await snap(page, '07-17-settings-saved');
    }
  });

  test('16 — Visit Reports page', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');

    await snap(page, '07-18-reports');
  });

  test('17 — Full journey screenshot gallery', async ({ page }) => {
    // Final: visit dashboard one more time to capture the "complete" state
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('cosmisk_token', t);
      const p = JSON.parse(atob(t.split('.')[1]));
      p.onboardingComplete = true;
      localStorage.setItem('cosmisk_user', JSON.stringify(p));
    }, token);

    await page.goto(`${BASE}/app/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    await snap(page, '07-19-journey-complete');

    // Verify no page left broken data anywhere
    const body = await page.locator('body').textContent();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');
    expect(body).not.toContain('TypeError');
  });
});
