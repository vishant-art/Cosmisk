import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetaApiService, MetaApiError, exchangeCodeForToken, getMetaUser } from '../services/meta-api.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock config
vi.mock('../config.js', () => ({
  config: {
    graphApiBase: 'https://graph.facebook.com/v22.0',
    metaAppId: 'test-app-id',
    metaAppSecret: 'test-app-secret',
  },
}));

beforeEach(() => {
  mockFetch.mockReset();
});

/* ------------------------------------------------------------------ */
/*  MetaApiService.get                                                 */
/* ------------------------------------------------------------------ */

describe('MetaApiService.get', () => {
  it('should construct correct URL with access token and params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123', name: 'Test' }),
    });

    const service = new MetaApiService('test-token');
    await service.get('/me', { fields: 'id,name' });

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.pathname).toBe('/v22.0/me');
    expect(calledUrl.searchParams.get('access_token')).toBe('test-token');
    expect(calledUrl.searchParams.get('fields')).toBe('id,name');
  });

  it('should return parsed JSON on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123', name: 'Page' }),
    });

    const service = new MetaApiService('tok');
    const result = await service.get('/me');
    expect(result).toEqual({ id: '123', name: 'Page' });
  });

  it('should throw MetaApiError on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid token', code: 190 } }),
    });

    const service = new MetaApiService('bad-token');
    await expect(service.get('/me')).rejects.toThrow(MetaApiError);

    try {
      await service.get('/me');
    } catch (err: any) {
      // second call also mocked
    }
  });

  it('should include status and code in MetaApiError', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Token expired', code: 190 } }),
    });

    const service = new MetaApiService('expired');
    try {
      await service.get('/me');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MetaApiError);
      const e = err as MetaApiError;
      expect(e.status).toBe(401);
      expect(e.code).toBe(190);
      expect(e.message).toBe('Token expired');
    }
  });

  it('should handle malformed JSON error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    const service = new MetaApiService('tok');
    try {
      await service.get('/me');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MetaApiError);
      expect((err as MetaApiError).status).toBe(500);
    }
  });

  it('should handle rate limit (429) as MetaApiError', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit exceeded', code: 32 } }),
    });

    const service = new MetaApiService('tok');
    try {
      await service.get('/me');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MetaApiError);
      const e = err as MetaApiError;
      expect(e.status).toBe(429);
      expect(e.code).toBe(32);
      expect(e.message).toContain('Rate limit');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  MetaApiService.getAllPages                                          */
/* ------------------------------------------------------------------ */

describe('MetaApiService.getAllPages', () => {
  it('should collect data across multiple pages', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: '1' }, { id: '2' }],
          paging: { next: 'https://graph.facebook.com/v22.0/page2' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: '3' }],
          paging: {},
        }),
      });

    const service = new MetaApiService('tok');
    const results = await service.getAllPages('/ads');
    expect(results).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should respect maxPages limit', async () => {
    // Return pages that always have a next link
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'x' }],
        paging: { next: 'https://graph.facebook.com/v22.0/next' },
      }),
    });

    const service = new MetaApiService('tok');
    const results = await service.getAllPages('/ads', {}, 3);
    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should stop when no paging.next is present', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: '1' }] }),
    });

    const service = new MetaApiService('tok');
    const results = await service.getAllPages('/ads');
    expect(results).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw MetaApiError if any page fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: '1' }],
          paging: { next: 'https://graph.facebook.com/v22.0/page2' },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Server error' } }),
      });

    const service = new MetaApiService('tok');
    await expect(service.getAllPages('/ads')).rejects.toThrow(MetaApiError);
  });

  it('should return empty array when data is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const service = new MetaApiService('tok');
    const results = await service.getAllPages('/ads');
    expect(results).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  exchangeCodeForToken                                               */
/* ------------------------------------------------------------------ */

describe('exchangeCodeForToken', () => {
  it('should exchange code for short-lived then long-lived token', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'short-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'long-token', expires_in: 5184000 }),
      });

    const result = await exchangeCodeForToken('auth-code', 'https://app.test/callback');
    expect(result.accessToken).toBe('long-token');
    expect(result.expiresIn).toBe(5184000);

    // Verify first call has code param
    const firstUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(firstUrl.searchParams.get('code')).toBe('auth-code');
    expect(firstUrl.searchParams.get('redirect_uri')).toBe('https://app.test/callback');

    // Verify second call exchanges for long-lived
    const secondUrl = new URL(mockFetch.mock.calls[1][0]);
    expect(secondUrl.searchParams.get('grant_type')).toBe('fb_exchange_token');
    expect(secondUrl.searchParams.get('fb_exchange_token')).toBe('short-token');
  });

  it('should throw on failed code exchange', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Invalid code' } }),
    });

    await expect(exchangeCodeForToken('bad', 'https://app.test/cb')).rejects.toThrow('Invalid code');
  });

  it('should throw on failed long-lived exchange', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'short' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Exchange failed' } }),
      });

    await expect(exchangeCodeForToken('code', 'https://test/cb')).rejects.toThrow('Exchange failed');
  });

  it('should default expiresIn to 5184000 when not returned', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'short' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'long' }),
      });

    const result = await exchangeCodeForToken('code', 'https://test/cb');
    expect(result.expiresIn).toBe(5184000);
  });
});

/* ------------------------------------------------------------------ */
/*  getMetaUser                                                        */
/* ------------------------------------------------------------------ */

describe('getMetaUser', () => {
  it('should fetch user info with correct fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '12345', name: 'Test User' }),
    });

    const user = await getMetaUser('my-token');
    expect(user.id).toBe('12345');
    expect(user.name).toBe('Test User');

    const calledUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('fields')).toBe('name,id');
    expect(calledUrl.searchParams.get('access_token')).toBe('my-token');
  });

  it('should throw on failed request', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(getMetaUser('bad-token')).rejects.toThrow('Failed to fetch Meta user info');
  });
});
