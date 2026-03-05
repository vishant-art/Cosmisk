import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { encryptToken, decryptToken } from './token-crypto.js';
import { safeFetch, safeJson, ExternalApiError } from '../utils/safe-fetch.js';

/* ------------------------------------------------------------------ */
/*  Google Ads OAuth2                                                  */
/* ------------------------------------------------------------------ */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ADS_API_URL = 'https://googleads.googleapis.com/v18';

export function getGoogleOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleAdsClientId,
    redirect_uri: config.googleAdsRedirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await safeFetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleAdsClientId,
      client_secret: config.googleAdsClientSecret,
      redirect_uri: config.googleAdsRedirectUri,
      grant_type: 'authorization_code',
    }),
    service: 'Google OAuth',
  });

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new ExternalApiError('Google OAuth', response.status, `Token exchange failed: ${error}`);
  }

  const data = await safeJson(response);
  if (!data) throw new ExternalApiError('Google OAuth', response.status, 'Invalid JSON in token response');

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

export async function refreshGoogleToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await safeFetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.googleAdsClientId,
      client_secret: config.googleAdsClientSecret,
      grant_type: 'refresh_token',
    }),
    service: 'Google OAuth',
  });

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new ExternalApiError('Google OAuth', response.status, `Token refresh failed: ${error}`);
  }

  const data = await safeJson(response);
  if (!data) throw new ExternalApiError('Google OAuth', response.status, 'Invalid JSON in refresh response');

  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/* ------------------------------------------------------------------ */
/*  Google Ads API Service                                             */
/* ------------------------------------------------------------------ */

export class GoogleAdsApiService {
  private accessToken: string;
  private customerId: string;

  constructor(accessToken: string, customerId: string) {
    this.accessToken = accessToken;
    this.customerId = customerId.replace(/-/g, '');
  }

  async query(gaql: string): Promise<any[]> {
    const url = `${GOOGLE_ADS_API_URL}/customers/${this.customerId}/googleAds:searchStream`;

    const response = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'developer-token': config.googleAdsDeveloperToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: gaql }),
      service: 'Google Ads',
      timeoutMs: 60_000,
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new ExternalApiError('Google Ads', response.status, `GAQL query failed: ${error}`);
    }

    const data = await safeJson(response);
    if (!data || !Array.isArray(data)) return [];

    return data.flatMap((batch: any) => batch.results || []);
  }

  async getAccountPerformance(dateRange: string = 'LAST_7_DAYS'): Promise<any> {
    const results = await this.query(`
      SELECT
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions,
        metrics.conversions_value,
        metrics.cost_per_conversion
      FROM customer
      WHERE segments.date DURING ${dateRange}
    `);

    if (results.length === 0) return null;

    const metrics = results[0].metrics || {};
    return {
      spend: (metrics.costMicros || 0) / 1000000,
      impressions: metrics.impressions || 0,
      clicks: metrics.clicks || 0,
      ctr: (metrics.ctr || 0) * 100,
      cpc: (metrics.averageCpc || 0) / 1000000,
      conversions: metrics.conversions || 0,
      revenue: metrics.conversionsValue || 0,
      roas: metrics.costMicros > 0 ? (metrics.conversionsValue || 0) / (metrics.costMicros / 1000000) : 0,
      cpa: metrics.conversions > 0 ? (metrics.costMicros / 1000000) / metrics.conversions : 0,
    };
  }

  async getCampaignPerformance(dateRange: string = 'LAST_7_DAYS'): Promise<any[]> {
    const results = await this.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.conversions,
        metrics.conversions_value,
        metrics.cost_per_conversion
      FROM campaign
      WHERE segments.date DURING ${dateRange}
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 50
    `);

    return results.map((r: any) => ({
      id: r.campaign?.id,
      name: r.campaign?.name || 'Unknown',
      status: r.campaign?.status,
      channelType: r.campaign?.advertisingChannelType,
      spend: (r.metrics?.costMicros || 0) / 1000000,
      impressions: r.metrics?.impressions || 0,
      clicks: r.metrics?.clicks || 0,
      ctr: (r.metrics?.ctr || 0) * 100,
      conversions: r.metrics?.conversions || 0,
      revenue: r.metrics?.conversionsValue || 0,
      roas: r.metrics?.costMicros > 0 ? (r.metrics?.conversionsValue || 0) / (r.metrics.costMicros / 1000000) : 0,
      cpa: r.metrics?.conversions > 0 ? (r.metrics.costMicros / 1000000) / r.metrics.conversions : 0,
    }));
  }

  async getAccessibleCustomers(): Promise<string[]> {
    const url = `${GOOGLE_ADS_API_URL}/customers:listAccessibleCustomers`;

    const response = await safeFetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'developer-token': config.googleAdsDeveloperToken,
      },
      service: 'Google Ads',
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new ExternalApiError('Google Ads', response.status, `Failed to list customers: ${error}`);
    }

    const data = await safeJson(response);
    if (!data) return [];

    return (data.resourceNames || []).map((name: string) => name.replace('customers/', ''));
  }
}

/* ------------------------------------------------------------------ */
/*  DB helpers for Google tokens                                       */
/* ------------------------------------------------------------------ */

export function saveGoogleToken(userId: string, accessToken: string, refreshToken: string, expiresAt: string, customerIds: string[]): void {
  const db = getDb();
  // Ensure google_tokens table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_tokens (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted_access_token TEXT NOT NULL,
      encrypted_refresh_token TEXT NOT NULL,
      customer_ids TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.prepare(`
    INSERT INTO google_tokens (user_id, encrypted_access_token, encrypted_refresh_token, customer_ids, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      encrypted_access_token = excluded.encrypted_access_token,
      encrypted_refresh_token = excluded.encrypted_refresh_token,
      customer_ids = excluded.customer_ids,
      expires_at = excluded.expires_at,
      created_at = datetime('now')
  `).run(userId, encryptToken(accessToken), encryptToken(refreshToken), JSON.stringify(customerIds), expiresAt);
}

export function getGoogleToken(userId: string): { accessToken: string; refreshToken: string; customerIds: string[]; expiresAt: string | null } | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM google_tokens WHERE user_id = ?').get(userId) as any;
  if (!row) return null;

  return {
    accessToken: decryptToken(row.encrypted_access_token),
    refreshToken: decryptToken(row.encrypted_refresh_token),
    customerIds: row.customer_ids ? JSON.parse(row.customer_ids) : [],
    expiresAt: row.expires_at,
  };
}
