import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGoogleOAuthUrl, GoogleAdsApiService } from '../services/google-ads-api.js';

// Mock dependencies
vi.mock('../config.js', () => ({
  config: {
    googleAdsClientId: 'test-client-id',
    googleAdsClientSecret: 'test-client-secret',
    googleAdsRedirectUri: 'https://app.test/google/callback',
    googleAdsDeveloperToken: 'test-dev-token',
  },
}));

vi.mock('../db/index.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('./token-crypto.js', () => ({
  encryptToken: (t: string) => `enc_${t}`,
  decryptToken: (t: string) => t.replace('enc_', ''),
}));

// Mock safe-fetch
const mockSafeFetch = vi.fn();
const mockSafeJson = vi.fn();
const mockFetchJson = vi.fn();

vi.mock('../utils/safe-fetch.js', () => ({
  safeFetch: (...args: any[]) => mockSafeFetch(...args),
  safeJson: (...args: any[]) => mockSafeJson(...args),
  fetchJson: (...args: any[]) => mockFetchJson(...args),
  ExternalApiError: class ExternalApiError extends Error {
    service: string;
    statusCode: number | null;
    constructor(service: string, statusCode: number | null, message: string) {
      super(`[${service}] ${message}`);
      this.name = 'ExternalApiError';
      this.service = service;
      this.statusCode = statusCode;
    }
  },
}));

beforeEach(() => {
  mockSafeFetch.mockReset();
  mockSafeJson.mockReset();
  mockFetchJson.mockReset();
});

/* ------------------------------------------------------------------ */
/*  OAuth URL construction                                             */
/* ------------------------------------------------------------------ */

describe('getGoogleOAuthUrl', () => {
  it('should build OAuth URL with correct params', () => {
    const url = getGoogleOAuthUrl('my-state');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(parsed.searchParams.get('client_id')).toBe('test-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.test/google/callback');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/adwords');
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
    expect(parsed.searchParams.get('state')).toBe('my-state');
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleAdsApiService.query                                          */
/* ------------------------------------------------------------------ */

describe('GoogleAdsApiService.query', () => {
  it('should send GAQL query to correct endpoint', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '[]',
    });
    mockSafeJson.mockResolvedValueOnce([{ results: [{ campaign: { id: '1' } }] }]);

    const service = new GoogleAdsApiService('access-tok', '123-456-7890');
    const results = await service.query('SELECT campaign.id FROM campaign');

    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockSafeFetch.mock.calls[0];
    expect(url).toContain('customers/1234567890/googleAds:searchStream');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer access-tok');
    expect(opts.headers['developer-token']).toBe('test-dev-token');
    expect(JSON.parse(opts.body).query).toBe('SELECT campaign.id FROM campaign');
    expect(results).toEqual([{ campaign: { id: '1' } }]);
  });

  it('should strip dashes from customer ID', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });
    mockSafeJson.mockResolvedValueOnce([]);

    const service = new GoogleAdsApiService('tok', '111-222-3333');
    await service.query('SELECT campaign.id FROM campaign');

    const url = mockSafeFetch.mock.calls[0][0];
    expect(url).toContain('customers/1112223333/');
    expect(url).not.toContain('-');
  });

  it('should return empty array when response has no data', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });
    mockSafeJson.mockResolvedValueOnce(null);

    const service = new GoogleAdsApiService('tok', '123');
    const results = await service.query('SELECT campaign.id FROM campaign');
    expect(results).toEqual([]);
  });

  it('should flatten batched results', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });
    mockSafeJson.mockResolvedValueOnce([
      { results: [{ id: 'a' }, { id: 'b' }] },
      { results: [{ id: 'c' }] },
    ]);

    const service = new GoogleAdsApiService('tok', '123');
    const results = await service.query('SELECT campaign.id FROM campaign');
    expect(results).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('should throw ExternalApiError on non-ok response', async () => {
    mockSafeFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    const service = new GoogleAdsApiService('tok', '123');
    await expect(service.query('SELECT id FROM campaign')).rejects.toThrow('GAQL query failed');
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleAdsApiService.getAccountPerformance                          */
/* ------------------------------------------------------------------ */

describe('GoogleAdsApiService.getAccountPerformance', () => {
  it('should map metrics with micro conversion', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });
    mockSafeJson.mockResolvedValueOnce([{
      results: [{
        metrics: {
          costMicros: 50000000, // $50
          impressions: 1000,
          clicks: 100,
          ctr: 0.1,
          averageCpc: 500000, // $0.50
          conversions: 10,
          conversionsValue: 200,
          costPerConversion: 5000000,
        },
      }],
    }]);

    const service = new GoogleAdsApiService('tok', '123');
    const perf = await service.getAccountPerformance('LAST_7_DAYS');

    expect(perf).not.toBeNull();
    expect(perf.spend).toBe(50);
    expect(perf.impressions).toBe(1000);
    expect(perf.clicks).toBe(100);
    expect(perf.ctr).toBe(10); // 0.1 * 100
    expect(perf.cpc).toBe(0.5);
    expect(perf.conversions).toBe(10);
    expect(perf.revenue).toBe(200);
    expect(perf.roas).toBe(4); // 200 / 50
    expect(perf.cpa).toBe(5);  // 50 / 10
  });

  it('should return null when no results', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });
    mockSafeJson.mockResolvedValueOnce([{ results: [] }]);

    const service = new GoogleAdsApiService('tok', '123');
    const perf = await service.getAccountPerformance();
    expect(perf).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleAdsApiService.getCampaignPerformance                         */
/* ------------------------------------------------------------------ */

describe('GoogleAdsApiService.getCampaignPerformance', () => {
  it('should map campaign results to normalized shape', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });
    mockSafeJson.mockResolvedValueOnce([{
      results: [{
        campaign: { id: 'c1', name: 'My Campaign', status: 'ENABLED', advertisingChannelType: 'SEARCH' },
        metrics: {
          costMicros: 10000000,
          impressions: 500,
          clicks: 50,
          ctr: 0.1,
          conversions: 5,
          conversionsValue: 100,
          costPerConversion: 2000000,
        },
      }],
    }]);

    const service = new GoogleAdsApiService('tok', '123');
    const campaigns = await service.getCampaignPerformance();

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].id).toBe('c1');
    expect(campaigns[0].name).toBe('My Campaign');
    expect(campaigns[0].spend).toBe(10);
    expect(campaigns[0].channelType).toBe('SEARCH');
  });
});

/* ------------------------------------------------------------------ */
/*  GoogleAdsApiService.getAccessibleCustomers                         */
/* ------------------------------------------------------------------ */

describe('GoogleAdsApiService.getAccessibleCustomers', () => {
  it('should extract customer IDs from resource names', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });
    mockSafeJson.mockResolvedValueOnce({
      resourceNames: ['customers/111', 'customers/222'],
    });

    const service = new GoogleAdsApiService('tok', '123');
    const ids = await service.getAccessibleCustomers();
    expect(ids).toEqual(['111', '222']);
  });

  it('should return empty array when no data', async () => {
    mockSafeFetch.mockResolvedValueOnce({ ok: true });
    mockSafeJson.mockResolvedValueOnce(null);

    const service = new GoogleAdsApiService('tok', '123');
    const ids = await service.getAccessibleCustomers();
    expect(ids).toEqual([]);
  });
});
