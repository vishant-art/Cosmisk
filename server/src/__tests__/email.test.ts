import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendPasswordResetEmail, sendTeamInviteEmail } from '../services/email.js';

// Mock safe-fetch
const mockSafeFetch = vi.fn();

vi.mock('../utils/safe-fetch.js', () => ({
  safeFetch: (...args: any[]) => mockSafeFetch(...args),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Track config state so we can toggle resendApiKey
let mockConfig = {
  resendApiKey: 'test-resend-key',
  appUrl: 'https://app.cosmisk.ai',
  alertEmailFrom: 'alerts@cosmisk.ai',
};

vi.mock('../config.js', () => ({
  get config() { return mockConfig; },
}));

beforeEach(() => {
  mockSafeFetch.mockReset();
  mockConfig = {
    resendApiKey: 'test-resend-key',
    appUrl: 'https://app.cosmisk.ai',
    alertEmailFrom: 'alerts@cosmisk.ai',
  };
});

/* ------------------------------------------------------------------ */
/*  sendPasswordResetEmail                                             */
/* ------------------------------------------------------------------ */

describe('sendPasswordResetEmail', () => {
  it('should call Resend API with correct params', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });

    const result = await sendPasswordResetEmail('user@test.com', 'Alice', 'reset-tok-123');
    expect(result).toBe(true);

    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockSafeFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer test-resend-key');

    const body = JSON.parse(opts.body);
    expect(body.to).toEqual(['user@test.com']);
    expect(body.from).toBe('alerts@cosmisk.ai');
    expect(body.subject).toBe('Reset your Cosmisk password');
  });

  it('should include reset URL with token in HTML body', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });

    await sendPasswordResetEmail('user@test.com', 'Alice', 'my-token');

    const body = JSON.parse(mockSafeFetch.mock.calls[0][1].body);
    expect(body.html).toContain('https://app.cosmisk.ai/reset-password?token=my-token');
    expect(body.html).toContain('Alice');
  });

  it('should return false when RESEND_API_KEY is not set', async () => {
    mockConfig.resendApiKey = '';
    const result = await sendPasswordResetEmail('user@test.com', 'Alice', 'tok');
    expect(result).toBe(false);
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it('should return false on API failure', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => 'Validation error',
    });

    const result = await sendPasswordResetEmail('user@test.com', 'Alice', 'tok');
    expect(result).toBe(false);
  });

  it('should handle name being empty gracefully', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });

    await sendPasswordResetEmail('user@test.com', '', 'tok');

    const body = JSON.parse(mockSafeFetch.mock.calls[0][1].body);
    expect(body.html).toContain('there');
  });
});

/* ------------------------------------------------------------------ */
/*  sendTeamInviteEmail                                                */
/* ------------------------------------------------------------------ */

describe('sendTeamInviteEmail', () => {
  it('should call Resend API with invite-specific params', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });

    const result = await sendTeamInviteEmail('member@test.com', 'Bob', 'Alice', 'invite-tok-456');
    expect(result).toBe(true);

    const [url, opts] = mockSafeFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');

    const body = JSON.parse(opts.body);
    expect(body.to).toEqual(['member@test.com']);
    expect(body.subject).toBe('Alice invited you to Cosmisk');
  });

  it('should include accept URL with token', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });

    await sendTeamInviteEmail('member@test.com', 'Bob', 'Alice', 'invite-tok');

    const body = JSON.parse(mockSafeFetch.mock.calls[0][1].body);
    expect(body.html).toContain('https://app.cosmisk.ai/accept-invite?token=invite-tok');
    expect(body.html).toContain('Bob');
    expect(body.html).toContain('Alice');
  });

  it('should return false when RESEND_API_KEY is not set', async () => {
    mockConfig.resendApiKey = '';
    const result = await sendTeamInviteEmail('m@test.com', 'Bob', 'Alice', 'tok');
    expect(result).toBe(false);
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it('should return false on API failure', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server error',
    });

    const result = await sendTeamInviteEmail('m@test.com', 'Bob', 'Alice', 'tok');
    expect(result).toBe(false);
  });
});
