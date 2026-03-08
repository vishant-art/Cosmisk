import { type Page, expect } from '@playwright/test';

const BASE = 'https://localhost:4200';
const API = 'http://localhost:3000';

/**
 * Sign up a fresh test user via API and return the JWT.
 * Also marks onboarding as complete so the user isn't redirected.
 */
async function getToken(email: string, password: string, name: string): Promise<string> {
  // Try signup first
  let token: string | null = null;

  try {
    const signupRes = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const signupBody = await signupRes.json();
    if (signupBody.success && signupBody.token) token = signupBody.token;
  } catch { /* signup failed, try login */ }

  if (!token) {
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = await loginRes.json();
    if (loginBody.token) token = loginBody.token;
  }

  if (!token) throw new Error(`Could not auth as ${email}`);

  // Mark onboarding as complete so we're not blocked by the onboarding guard
  try {
    await fetch(`${API}/settings/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ onboarding_complete: true }),
    });
  } catch { /* non-critical */ }

  return token;
}

/**
 * Log in by injecting JWT into localStorage, then navigate to app.
 */
export async function loginAs(page: Page, email: string, password: string, name: string) {
  const token = await getToken(email, password, name);

  // Navigate to a page on the correct origin to set localStorage
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  // Inject the token and user data (with onboardingComplete = true)
  await page.evaluate((t) => {
    localStorage.setItem('cosmisk_token', t);
    try {
      const parts = t.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        payload.onboardingComplete = true;
        localStorage.setItem('cosmisk_user', JSON.stringify(payload));
      }
    } catch {}
  }, token);
}

/**
 * Navigate to an app route after auth is set up.
 */
export async function goTo(page: Page, route: string) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000); // Give Angular time to render + API calls
}

/**
 * Check that the sidebar renders with the expected links.
 */
export async function expectSidebar(page: Page) {
  await expect(page.locator('app-sidebar')).toBeVisible();
  await expect(page.locator('text=Dashboard')).toBeVisible();
}

/**
 * Take a labeled screenshot for the test report.
 */
export async function snap(page: Page, label: string) {
  await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true });
}
