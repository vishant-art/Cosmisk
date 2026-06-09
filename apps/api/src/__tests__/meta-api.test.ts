/**
 * Tests for meta-api.ts — Meta Graph API client.
 *
 * Tests MetaApiService.get() URL construction, error handling,
 * pagination via getAllPages(), token exchange, and MetaApiError class.
 * Mocks global fetch to intercept all HTTP calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock config
vi.mock('../config.js', () => ({
  config: {
    graphApiBase: 'https://graph.facebook.com/v22.0',
    metaAppId: 'test-app-id',
    metaAppSecret: 'test-app-secret',
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('MetaApiService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('get()', () => {
    it('constructs URL with access_token and additional params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: '123' }] }),
      });

      const { MetaApiService } = await import('../services/meta-api.js');
      const api = new MetaApiService('test-token-abc');
      await api.get('/me/adaccounts', { fields: 'name,id', limit: '10' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = new URL(mockFetch.mock.calls[0][0]);
      expect(calledUrl.pathname).toBe('/v22.0/me/adaccounts');
      expect(calledUrl.searchParams.get('access_token')).toBe('test-token-abc');
      expect(calledUrl.searchParams.get('fields')).toBe('name,id');
      expect(calledUrl.searchParams.get('limit')).toBe('10');
    });

    it('includes AbortSignal timeout in fetch options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { MetaApiService } = await import('../services/meta-api.js');
      const api = new MetaApiService('tok');
      await api.get('/me');

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.signal).toBeTruthy();
    });

    it('returns parsed JSON on success', async () => {
      const mockData = { name: 'Test Account', id: 'act_123' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const { MetaApiService } = await import('../services/meta-api.js');
      const api = new MetaApiService('tok');
      const result = await api.get('/act_123');

      expect(result).toEqual(mockData);
    });

    it('throws MetaApiError on non-OK response with error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: { message: 'Invalid parameter', code: 100 },
        }),
      });

      const { MetaApiService, MetaApiError } = await import('../services/meta-api.js');
      const api = new MetaApiService('bad-tok');

      await expect(api.get('/bad-path')).rejects.toThrow(MetaApiError);

      try {
        await api.get('/bad-path');
      } catch (e: any) {
        // The first call already threw, so reset and try again
      }

      // Re-mock for the assertion
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: { message: 'Invalid parameter', code: 100 },
        }),
      });

      try {
        await api.get('/bad-path');
      } catch (e: any) {
        expect(e).toBeInstanceOf(MetaApiError);
        expect(e.message).toBe('Invalid parameter');
        expect(e.status).toBe(400);
        expect(e.code).toBe(100);
      }
    });

    it('throws MetaApiError with fallback message when JSON parse fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      });

      const { MetaApiService, MetaApiError } = await import('../services/meta-api.js');
      const api = new MetaApiService('tok');

      try {
        await api.get('/failing');
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(MetaApiError);
        expect(e.message).toContain('Meta API error: 500');
        expect(e.status).toBe(500);
      }
    });

    it('returns empty object when successful response has invalid JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('bad json')),
      });

      const { MetaApiService } = await import('../services/meta-api.js');
      const api = new MetaApiService('tok');
      const result = await api.get('/empty');

      expect(result).toEqual({});
    });
  });

  describe('getAllPages()', () => {
    it('fetches a single page when no paging.next', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: '1' }, { id: '2' }],
          paging: {},
        }),
      });

      const { MetaApiService } = await import('../services/meta-api.js');
      const api = new MetaApiService('tok');
      const results = await api.getAllPages('/me/adaccounts');

      expect(results).toEqual([{ id: '1' }, { id: '2' }]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('follows pagination links up to maxPages', async () => {
      // Page 1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: '1' }],
          paging: { next: 'https://graph.facebook.com/v22.0/me/adaccounts?after=cursor1&access_token=tok' },
        }),
      });
      // Page 2
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: '2' }],
          paging: { next: 'https://graph.facebook.com/v22.0/me/adaccounts?after=cursor2&access_token=tok' },
        }),
      });
      // Page 3
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: '3' }],
          paging: {},
        }),
      });

      const { MetaApiService } = await import('../services/meta-api.js');
      const api = new MetaApiService('tok');
      const results = await api.getAllPages('/me/adaccounts');

      expect(results).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('respects maxPages limit', async () => {
      // Keep returning next pages indefinitely
      for (let i = 0; i < 5; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: [{ id: `${i}` }],
            paging: { next: `https://graph.facebook.com/v22.0/next?page=${i + 1}` },
          }),
        });
      }

      const { MetaApiService } = await import('../services/meta-api.js');
      const api = new MetaApiService('tok');
      const results = await api.getAllPages('/me/adaccounts', {}, 3);

      expect(results).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('throws MetaApiError if any page request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: '1' }],
          paging: { next: 'https://graph.facebook.com/v22.0/next' },
        }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { message: 'Token expired', code: 190 },
        }),
      });

      const { MetaApiService, MetaApiError } = await import('../services/meta-api.js');
      const api = new MetaApiService('expired-tok');

      try {
        await api.getAllPages('/me/adaccounts');
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(MetaApiError);
        expect(e.message).toBe('Token expired');
        expect(e.status).toBe(401);
        expect(e.code).toBe(190);
      }
    });

    it('handles empty data arrays gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [],
          paging: {},
        }),
      });

      const { MetaApiService } = await import('../services/meta-api.js');
      const api = new MetaApiService('tok');
      const results = await api.getAllPages('/me/adaccounts');

      expect(results).toEqual([]);
    });

    it('handles response without data field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paging: {} }),
      });

      const { MetaApiService } = await import('../services/meta-api.js');
      const api = new MetaApiService('tok');
      const results = await api.getAllPages('/me/adaccounts');

      expect(results).toEqual([]);
    });
  });

  describe('MetaApiError', () => {
    it('has correct name and properties', async () => {
      const { MetaApiError } = await import('../services/meta-api.js');
      const err = new MetaApiError('Test error', 403, 200);

      expect(err.name).toBe('MetaApiError');
      expect(err.message).toBe('Test error');
      expect(err.status).toBe(403);
      expect(err.code).toBe(200);
      expect(err instanceof Error).toBe(true);
    });

    it('works without optional code', async () => {
      const { MetaApiError } = await import('../services/meta-api.js');
      const err = new MetaApiError('No code', 500);

      expect(err.code).toBeUndefined();
      expect(err.status).toBe(500);
    });
  });

  describe('exchangeCodeForToken', () => {
    it('exchanges code for short-lived then long-lived token', async () => {
      // Short-lived token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'short-lived-token' }),
      });
      // Long-lived token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'long-lived-token-abc',
          expires_in: 5184000,
        }),
      });

      const { exchangeCodeForToken } = await import('../services/meta-api.js');
      const result = await exchangeCodeForToken('auth-code-123', 'https://cosmisk.ai/callback');

      expect(result.accessToken).toBe('long-lived-token-abc');
      expect(result.expiresIn).toBe(5184000);

      // Verify first call has correct params
      const firstUrl = new URL(mockFetch.mock.calls[0][0]);
      expect(firstUrl.searchParams.get('client_id')).toBe('test-app-id');
      expect(firstUrl.searchParams.get('client_secret')).toBe('test-app-secret');
      expect(firstUrl.searchParams.get('code')).toBe('auth-code-123');
      expect(firstUrl.searchParams.get('redirect_uri')).toBe('https://cosmisk.ai/callback');

      // Verify second call exchanges for long-lived
      const secondUrl = new URL(mockFetch.mock.calls[1][0]);
      expect(secondUrl.searchParams.get('grant_type')).toBe('fb_exchange_token');
      expect(secondUrl.searchParams.get('fb_exchange_token')).toBe('short-lived-token');
    });

    it('defaults expires_in to 60 days when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'short' }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'long' }),
      });

      const { exchangeCodeForToken } = await import('../services/meta-api.js');
      const result = await exchangeCodeForToken('code', 'https://example.com');

      expect(result.expiresIn).toBe(5184000);
    });

    it('throws on failed short-lived token exchange', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          error: { message: 'Invalid code' },
        }),
      });

      const { exchangeCodeForToken } = await import('../services/meta-api.js');

      await expect(
        exchangeCodeForToken('bad-code', 'https://example.com')
      ).rejects.toThrow('Invalid code');
    });

    it('throws on failed long-lived token exchange', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'short' }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          error: { message: 'Exchange failed' },
        }),
      });

      const { exchangeCodeForToken } = await import('../services/meta-api.js');

      await expect(
        exchangeCodeForToken('code', 'https://example.com')
      ).rejects.toThrow('Exchange failed');
    });
  });

  describe('getMetaUser', () => {
    it('returns user id and name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '123456', name: 'Test User' }),
      });

      const { getMetaUser } = await import('../services/meta-api.js');
      const user = await getMetaUser('test-token');

      expect(user.id).toBe('123456');
      expect(user.name).toBe('Test User');

      const calledUrl = new URL(mockFetch.mock.calls[0][0]);
      expect(calledUrl.pathname).toBe('/v22.0/me');
      expect(calledUrl.searchParams.get('fields')).toBe('name,id');
      expect(calledUrl.searchParams.get('access_token')).toBe('test-token');
    });

    it('throws on failed request', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      const { getMetaUser } = await import('../services/meta-api.js');

      await expect(getMetaUser('bad-token')).rejects.toThrow('Failed to fetch Meta user info');
    });
  });
});
