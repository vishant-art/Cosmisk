/**
 * Meta Ads Ingestion - Fetches data from Meta Marketing API
 */

import type { MetaSnapshot, CreativePerformance, AuditConfig } from './types.js';

const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

interface MetaIngestionOptions {
  adAccountId: string;
  accessToken: string;
  datePreset: AuditConfig['datePreset'];
}

/**
 * Fetch complete Meta Ads snapshot for audit
 */
export async function fetchMetaSnapshot(options: MetaIngestionOptions): Promise<MetaSnapshot> {
  const { adAccountId, accessToken, datePreset } = options;
  const dateRange = getDateRange(datePreset);

  // Fetch in parallel
  const [accountData, creativeData, pixelData, audienceData] = await Promise.all([
    fetchAccountInsights(adAccountId, accessToken, datePreset),
    fetchCreativePerformance(adAccountId, accessToken, datePreset),
    fetchPixelHealth(adAccountId, accessToken),
    fetchAudienceCount(adAccountId, accessToken),
  ]);

  return {
    capturedAt: new Date().toISOString(),
    dateRange,
    adAccountId,
    totalSpend: accountData.spend,
    totalPurchases: accountData.purchases,
    totalRevenue: accountData.revenue,
    overallRoas: accountData.roas,
    overallCpa: accountData.cpa,
    creatives: creativeData,
    pixelHealth: pixelData,
    customAudienceCount: audienceData.custom,
    lookalikeCount: audienceData.lookalike,
  };
}

/**
 * Fetch account-level insights
 */
async function fetchAccountInsights(
  adAccountId: string,
  accessToken: string,
  datePreset: string
): Promise<{ spend: number; purchases: number; revenue: number; roas: number; cpa: number }> {
  const url = `${BASE_URL}/${adAccountId}/insights?` +
    `fields=spend,actions,action_values,purchase_roas&` +
    `date_preset=${datePreset}&` +
    `access_token=${accessToken}`;

  const resp = await fetch(url);
  const data = await resp.json();

  if (data.error) {
    throw new Error(`Meta API Error: ${data.error.message}`);
  }

  const insights = data.data?.[0] || {};
  const spend = parseFloat(insights.spend || '0');
  const purchases = extractAction(insights.actions, 'purchase');
  const revenue = extractActionValue(insights.action_values, 'purchase');
  const roas = insights.purchase_roas?.[0]?.value ? parseFloat(insights.purchase_roas[0].value) : 0;
  const cpa = purchases > 0 ? spend / purchases : 0;

  return { spend, purchases, revenue, roas, cpa };
}

/**
 * Fetch creative-level performance (THE KEY DATA)
 */
async function fetchCreativePerformance(
  adAccountId: string,
  accessToken: string,
  datePreset: string
): Promise<CreativePerformance[]> {
  // First get all ads with their creatives
  const adsUrl = `${BASE_URL}/${adAccountId}/ads?` +
    `fields=id,name,creative{id,object_story_spec,title,body}&` +
    `limit=200&` +
    `access_token=${accessToken}`;

  const adsResp = await fetch(adsUrl);
  const adsData = await adsResp.json();

  if (adsData.error) {
    throw new Error(`Meta API Error: ${adsData.error.message}`);
  }

  // Get insights at ad level
  const insightsUrl = `${BASE_URL}/${adAccountId}/insights?` +
    `fields=ad_id,ad_name,spend,impressions,clicks,ctr,cpc,actions,action_values,cost_per_action_type&` +
    `level=ad&` +
    `date_preset=${datePreset}&` +
    `sort=spend_descending&` +
    `limit=100&` +
    `access_token=${accessToken}`;

  const insightsResp = await fetch(insightsUrl);
  const insightsData = await insightsResp.json();

  if (insightsData.error) {
    throw new Error(`Meta API Error: ${insightsData.error.message}`);
  }

  // Create ads map for creative details
  const adsMap = new Map<string, any>();
  for (const ad of adsData.data || []) {
    adsMap.set(ad.id, ad);
  }

  // Build creative performance array
  const creatives: CreativePerformance[] = [];

  for (const insight of insightsData.data || []) {
    const ad = adsMap.get(insight.ad_id);
    const creative = ad?.creative || {};
    const oss = creative.object_story_spec || {};

    // Determine creative type
    let creativeType: CreativePerformance['creativeType'] = 'unknown';
    if (oss.video_data) {
      creativeType = 'video';
    } else if (oss.link_data?.child_attachments) {
      creativeType = 'carousel';
    } else if (oss.link_data?.image_hash || oss.photo_data) {
      creativeType = 'image';
    }

    // Extract metrics
    const spend = parseFloat(insight.spend || '0');
    const impressions = parseInt(insight.impressions || '0');
    const clicks = parseInt(insight.clicks || '0');
    const ctr = parseFloat(insight.ctr || '0');
    const cpc = parseFloat(insight.cpc || '0');

    // Funnel actions
    const purchases = extractAction(insight.actions, 'purchase');
    const addToCarts = extractAction(insight.actions, 'add_to_cart');
    const landingPageViews = extractAction(insight.actions, 'landing_page_view');
    const checkouts = extractAction(insight.actions, 'initiate_checkout');

    // Revenue
    const revenue = extractActionValue(insight.action_values, 'purchase');

    // Calculate rates
    const roas = spend > 0 ? revenue / spend : 0;
    const cpa = purchases > 0 ? spend / purchases : 0;
    const clickToLpvRate = clicks > 0 ? (landingPageViews / clicks) * 100 : 0;
    const lpvToAtcRate = landingPageViews > 0 ? (addToCarts / landingPageViews) * 100 : 0;
    const atcToPurchaseRate = addToCarts > 0 ? (purchases / addToCarts) * 100 : 0;

    // Extract copy
    const linkData = oss.link_data || {};
    const primaryText = linkData.message || creative.body || null;
    const headline = linkData.name || creative.title || null;

    creatives.push({
      adId: insight.ad_id,
      adName: insight.ad_name || 'Unknown',
      creativeType,
      spend,
      impressions,
      clicks,
      purchases,
      revenue,
      ctr,
      cpc,
      cpa,
      roas,
      landingPageViews,
      addToCarts,
      checkouts,
      clickToLpvRate,
      lpvToAtcRate,
      atcToPurchaseRate,
      primaryText,
      headline,
    });
  }

  return creatives;
}

/**
 * Fetch pixel health
 */
async function fetchPixelHealth(
  adAccountId: string,
  accessToken: string
): Promise<{ advancedMatchingEnabled: boolean; lastFiredTime: string | null }> {
  const url = `${BASE_URL}/${adAccountId}/adspixels?` +
    `fields=id,name,enable_automatic_matching,last_fired_time&` +
    `access_token=${accessToken}`;

  const resp = await fetch(url);
  const data = await resp.json();

  if (data.error || !data.data?.[0]) {
    return { advancedMatchingEnabled: false, lastFiredTime: null };
  }

  const pixel = data.data[0];
  return {
    advancedMatchingEnabled: pixel.enable_automatic_matching || false,
    lastFiredTime: pixel.last_fired_time || null,
  };
}

/**
 * Fetch audience counts
 */
async function fetchAudienceCount(
  adAccountId: string,
  accessToken: string
): Promise<{ custom: number; lookalike: number }> {
  const url = `${BASE_URL}/${adAccountId}/customaudiences?` +
    `fields=id,subtype&` +
    `limit=100&` +
    `access_token=${accessToken}`;

  const resp = await fetch(url);
  const data = await resp.json();

  if (data.error) {
    return { custom: 0, lookalike: 0 };
  }

  let custom = 0;
  let lookalike = 0;

  for (const aud of data.data || []) {
    if (aud.subtype === 'LOOKALIKE') {
      lookalike++;
    } else {
      custom++;
    }
  }

  return { custom, lookalike };
}

// ============ HELPERS ============

function extractAction(actions: any[] | undefined, actionType: string): number {
  if (!actions) return 0;
  const action = actions.find((a: any) => a.action_type === actionType);
  return action ? parseFloat(action.value) : 0;
}

function extractActionValue(actionValues: any[] | undefined, actionType: string): number {
  if (!actionValues) return 0;
  const action = actionValues.find((a: any) => a.action_type === actionType);
  return action ? parseFloat(action.value) : 0;
}

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
      start.setFullYear(end.getFullYear() - 1); // Default to 1 year
      break;
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}
