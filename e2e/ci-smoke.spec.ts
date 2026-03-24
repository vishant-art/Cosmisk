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

  test('Login page renders', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('Signup page renders', async ({ page }) => {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });
  });

  test('Unknown routes redirect to landing or 404', async ({ page }) => {
    await page.goto('/nonexistent-route-12345', { waitUntil: 'domcontentloaded' });

    // Should not crash — either redirect to landing or show content
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Cannot GET');
    expect(body).not.toContain('TypeError');
  });

});
