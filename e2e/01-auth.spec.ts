import { test, expect } from '@playwright/test';
import { BASE, API, snap } from './helpers';

const SIGNUP_EMAIL = `signup_${Date.now()}@test.com`;
const SIGNUP_PASSWORD = 'TestPass123!';
const SIGNUP_NAME = 'Auth Test User';

test.describe('Authentication', () => {

  test('Landing page renders with CTA', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('h1').first()).toBeVisible();
    const cta = page.locator('a:has-text("Get Started"), a:has-text("Start Free"), button:has-text("Get Started"), button:has-text("Start Free")').first();
    await expect(cta).toBeVisible();

    await snap(page, '01-landing');
  });

  test('Signup creates account and redirects', async ({ page }) => {
    await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });

    await page.locator('input[type="text"], input[placeholder*="name" i]').first().fill(SIGNUP_NAME);
    await page.locator('input[type="email"]').fill(SIGNUP_EMAIL);
    await page.locator('input[type="password"]').fill(SIGNUP_PASSWORD);
    await page.locator('input[type="checkbox"]').first().check();

    const apiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/auth/signup') && resp.request().method() === 'POST',
      { timeout: 10000 },
    );
    await page.locator('button[type="submit"], button:has-text("Sign Up"), button:has-text("Create Account")').first().click();
    const response = await apiPromise;

    expect(response.status()).toBe(200);
    await page.waitForURL(/\/(onboarding|app)/, { timeout: 10000 });

    await snap(page, '01-signup');
  });

  test('Login with valid credentials lands on /app', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });

    await page.locator('input[type="email"]').fill(SIGNUP_EMAIL);
    await page.locator('input[type="password"]').fill(SIGNUP_PASSWORD);

    const apiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/auth/login') && resp.request().method() === 'POST',
      { timeout: 10000 },
    );
    await page.locator('button[type="submit"], button:has-text("Log In"), button:has-text("Sign In")').first().click();
    const response = await apiPromise;

    expect(response.status()).toBe(200);
    await page.waitForURL(/\/(app|onboarding)/, { timeout: 10000 });

    await snap(page, '01-login');
  });

  test('Wrong password shows error, stays on login', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });

    await page.locator('input[type="email"]').fill(SIGNUP_EMAIL);
    await page.locator('input[type="password"]').fill('WrongPassword999!');

    await page.locator('button[type="submit"], button:has-text("Log In"), button:has-text("Sign In")').first().click();
    await page.waitForTimeout(2000);

    expect(page.url()).toContain('/login');
    const body = await page.locator('body').textContent() ?? '';
    expect(body.toLowerCase()).toMatch(/invalid|incorrect|wrong|error|failed/);

    await snap(page, '01-wrong-password');
  });
});
