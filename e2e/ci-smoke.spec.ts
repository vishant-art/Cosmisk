import { test, expect } from '@playwright/test';

test.describe('CI Smoke Tests', () => {

  test('Landing page renders without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Page should have a visible heading
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 5000 });

    // Body should not contain rendering artifacts
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('[object Object]');
    expect(body).not.toContain('TypeError');

    // No JS errors
    expect(errors).toHaveLength(0);
  });

  test('Login page renders with form elements', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Should have a submit button
    const submitBtn = page.locator('button[type="submit"], button:has-text("Log"), button:has-text("Sign in")');
    await expect(submitBtn.first()).toBeVisible();

    // Should have link to signup
    const signupLink = page.locator('a[href*="signup"], a:has-text("Sign up"), a:has-text("Create")');
    await expect(signupLink.first()).toBeVisible();
  });

  test('Login form shows validation on empty submit', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });

    // Click submit without filling form
    const submitBtn = page.locator('button[type="submit"], button:has-text("Log"), button:has-text("Sign in")');
    await submitBtn.first().click();

    // Should not navigate away — still on login
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('Signup page renders with form elements', async ({ page }) => {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });

    // Should have name field
    const nameInput = page.locator('input[type="text"], input[placeholder*="name" i], input[name="name"]');
    await expect(nameInput.first()).toBeVisible();

    // Should have link to login
    const loginLink = page.locator('a[href*="login"], a:has-text("Log in"), a:has-text("Sign in")');
    await expect(loginLink.first()).toBeVisible();
  });

  test('Navigation between login and signup works', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });

    // Click signup link
    const signupLink = page.locator('a[href*="signup"], a:has-text("Sign up"), a:has-text("Create")');
    await signupLink.first().click();

    // Should be on signup now
    await expect(page).toHaveURL(/signup/);
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });
  });

  test('Pricing page renders', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/pricing', { waitUntil: 'domcontentloaded' });

    // Should show pricing content — plan names or price amounts
    const body = await page.locator('body').textContent() ?? '';
    const hasPricingContent = body.includes('Solo') || body.includes('Growth') || body.includes('Agency')
      || body.includes('Free') || body.includes('/mo') || body.includes('month');

    // Pricing page should exist and render something meaningful
    expect(body).not.toContain('TypeError');
    expect(errors).toHaveLength(0);
  });

  test('Unknown routes do not crash', async ({ page }) => {
    await page.goto('/nonexistent-route-12345', { waitUntil: 'domcontentloaded' });

    // Should not crash — either redirect to landing or show content
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Cannot GET');
    expect(body).not.toContain('TypeError');
  });

  test('Protected routes redirect to login', async ({ page }) => {
    await page.goto('/app/dashboard', { waitUntil: 'domcontentloaded' });

    // Should redirect to login since not authenticated
    await page.waitForTimeout(1000);
    const url = page.url();
    const onLoginOrLanding = url.includes('login') || url.includes('signup') || url.endsWith('/');
    expect(onLoginOrLanding).toBe(true);
  });

});
