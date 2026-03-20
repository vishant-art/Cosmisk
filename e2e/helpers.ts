import { type Page, type Response, expect } from '@playwright/test';

export const BASE = 'https://localhost:4200';
export const API = 'http://localhost:3000';

// Test user (fresh per run)
export const TEST_EMAIL = `test_${Date.now()}@test.com`;
export const TEST_PASSWORD = 'TestPass123!';
export const TEST_NAME = 'Test User';

// Real user with connected Meta account
export const REAL_EMAIL = 'vishant@gmail.com';
export const REAL_PASSWORD = 'pratapsons';
export const REAL_NAME = 'Vishant Jain';
export const PRATAPSONS_ACCOUNT_ID = 'act_1738503939658460';

/**
 * Sign up or log in via API and return JWT token.
 */
async function getToken(email: string, password: string, name: string): Promise<string> {
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

  try {
    await fetch(`${API}/settings/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ onboarding_complete: true }),
    });
  } catch { /* non-critical */ }

  return token;
}

/**
 * Inject JWT into localStorage so the app recognizes the user.
 */
export async function loginAs(page: Page, email: string, password: string, name: string) {
  const token = await getToken(email, password, name);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
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
 * Login and navigate to a route in one call.
 */
export async function loginAndGo(page: Page, route: string) {
  await loginAs(page, TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
  await goTo(page, route);
}

/**
 * Login as the real user and set the ad account, then optionally navigate.
 */
export async function loginWithAccount(page: Page, route?: string) {
  await loginAs(page, REAL_EMAIL, REAL_PASSWORD, REAL_NAME);
  await page.evaluate((accId: string) => {
    localStorage.setItem('cosmisk_ad_account', accId);
  }, PRATAPSONS_ACCOUNT_ID);
  if (route) await goTo(page, route);
}

/**
 * Navigate to an app route. Waits for DOM content loaded.
 */
export async function goTo(page: Page, route: string) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
}

/**
 * Wait for an API response matching a URL pattern and assert 200 status.
 * Call BEFORE the navigation that triggers the request.
 */
export async function waitForApi(page: Page, urlPattern: string): Promise<Response> {
  const response = await page.waitForResponse(
    (resp) => resp.url().includes(urlPattern) && resp.status() === 200,
    { timeout: 15000 },
  );
  return response;
}

/**
 * Assert the page has no rendering errors (undefined, NaN, JS errors).
 */
export async function assertCleanPage(page: Page) {
  const body = await page.locator('body').textContent() ?? '';
  expect(body).not.toContain('undefined');
  expect(body).not.toContain('NaN');
  expect(body).not.toContain('[object Object]');
  expect(body).not.toContain('TypeError');
  expect(body).not.toContain('Cannot read');
}

/**
 * Parse an API response JSON and assert success: true.
 */
export async function assertApiSuccess(response: Response) {
  const json = await response.json();
  expect(json.success).toBe(true);
}

/**
 * Take a labeled screenshot.
 */
export async function snap(page: Page, label: string) {
  await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true });
}
