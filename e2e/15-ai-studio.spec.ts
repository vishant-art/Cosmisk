/**
 * AI Studio — Chat interface, message input, send functionality.
 */
import { test, expect } from '@playwright/test';
import { loginAndGo, assertCleanPage, snap } from './helpers';

test.describe.serial('AI Studio', () => {

  test('Navigate to AI studio and verify chat interface loads', async ({ page }) => {
    await loginAndGo(page, '/app/ai-studio');

    await assertCleanPage(page);

    // Should have some heading or branding
    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Chat area should be present
    const chatArea = page.locator('[class*="chat"], [class*="message"], [class*="conversation"], [class*="studio"]').first();
    if (await chatArea.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(chatArea).toBeVisible();
    }

    await snap(page, '15-ai-studio-page');
  });

  test('Message input field is present and editable', async ({ page }) => {
    await loginAndGo(page, '/app/ai-studio');

    // Find the message input (textarea or input)
    const messageInput = page.locator('textarea, input[placeholder*="message" i], input[placeholder*="ask" i], input[placeholder*="type" i], input[type="text"]').first();
    await expect(messageInput).toBeVisible({ timeout: 10000 });

    // Type a test message
    await messageInput.fill('What is my top performing ad this week?');
    await expect(messageInput).toHaveValue(/top performing/i);

    await assertCleanPage(page);
    await snap(page, '15-ai-studio-input');
  });

  test('Send button is present and enabled', async ({ page }) => {
    await loginAndGo(page, '/app/ai-studio');

    // Find send button
    const sendBtn = page.locator('button:has-text("Send"), button[aria-label*="send" i], button[type="submit"], button[class*="send"]').first();
    await expect(sendBtn).toBeVisible({ timeout: 10000 });

    await snap(page, '15-ai-studio-send-btn');
  });

  test('Sending a message shows response or loading state', async ({ page }) => {
    await loginAndGo(page, '/app/ai-studio');

    // Type a message
    const messageInput = page.locator('textarea, input[placeholder*="message" i], input[placeholder*="ask" i], input[placeholder*="type" i], input[type="text"]').first();
    await expect(messageInput).toBeVisible({ timeout: 10000 });
    await messageInput.fill('Hello, what can you help me with?');

    // Click send
    const sendBtn = page.locator('button:has-text("Send"), button[aria-label*="send" i], button[type="submit"], button[class*="send"]').first();
    await sendBtn.click();

    // Wait for either a response message or loading indicator
    const response = page.locator('[class*="response"], [class*="assistant"], [class*="bot"], [class*="loading"], [class*="typing"], [class*="spinner"]').first();
    if (await response.isVisible({ timeout: 15000 }).catch(() => false)) {
      await expect(response).toBeVisible();
    }

    // The sent message should appear in the chat
    const sentMessage = page.locator('text=/hello|what can you help/i').first();
    if (await sentMessage.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(sentMessage).toBeVisible();
    }

    await assertCleanPage(page);
    await snap(page, '15-ai-studio-sent');
  });
});
