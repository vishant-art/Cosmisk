/**
 * Google Ads Ingestion - Fetches data from Google Ads API for audit
 */

import { GoogleAdsApiService, getGoogleToken, refreshGoogleToken } from '../services/google-ads-api.js';
import type { GoogleAdsSnapshot, CampaignPerformance, AdPerformance, AuditConfig } from './types.js';

interface GoogleAdsIngestionOptions {
  customerId: string;
  userId: string; // To get token
  datePreset: AuditConfig['datePreset'];
}

/**
 * Map audit date preset to Google Ads date range
 */
function mapDatePreset(preset: AuditConfig['datePreset']): string {
  const map: Record<string, string> = {
    'last_7d': 'LAST_7_DAYS',
    'last_14d': 'LAST_14_DAYS',
    'last_30d': 'LAST_30_DAYS',
    'last_90d': 'LAST_90_DAYS',
    'maximum': 'ALL_TIME',
  };
  return map[preset] || 'LAST_30_DAYS';
}

/**
 * Fetch complete Google Ads snapshot for audit
 */
export async function fetchGoogleAdsSnapshot(options: GoogleAdsIngestionOptions): Promise<GoogleAdsSnapshot> {
  const { customerId, userId, datePreset } = options;
  const dateRange = getDateRange(datePreset);
  const googleDateRange = mapDatePreset(datePreset);

  // Get and refresh token if needed
  const tokenData = getGoogleToken(userId);
  if (!tokenData) {
    throw new Error('No Google Ads token found for user');
  }

  let accessToken = tokenData.accessToken;

  // Check if token is expired and refresh
  if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
    const refreshed = await refreshGoogleToken(tokenData.refreshToken);
    accessToken = refreshed.accessToken;
  }

  const service = new GoogleAdsApiService(accessToken, customerId);

  // Fetch data
  const [accountData, campaignData, adData] = await Promise.all([
    service.getAccountPerformance(googleDateRange),
    service.getCampaignPerformance(googleDateRange),
    fetchTopAds(service, googleDateRange),
  ]);

  return {
    capturedAt: new Date().toISOString(),
    dateRange,
    customerId,
    totalSpend: accountData?.spend || 0,
    totalConversions: accountData?.conversions || 0,
    totalRevenue: accountData?.revenue || 0,
    overallRoas: accountData?.roas || 0,
    overallCpa: accountData?.cpa || 0,
    campaigns: campaignData.map((c: any): CampaignPerformance => ({
      campaignId: c.id,
      campaignName: c.name,
      status: c.status,
      channelType: c.channelType,
      spend: c.spend,
      impressions: c.impressions,
      clicks: c.clicks,
      conversions: c.conversions,
      revenue: c.revenue,
      ctr: c.ctr,
      cpa: c.cpa,
      roas: c.roas,
    })),
    topAds: adData,
  };
}

/**
 * Fetch top performing ads
 */
async function fetchTopAds(service: GoogleAdsApiService, dateRange: string): Promise<AdPerformance[]> {
  try {
    const results = await service.query(`
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        campaign.name,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.ctr
      FROM ad_group_ad
      WHERE segments.date DURING ${dateRange}
        AND ad_group_ad.status = 'ENABLED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 20
    `);

    return results.map((r: any): AdPerformance => {
      const spend = (r.metrics?.costMicros || 0) / 1000000;
      const conversions = r.metrics?.conversions || 0;

      return {
        adId: r.adGroupAd?.ad?.id || 'unknown',
        adName: r.adGroupAd?.ad?.name || 'Unknown Ad',
        campaignName: r.campaign?.name || 'Unknown Campaign',
        spend,
        impressions: r.metrics?.impressions || 0,
        clicks: r.metrics?.clicks || 0,
        conversions,
        ctr: (r.metrics?.ctr || 0) * 100,
        cpa: conversions > 0 ? spend / conversions : 0,
      };
    });
  } catch (error) {
    console.error('Failed to fetch top ads:', error);
    return [];
  }
}

/**
 * Get date range from preset
 */
function getDateRange(datePreset: string): { start: string; end: string } {
  const end = new Date();
  let start = new Date();

  switch (datePreset) {
    case 'last_7d':
      start.setDate(end.getDate() - 7);
      break;
    case 'last_14d':
      start.setDate(end.getDate() - 14);
      break;
    case 'last_30d':
      start.setDate(end.getDate() - 30);
      break;
    case 'last_90d':
      start.setDate(end.getDate() - 90);
      break;
    case 'maximum':
      start.setFullYear(end.getFullYear() - 1);
      break;
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}
