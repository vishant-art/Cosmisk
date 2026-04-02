import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyAlert, type Alert } from '../services/notifications.js';

// Mock safe-fetch
const mockSafeFetch = vi.fn();

vi.mock('../utils/safe-fetch.js', () => ({
  safeFetch: (...args: any[]) => mockSafeFetch(...args),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock DB
const mockDbGet = vi.fn();
vi.mock('../db/index.js', () => ({
  getDb: () => ({
    prepare: () => ({ get: mockDbGet }),
  }),
}));

let mockConfig = {
  resendApiKey: 'test-resend-key',
  alertEmailFrom: 'alerts@cosmisk.ai',
  slackWebhookUrl: '',
};

vi.mock('../config.js', () => ({
  get config() { return mockConfig; },
}));

beforeEach(() => {
  mockSafeFetch.mockReset();
  mockDbGet.mockReset();
  mockConfig = {
    resendApiKey: 'test-resend-key',
    alertEmailFrom: 'alerts@cosmisk.ai',
    slackWebhookUrl: '',
  };
});

const baseAlert: Alert = {
  type: 'spend_spike',
  title: 'Spending spike detected',
  content: 'Your spend is 2x higher than usual.',
  severity: 'warning',
  accountId: 'act_123',
};

/* ------------------------------------------------------------------ */
/*  Channel routing                                                    */
/* ------------------------------------------------------------------ */

describe('notifyAlert', () => {
  it('should skip if user not found', async () => {
    mockDbGet.mockReturnValueOnce(undefined);

    await notifyAlert('unknown-user', baseAlert);
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it('should send email for critical alert (default behavior)', async () => {
    mockDbGet.mockReturnValueOnce({
      email: 'user@test.com',
      notification_preferences: null,
    });
    mockSafeFetch.mockResolvedValueOnce({ ok: true });

    await notifyAlert('user-1', { ...baseAlert, severity: 'critical' });

    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockSafeFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');

    const body = JSON.parse(opts.body);
    expect(body.to).toEqual(['user@test.com']);
    expect(body.subject).toContain('CRITICAL');
    expect(body.subject).toContain('Spending spike detected');
  });

  it('should not send email for non-critical alert when email_alerts not set', async () => {
    mockDbGet.mockReturnValueOnce({
      email: 'user@test.com',
      notification_preferences: null,
    });

    await notifyAlert('user-1', baseAlert); // severity: warning

    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it('should send email for warning when email_alerts is enabled', async () => {
    mockDbGet.mockReturnValueOnce({
      email: 'user@test.com',
      notification_preferences: JSON.stringify({ email_alerts: true }),
    });
    mockSafeFetch.mockResolvedValueOnce({ ok: true });

    await notifyAlert('user-1', baseAlert);

    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockSafeFetch.mock.calls[0][1].body);
    expect(body.subject).toContain('WARNING');
  });

  it('should send to Slack when user has slack_webhook', async () => {
    mockDbGet.mockReturnValueOnce({
      email: 'user@test.com',
      notification_preferences: JSON.stringify({
        slack_webhook: 'https://hooks.slack.com/test',
      }),
    });
    mockSafeFetch.mockResolvedValueOnce({ ok: true });

    await notifyAlert('user-1', baseAlert);

    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockSafeFetch.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/test');

    const body = JSON.parse(opts.body);
    expect(body.text).toContain('Spending spike detected');
    expect(body.blocks).toBeDefined();
    expect(body.blocks[0].text.text).toContain('Spending spike detected');
  });

  it('should use global Slack webhook when user has none', async () => {
    mockConfig.slackWebhookUrl = 'https://hooks.slack.com/global';
    mockDbGet.mockReturnValueOnce({
      email: 'user@test.com',
      notification_preferences: JSON.stringify({}),
    });
    mockSafeFetch.mockResolvedValueOnce({ ok: true });

    await notifyAlert('user-1', baseAlert);

    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
    expect(mockSafeFetch.mock.calls[0][0]).toBe('https://hooks.slack.com/global');
  });

  it('should send to both Slack and email when both configured', async () => {
    mockDbGet.mockReturnValueOnce({
      email: 'user@test.com',
      notification_preferences: JSON.stringify({
        slack_webhook: 'https://hooks.slack.com/test',
        email_alerts: true,
      }),
    });
    mockSafeFetch.mockResolvedValue({ ok: true });

    await notifyAlert('user-1', baseAlert);

    expect(mockSafeFetch).toHaveBeenCalledTimes(2);
    const urls = mockSafeFetch.mock.calls.map((c: any[]) => c[0]);
    expect(urls).toContain('https://hooks.slack.com/test');
    expect(urls).toContain('https://api.resend.com/emails');
  });

  it('should filter by alert_types preference', async () => {
    mockDbGet.mockReturnValueOnce({
      email: 'user@test.com',
      notification_preferences: JSON.stringify({
        email_alerts: true,
        alert_types: ['budget_alert'], // spend_spike not in the list
      }),
    });

    await notifyAlert('user-1', baseAlert);

    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it('should send when alert type matches filter', async () => {
    mockDbGet.mockReturnValueOnce({
      email: 'user@test.com',
      notification_preferences: JSON.stringify({
        email_alerts: true,
        alert_types: ['spend_spike'],
      }),
    });
    mockSafeFetch.mockResolvedValueOnce({ ok: true });

    await notifyAlert('user-1', baseAlert);

    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
  });

  it('should handle malformed notification_preferences JSON', async () => {
    mockDbGet.mockReturnValueOnce({
      email: 'user@test.com',
      notification_preferences: 'not-json',
    });

    // Should not throw, uses defaults
    await notifyAlert('user-1', { ...baseAlert, severity: 'critical' });

    // Critical alert with no prefs -> email should be sent
    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
  });
});
