/**
 * Cohort LTV Analyzer — Cosmisk
 *
 * Analyzes customer Lifetime Value (LTV) by acquisition source using UTM data.
 * Unlike ltv-by-creative-analyzer which uses order tags, this uses UTM parameters
 * from note_attributes (captured by GoKwik/checkout).
 *
 * Key insights:
 * - LTV by Channel: "Google customers worth ₹587 more than Meta customers"
 * - Repeat Rate by Channel: "Google has 16% repeat vs Meta's 12%"
 * - LTV-adjusted CPA: True acquisition cost considering customer lifetime value
 * - Monthly Cohort Retention: How cohorts perform over time
 *
 * This is cross-platform intelligence that neither Meta nor Shopify shows alone.
 */

import { logger } from '../utils/logger.js';
import { getDb } from '../db/index.js';
import { decryptToken } from './token-crypto.js';
import {
  getClientContext, getCohortLTVStore, updateCohortLTVStore,
  getCohortLTVGapThreshold, createRecommendation, type ServiceClient,
} from './service-clients.js';
// CLOSED-LOOP OPERATING SYSTEM
import { agentRecommend } from './recommendation-loop.js';
// STRATEGIC MEMORY - Week-to-week learning
import { recordEpisode } from './agent-memory.js';
import { getStrategicContextForAgent, recordReport, type ReportRecord } from './strategic-memory.js';
import { v4 as uuidv4 } from 'uuid';

// ============ TYPES ============

export interface AcquisitionSource {
  key: string;         // Normalized key (meta_ads, google_ads, direct, etc.)
  displayName: string; // Display name (Meta Ads, Google Ads, Direct/Organic)
  rawSources: string[]; // Original UTM sources grouped under this
}

export interface ChannelMetrics {
  channel: string;
  displayName: string;
  customers: number;
  totalRevenue: number;
  avgLTV: number;
  repeatCustomers: number;
  repeatRate: number;
  avgOrdersPerCustomer: number;
  avgOrderValue: number;
  // Comparison
  ltvVsAverage: number; // % above/below average
  repeatVsAverage: number; // % above/below average
}

export interface MonthlyCohort {
  month: string;      // YYYY-MM
  newCustomers: number;
  totalRevenue: number;
  avgLTV: number;
  repeatCustomers: number;
  repeatRate: number;
}

export interface CohortLTVAnalysis {
  // Period info
  period: string;
  daysAnalyzed: number;

  // Overall metrics
  totalOrders: number;
  totalCustomers: number;
  totalRevenue: number;
  avgAccountLTV: number;
  avgRepeatRate: number;

  // Channel breakdown
  channels: ChannelMetrics[];
  bestChannel: ChannelMetrics | null;
  worstChannel: ChannelMetrics | null;

  // Monthly cohorts
  monthlyCohorts: MonthlyCohort[];

  // LTV gap (opportunity)
  ltvGap: number;
  ltvGapExplanation: string;

  // Recommendations
  recommendations: string[];

  // Data quality
  dataQuality: 'high' | 'medium' | 'low';
  attributionRate: number; // % of customers with known acquisition source

  // Metadata
  analyzedAt: string;
}

// ============ SOURCE NORMALIZATION ============

const SOURCE_MAPPINGS: Record<string, AcquisitionSource> = {
  meta_ads: {
    key: 'meta_ads',
    displayName: 'Meta Ads',
    rawSources: ['facebook', 'fb', 'meta', 'instagram', 'ig'],
  },
  google_ads: {
    key: 'google_ads',
    displayName: 'Google Ads',
    rawSources: ['google', 'gads', 'adwords', 'googleads'],
  },
  direct: {
    key: 'direct',
    displayName: 'Direct/Organic',
    rawSources: ['direct', 'organic', ''],
  },
  email: {
    key: 'email',
    displayName: 'Email',
    rawSources: ['email', 'klaviyo', 'mailchimp', 'newsletter'],
  },
  affiliates: {
    key: 'affiliates',
    displayName: 'Affiliates',
    rawSources: ['affiliate', 'referral', 'partner'],
  },
};

function normalizeSource(utmSource: string, utmTerm: string): AcquisitionSource {
  const source = (utmSource || '').toLowerCase().trim();

  // Check for Meta adset ID pattern (15-20 digit number in utm_term)
  if (utmTerm && /^\d{15,20}$/.test(utmTerm)) {
    return SOURCE_MAPPINGS['meta_ads'];
  }

  // Check for campaign name patterns (DSG_, TOF_, etc. - common Meta naming)
  if (source.startsWith('dsg_') || source.includes('_tof_') || source.includes('_mof_') || source.includes('_bof_')) {
    return SOURCE_MAPPINGS['meta_ads'];
  }

  // Check standard source mappings
  for (const [key, mapping] of Object.entries(SOURCE_MAPPINGS)) {
    for (const rawSource of mapping.rawSources) {
      if (rawSource && source.includes(rawSource)) {
        return mapping;
      }
    }
  }

  // If source starts with common Meta campaign prefixes
  if (source.includes('catalog') || source.includes('reel') || source.includes('video')) {
    return SOURCE_MAPPINGS['meta_ads'];
  }

  // If empty or "direct"
  if (!source || source === 'direct') {
    return SOURCE_MAPPINGS['direct'];
  }

  // Check for misconfigured UTM templates (unresolved placeholders)
  if (source.includes('{{') || source.includes('}}')) {
    return SOURCE_MAPPINGS['direct']; // Group with direct/unknown
  }

  // Unknown source - return as-is
  return {
    key: 'other',
    displayName: source.slice(0, 30),
    rawSources: [source],
  };
}

// ============ MAIN FUNCTION ============

export async function analyzeCohortLTV(
  userId: string,
  options: {
    days?: number;
    minCustomersPerChannel?: number;
  } = {}
): Promise<CohortLTVAnalysis | null> {
  const { days = 90, minCustomersPerChannel = 10 } = options;

  logger.info(`[CohortLTV] Analyzing for user ${userId}, last ${days} days`);

  const db = getDb();

  // Get Shopify credentials
  const shopifyRow = db.prepare(
    'SELECT shop_domain, encrypted_access_token FROM shopify_tokens WHERE brand_id = ?'
  ).get(userId) as { shop_domain: string; encrypted_access_token: string } | undefined;

  if (!shopifyRow) {
    logger.warn(`[CohortLTV] No Shopify connected for user ${userId}`);
    return null;
  }

  const store = shopifyRow.shop_domain;
  const token = decryptToken(shopifyRow.encrypted_access_token);

  try {
    // Fetch orders with pagination
    const since = new Date();
    since.setDate(since.getDate() - days);

    logger.info(`[CohortLTV] Fetching orders since ${since.toISOString()}`);

    const allOrders = await fetchAllOrders(store, token, since);
    logger.info(`[CohortLTV] Fetched ${allOrders.length} orders`);

    if (allOrders.length === 0) {
      logger.warn(`[CohortLTV] No orders found`);
      return null;
    }

    // Build customer map with LTV and acquisition source
    const customerMap = buildCustomerMap(allOrders);
    logger.info(`[CohortLTV] Found ${customerMap.size} unique customers`);

    // Calculate channel metrics
    const channelMetrics = calculateChannelMetrics(customerMap, minCustomersPerChannel);

    // Calculate monthly cohorts
    const monthlyCohorts = calculateMonthlyCohorts(customerMap);

    // Calculate overall metrics
    const totalCustomers = customerMap.size;
    const totalRevenue = Array.from(customerMap.values()).reduce((s, c) => s + c.totalSpent, 0);
    const avgAccountLTV = totalRevenue / totalCustomers;
    const repeatCustomers = Array.from(customerMap.values()).filter(c => c.orders.length > 1).length;
    const avgRepeatRate = (repeatCustomers / totalCustomers) * 100;

    // Find best and worst channels
    const sortedChannels = [...channelMetrics].sort((a, b) => b.avgLTV - a.avgLTV);
    const bestChannel = sortedChannels[0] || null;
    const worstChannel = sortedChannels[sortedChannels.length - 1] || null;

    // Calculate LTV gap
    const { ltvGap, ltvGapExplanation } = calculateLTVGap(channelMetrics, bestChannel);

    // Calculate attribution rate
    const knownSourceCustomers = Array.from(customerMap.values())
      .filter(c => c.acquisitionSource.key !== 'direct' && c.acquisitionSource.key !== 'other');
    const attributionRate = (knownSourceCustomers.length / totalCustomers) * 100;

    // Data quality based on attribution rate
    const dataQuality = attributionRate > 60 ? 'high' : attributionRate > 30 ? 'medium' : 'low';

    // Generate recommendations
    const recommendations = generateRecommendations(channelMetrics, avgAccountLTV, avgRepeatRate, ltvGap);

    const analysis: CohortLTVAnalysis = {
      period: `Last ${days} days`,
      daysAnalyzed: days,
      totalOrders: allOrders.length,
      totalCustomers,
      totalRevenue,
      avgAccountLTV,
      avgRepeatRate,
      channels: channelMetrics,
      bestChannel,
      worstChannel,
      monthlyCohorts,
      ltvGap,
      ltvGapExplanation,
      recommendations,
      dataQuality,
      attributionRate,
      analyzedAt: new Date().toISOString(),
    };

    logger.info(`[CohortLTV] Analysis complete: ${channelMetrics.length} channels, ${attributionRate.toFixed(1)}% attribution`);

    return analysis;

  } catch (error) {
    logger.error(`[CohortLTV] Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// ============ DATA FETCHING ============

interface ShopifyOrderRaw {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  customer?: {
    id: number;
    email: string;
    created_at: string;
  };
  note_attributes?: Array<{ name: string; value: string }>;
  cancelled_at?: string;
  financial_status: string;
}

async function fetchAllOrders(
  store: string,
  token: string,
  since: Date
): Promise<ShopifyOrderRaw[]> {
  const allOrders: ShopifyOrderRaw[] = [];
  let nextUrl: string | null = `https://${store}/admin/api/2024-10/orders.json?status=any&created_at_min=${since.toISOString()}&limit=250`;
  let page = 0;
  const maxPages = 20; // Up to 5000 orders

  while (nextUrl && page < maxPages) {
    page++;

    const fetchRes: Response = await fetch(nextUrl, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!fetchRes.ok) {
      throw new Error(`Shopify API error: ${fetchRes.status}`);
    }

    const data = await fetchRes.json();
    const orders = data.orders || [];
    allOrders.push(...orders);

    // Check for next page
    const linkHeader: string = fetchRes.headers.get('Link') || '';
    const linkMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = linkMatch ? linkMatch[1] : null;
  }

  return allOrders;
}

// ============ CUSTOMER MAP ============

interface CustomerData {
  customerId: number;
  email: string;
  firstOrderDate: string;
  acquisitionSource: AcquisitionSource;
  orders: Array<{
    orderId: number;
    date: string;
    amount: number;
    source: AcquisitionSource;
  }>;
  totalSpent: number;
}

function buildCustomerMap(orders: ShopifyOrderRaw[]): Map<number, CustomerData> {
  const customerMap = new Map<number, CustomerData>();

  // Sort orders by date (oldest first) to determine first order
  const sortedOrders = [...orders]
    .filter(o => !o.cancelled_at && o.financial_status !== 'refunded')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const order of sortedOrders) {
    const customerId = order.customer?.id;
    if (!customerId) continue;

    const noteAttrs = order.note_attributes || [];
    const utmSource = noteAttrs.find(n => n.name === 'utm_source')?.value || '';
    const utmTerm = noteAttrs.find(n => n.name === 'utm_term')?.value || '';
    const source = normalizeSource(utmSource, utmTerm);
    const amount = parseFloat(order.total_price);

    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customerId,
        email: order.customer?.email || '',
        firstOrderDate: order.created_at,
        acquisitionSource: source,
        orders: [],
        totalSpent: 0,
      });
    }

    const customer = customerMap.get(customerId)!;
    customer.orders.push({
      orderId: order.id,
      date: order.created_at,
      amount,
      source,
    });
    customer.totalSpent += amount;

    // Update acquisition source if this order is earlier
    if (new Date(order.created_at) < new Date(customer.firstOrderDate)) {
      customer.firstOrderDate = order.created_at;
      customer.acquisitionSource = source;
    }
  }

  return customerMap;
}

// ============ CHANNEL METRICS ============

function calculateChannelMetrics(
  customerMap: Map<number, CustomerData>,
  minCustomers: number
): ChannelMetrics[] {
  // Group customers by acquisition source
  const channelMap = new Map<string, CustomerData[]>();

  for (const customer of customerMap.values()) {
    const key = customer.acquisitionSource.key;
    if (!channelMap.has(key)) {
      channelMap.set(key, []);
    }
    channelMap.get(key)!.push(customer);
  }

  // Calculate overall averages for comparison
  const allCustomers = Array.from(customerMap.values());
  const overallLTV = allCustomers.reduce((s, c) => s + c.totalSpent, 0) / allCustomers.length;
  const overallRepeat = (allCustomers.filter(c => c.orders.length > 1).length / allCustomers.length) * 100;

  // Calculate metrics for each channel
  const metrics: ChannelMetrics[] = [];

  for (const [key, customers] of channelMap) {
    if (customers.length < minCustomers) continue;

    const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
    const avgLTV = totalRevenue / customers.length;
    const repeatCustomers = customers.filter(c => c.orders.length > 1).length;
    const repeatRate = (repeatCustomers / customers.length) * 100;
    const totalOrders = customers.reduce((s, c) => s + c.orders.length, 0);
    const avgOrders = totalOrders / customers.length;
    const avgOrderValue = totalRevenue / totalOrders;

    const displayName = customers[0].acquisitionSource.displayName;

    metrics.push({
      channel: key,
      displayName,
      customers: customers.length,
      totalRevenue,
      avgLTV,
      repeatCustomers,
      repeatRate,
      avgOrdersPerCustomer: avgOrders,
      avgOrderValue,
      ltvVsAverage: ((avgLTV - overallLTV) / overallLTV) * 100,
      repeatVsAverage: repeatRate - overallRepeat,
    });
  }

  // Sort by number of customers (most significant first)
  metrics.sort((a, b) => b.customers - a.customers);

  return metrics;
}

// ============ MONTHLY COHORTS ============

function calculateMonthlyCohorts(customerMap: Map<number, CustomerData>): MonthlyCohort[] {
  const cohortMap = new Map<string, CustomerData[]>();

  for (const customer of customerMap.values()) {
    const date = new Date(customer.firstOrderDate);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!cohortMap.has(month)) {
      cohortMap.set(month, []);
    }
    cohortMap.get(month)!.push(customer);
  }

  const cohorts: MonthlyCohort[] = [];

  for (const [month, customers] of cohortMap) {
    const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
    const repeatCustomers = customers.filter(c => c.orders.length > 1).length;

    cohorts.push({
      month,
      newCustomers: customers.length,
      totalRevenue,
      avgLTV: totalRevenue / customers.length,
      repeatCustomers,
      repeatRate: (repeatCustomers / customers.length) * 100,
    });
  }

  // Sort by month
  cohorts.sort((a, b) => a.month.localeCompare(b.month));

  return cohorts;
}

// ============ LTV GAP ============

function calculateLTVGap(
  channels: ChannelMetrics[],
  bestChannel: ChannelMetrics | null
): { ltvGap: number; ltvGapExplanation: string } {
  if (!bestChannel || channels.length < 2) {
    return { ltvGap: 0, ltvGapExplanation: 'Insufficient data for LTV gap calculation' };
  }

  let ltvGap = 0;
  const improvements: string[] = [];

  for (const channel of channels) {
    if (channel.channel === bestChannel.channel) continue;

    const gap = (bestChannel.avgLTV - channel.avgLTV) * channel.customers;
    if (gap > 0) {
      ltvGap += gap;
      improvements.push(`${channel.displayName}: +₹${Math.round(bestChannel.avgLTV - channel.avgLTV).toLocaleString()}/customer`);
    }
  }

  const explanation = improvements.length > 0
    ? `If all channels matched ${bestChannel.displayName}'s LTV: ${improvements.slice(0, 3).join(', ')}`
    : 'All channels performing similarly';

  return { ltvGap, ltvGapExplanation: explanation };
}

// ============ ACTIONABLE RECOMMENDATIONS ============

export interface ActionableRecommendation {
  type: 'budget_shift' | 'retention' | 'attribution' | 'lookalike' | 'healthy';
  priority: 'high' | 'medium' | 'low';
  insight: string;
  action: string;
  expectedImpact: string;
}

function generateRecommendations(
  channels: ChannelMetrics[],
  avgLTV: number,
  avgRepeatRate: number,
  ltvGap: number
): string[] {
  const recs: string[] = [];
  const actions = generateActionableRecommendations(channels, avgLTV, avgRepeatRate, ltvGap);

  for (const action of actions) {
    recs.push(`${action.insight}\n→ ACTION: ${action.action}\n→ IMPACT: ${action.expectedImpact}`);
  }

  return recs;
}

export function generateActionableRecommendations(
  channels: ChannelMetrics[],
  avgLTV: number,
  avgRepeatRate: number,
  ltvGap: number
): ActionableRecommendation[] {
  const actions: ActionableRecommendation[] = [];

  // Find best and worst channels by LTV
  const sortedByLTV = [...channels].sort((a, b) => b.avgLTV - a.avgLTV);
  const metaChannel = channels.find(c => c.channel === 'meta_ads');
  const googleChannel = channels.find(c => c.channel === 'google_ads');
  const best = sortedByLTV[0];
  const worst = sortedByLTV[sortedByLTV.length - 1];

  // Budget shift recommendation (if significant LTV gap)
  if (best && worst && best.channel !== worst.channel) {
    const ltvDiff = best.avgLTV - worst.avgLTV;
    const ltvDiffPct = (ltvDiff / worst.avgLTV) * 100;

    if (ltvDiffPct > 10 && worst.customers > 100) {
      // Calculate how much to shift
      const shiftPct = Math.min(20, Math.round(ltvDiffPct / 2));
      const shiftCustomers = Math.round(worst.customers * (shiftPct / 100));
      const additionalRevenue = shiftCustomers * ltvDiff;

      actions.push({
        type: 'budget_shift',
        priority: ltvDiffPct > 20 ? 'high' : 'medium',
        insight: `${best.displayName} customers worth ₹${Math.round(ltvDiff).toLocaleString()} more (${ltvDiffPct.toFixed(0)}% higher LTV) than ${worst.displayName}.`,
        action: `Shift ${shiftPct}% of ${worst.displayName} budget to ${best.displayName}. Test with ₹50K over 2 weeks.`,
        expectedImpact: `+₹${Math.round(additionalRevenue).toLocaleString()} additional lifetime value from ~${shiftCustomers} customers`,
      });
    }
  }

  // Google vs Meta specific recommendation (common case)
  if (googleChannel && metaChannel && googleChannel.avgLTV > metaChannel.avgLTV) {
    const googleLTVAdvantage = googleChannel.avgLTV - metaChannel.avgLTV;
    const googleRepeatAdvantage = googleChannel.repeatRate - metaChannel.repeatRate;

    if (googleLTVAdvantage > 300 && googleChannel.customers > 50) {
      actions.push({
        type: 'budget_shift',
        priority: 'high',
        insight: `Google Ads customers have ₹${Math.round(googleLTVAdvantage).toLocaleString()} higher LTV and ${googleRepeatAdvantage.toFixed(0)}% higher repeat rate than Meta.`,
        action: `Increase Google Ads budget by 30%. Focus on Shopping campaigns and branded search. Current Google share: ${((googleChannel.customers / channels.reduce((s, c) => s + c.customers, 0)) * 100).toFixed(0)}%`,
        expectedImpact: `If 100 more customers come via Google instead of Meta: +₹${Math.round(googleLTVAdvantage * 100).toLocaleString()} in lifetime value`,
      });
    }
  }

  // Lookalike audience recommendation
  if (best && best.repeatRate > avgRepeatRate + 3) {
    actions.push({
      type: 'lookalike',
      priority: 'medium',
      insight: `${best.displayName} brings customers with ${best.repeatRate.toFixed(0)}% repeat rate (${(best.repeatRate - avgRepeatRate).toFixed(0)}% above average).`,
      action: `Export ${best.displayName} customer emails (last 6 months, 2+ orders). Create Meta Lookalike audience from this list. Exclude from prospecting.`,
      expectedImpact: `Better quality lookalikes → higher repeat rate → improved LTV`,
    });
  }

  // Retention recommendation
  if (avgRepeatRate < 15) {
    const potentialRevenue = channels.reduce((s, c) => s + c.customers, 0) * avgLTV * 0.1; // 10% improvement

    actions.push({
      type: 'retention',
      priority: 'medium',
      insight: `Only ${avgRepeatRate.toFixed(1)}% of customers buy again. Industry benchmark: 20-25%.`,
      action: `Set up post-purchase WhatsApp flow: Day 3 (delivery check), Day 14 (review ask + 10% next order), Day 30 (new arrivals). Use Klaviyo/Wigzo.`,
      expectedImpact: `5% improvement in repeat rate = +₹${Math.round(potentialRevenue).toLocaleString()} annual revenue`,
    });
  }

  // Attribution warning
  const directChannel = channels.find(c => c.channel === 'direct');
  const totalCustomers = channels.reduce((s, c) => s + c.customers, 0);
  if (directChannel && (directChannel.customers / totalCustomers) > 0.4) {
    actions.push({
      type: 'attribution',
      priority: 'low',
      insight: `${((directChannel.customers / totalCustomers) * 100).toFixed(0)}% of customers have no attribution. This limits optimization accuracy.`,
      action: `Add utm_ad_id={{ad.id}} to Meta URL parameters. Verify UTM tracking in GoKwik/checkout. Check: Shopify Admin → Orders → note_attributes.`,
      expectedImpact: `Better attribution → more accurate channel insights → smarter budget allocation`,
    });
  }

  // If no issues
  if (actions.length === 0) {
    actions.push({
      type: 'healthy',
      priority: 'low',
      insight: `Channels performing consistently with ${avgRepeatRate.toFixed(1)}% repeat rate and ₹${Math.round(avgLTV).toLocaleString()} average LTV.`,
      action: `Continue current strategy. Monitor for changes monthly.`,
      expectedImpact: `Maintain current performance`,
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return actions;
}

// ============ FORMATTED OUTPUT ============

export function formatCohortLTVReport(analysis: CohortLTVAnalysis): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                    COHORT LTV ANALYSIS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Period: ${analysis.period}`);
  lines.push(`Total Orders: ${analysis.totalOrders.toLocaleString()}`);
  lines.push(`Total Customers: ${analysis.totalCustomers.toLocaleString()}`);
  lines.push(`Total Revenue: ₹${Math.round(analysis.totalRevenue).toLocaleString()}`);
  lines.push(`Avg LTV: ₹${Math.round(analysis.avgAccountLTV).toLocaleString()}`);
  lines.push(`Repeat Rate: ${analysis.avgRepeatRate.toFixed(1)}%`);
  lines.push(`Attribution Rate: ${analysis.attributionRate.toFixed(1)}%`);
  lines.push(`Data Quality: ${analysis.dataQuality.toUpperCase()}`);
  lines.push('');

  // Channel breakdown
  lines.push('┌────────────────────────────────────────────────────────────────┐');
  lines.push('│                    LTV BY CHANNEL                              │');
  lines.push('├────────────────────────────────────────────────────────────────┤');
  lines.push('');
  lines.push('Channel'.padEnd(20) + 'Customers'.padStart(10) + 'Avg LTV'.padStart(12) + 'Repeat %'.padStart(10) + 'vs Avg'.padStart(10));
  lines.push('-'.repeat(62));

  for (const channel of analysis.channels) {
    const vsAvg = channel.ltvVsAverage > 0 ? `+${channel.ltvVsAverage.toFixed(0)}%` : `${channel.ltvVsAverage.toFixed(0)}%`;
    lines.push(
      channel.displayName.slice(0, 19).padEnd(20) +
      channel.customers.toString().padStart(10) +
      ('₹' + Math.round(channel.avgLTV).toLocaleString()).padStart(12) +
      (channel.repeatRate.toFixed(0) + '%').padStart(10) +
      vsAvg.padStart(10)
    );
  }

  lines.push('');
  lines.push('└────────────────────────────────────────────────────────────────┘');
  lines.push('');

  // Best vs Worst
  if (analysis.bestChannel && analysis.worstChannel && analysis.bestChannel.channel !== analysis.worstChannel.channel) {
    lines.push('KEY INSIGHT:');
    const diff = analysis.bestChannel.avgLTV - analysis.worstChannel.avgLTV;
    lines.push(`  ${analysis.bestChannel.displayName} customers worth ₹${Math.round(diff).toLocaleString()} more than ${analysis.worstChannel.displayName}`);
    lines.push('');
  }

  // Monthly cohorts
  if (analysis.monthlyCohorts.length > 0) {
    lines.push('MONTHLY COHORTS:');
    lines.push('Month'.padEnd(10) + 'New'.padStart(8) + 'Revenue'.padStart(15) + 'Avg LTV'.padStart(12) + 'Repeat'.padStart(8));
    lines.push('-'.repeat(53));

    for (const cohort of analysis.monthlyCohorts.slice(-6)) { // Last 6 months
      lines.push(
        cohort.month.padEnd(10) +
        cohort.newCustomers.toString().padStart(8) +
        ('₹' + Math.round(cohort.totalRevenue).toLocaleString()).padStart(15) +
        ('₹' + Math.round(cohort.avgLTV).toLocaleString()).padStart(12) +
        (cohort.repeatRate.toFixed(0) + '%').padStart(8)
      );
    }
    lines.push('');
  }

  // LTV Gap
  if (analysis.ltvGap > 0) {
    lines.push('LTV OPPORTUNITY:');
    lines.push(`  Gap: ₹${Math.round(analysis.ltvGap).toLocaleString()}`);
    lines.push(`  ${analysis.ltvGapExplanation}`);
    lines.push('');
  }

  // Recommendations
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                      RECOMMENDATIONS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  for (const rec of analysis.recommendations) {
    lines.push(rec);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`Analyzed at: ${new Date(analysis.analyzedAt).toLocaleString()}`);
  lines.push('');

  return lines.join('\n');
}

// ============ QUICK CHECK (For Watchdog Integration) ============

export interface CohortLTVQuickCheck {
  hasSignificantGap: boolean;
  bestChannel: string;
  worstChannel: string;
  ltvGap: number;
  ltvGapPercent: number;
  topAction: ActionableRecommendation | null;
  summary: string;
}

export async function quickCohortLTVCheck(userId: string): Promise<CohortLTVQuickCheck | null> {
  const analysis = await analyzeCohortLTV(userId, { days: 30, minCustomersPerChannel: 10 });

  if (!analysis || !analysis.bestChannel || !analysis.worstChannel) {
    return null;
  }

  const ltvGap = analysis.bestChannel.avgLTV - analysis.worstChannel.avgLTV;
  const ltvGapPercent = analysis.worstChannel.avgLTV > 0
    ? (ltvGap / analysis.worstChannel.avgLTV) * 100
    : 0;

  // Get actionable recommendations
  const actions = generateActionableRecommendations(
    analysis.channels,
    analysis.avgAccountLTV,
    analysis.avgRepeatRate,
    analysis.ltvGap
  );

  const topAction = actions.find(a => a.priority === 'high') || actions[0] || null;
  const hasSignificantGap = ltvGapPercent > 10 && ltvGap > 300;

  // Build summary for watchdog
  let summary = `${analysis.bestChannel.displayName} customers worth ₹${Math.round(ltvGap).toLocaleString()} more than ${analysis.worstChannel.displayName} (${ltvGapPercent.toFixed(0)}% higher LTV).`;

  if (topAction && topAction.type !== 'healthy') {
    summary += ` ${topAction.action}`;
  }

  return {
    hasSignificantGap,
    bestChannel: analysis.bestChannel.displayName,
    worstChannel: analysis.worstChannel.displayName,
    ltvGap,
    ltvGapPercent,
    topAction,
    summary,
  };
}

// ============ CLIENT-AWARE COHORT LTV ============

export interface ClientCohortLTVReport extends CohortLTVAnalysis {
  clientId: string;
  clientName: string;
  revenueLevel: string;
  gapThreshold: number;
  shouldAlert: boolean;
  alertReason?: string;
}

/**
 * Analyze Cohort LTV for a specific client
 * - Uses client's Shopify credentials
 * - Applies revenue-level LTV gap thresholds
 * - Tracks analysis history
 */
export async function analyzeCohortLTVForClient(
  clientId: string,
  options?: { days?: number },
): Promise<ClientCohortLTVReport | null> {
  const ctx = getClientContext(clientId);
  if (!ctx) {
    logger.error({ clientId }, '[CohortLTV Client] Client not found');
    return null;
  }

  const { client } = ctx;
  const ltvStore = getCohortLTVStore(clientId);

  // === STRATEGIC MEMORY: Load context from previous runs ===
  const strategicContext = getStrategicContextForAgent(clientId);
  if (strategicContext) {
    logger.info({ contextLength: strategicContext.length }, '[CohortLTV] Loaded strategic context');
  }

  logger.info({
    clientId,
    brandName: client.brandName,
    revenueLevel: client.revenueLevel,
  }, '[CohortLTV Client] Starting analysis');

  // Get gap threshold for this client
  const gapThreshold = getCohortLTVGapThreshold(client);
  logger.info({ gapThreshold }, '[CohortLTV Client] Using gap threshold');

  // Get Shopify credentials from database
  const db = getDb();
  // Note: In real usage, we'd need a user association to get the Shopify token
  // For now, we'll use the existing analyzeCohortLTV which handles this internally

  // Run the analysis (uses userId internally to find Shopify connection)
  const analysis = await analyzeCohortLTV(clientId, { days: options?.days || 90 });

  if (!analysis) {
    logger.warn({ clientId }, '[CohortLTV Client] No analysis data available');
    return null;
  }

  // Calculate LTV gap percentage
  const ltvGapPercent = analysis.bestChannel && analysis.worstChannel
    ? Math.round(((analysis.bestChannel.avgLTV - analysis.worstChannel.avgLTV) / analysis.worstChannel.avgLTV) * 100)
    : 0;

  // Determine if we should alert based on gap threshold
  const shouldAlert = ltvGapPercent >= gapThreshold && analysis.bestChannel !== null;
  const alertReason = shouldAlert
    ? `${ltvGapPercent}% LTV gap between ${analysis.bestChannel?.displayName} and ${analysis.worstChannel?.displayName}`
    : undefined;

  logger.info({
    ltvGapPercent,
    gapThreshold,
    shouldAlert,
  }, '[CohortLTV Client] Alert decision');

  // Update LTV store
  updateCohortLTVStore(clientId, {
    lastAnalyzedAt: new Date().toISOString(),
    bestChannel: analysis.bestChannel?.displayName,
    worstChannel: analysis.worstChannel?.displayName,
    ltvGap: analysis.ltvGap,
    avgLTV: analysis.avgAccountLTV,
    alertsSent: shouldAlert ? (ltvStore?.alertsSent || 0) + 1 : ltvStore?.alertsSent || 0,
    lastAlertAt: shouldAlert ? new Date().toISOString() : ltvStore?.lastAlertAt,
  });

  // Create recommendation if significant gap found
  if (shouldAlert) {
    createRecommendation(clientId, 'cohort_ltv', 'rebalance_channel_budget', {
      bestChannel: analysis.bestChannel?.displayName,
      worstChannel: analysis.worstChannel?.displayName,
      ltvGap: analysis.ltvGap,
      ltvGapPercent,
      recommendations: analysis.recommendations,
    });

    // === CLOSED-LOOP OPERATING SYSTEM ===
    if (analysis.worstChannel && analysis.bestChannel) {
      try {
        agentRecommend(clientId, 'cohort_ltv', {
          type: 'change_targeting',
          entityType: 'account',
          entityId: analysis.worstChannel.displayName,
          entityName: analysis.worstChannel.displayName,
          action: `Shift budget from ${analysis.worstChannel.displayName} to ${analysis.bestChannel.displayName}`,
          reasoning: `LTV gap of ₹${analysis.ltvGap.toLocaleString()} (${ltvGapPercent}%) between best (${analysis.bestChannel.displayName}: ₹${analysis.bestChannel.avgLTV?.toLocaleString()}) and worst (${analysis.worstChannel.displayName}: ₹${analysis.worstChannel.avgLTV?.toLocaleString()}) channels`,
          evidence: [
            `Best channel: ${analysis.bestChannel.displayName} (LTV: ₹${analysis.bestChannel.avgLTV?.toLocaleString()})`,
            `Worst channel: ${analysis.worstChannel.displayName} (LTV: ₹${analysis.worstChannel.avgLTV?.toLocaleString()})`,
            `LTV gap: ₹${analysis.ltvGap.toLocaleString()} (${ltvGapPercent}%)`,
            `Account avg LTV: ₹${analysis.avgAccountLTV?.toLocaleString()}`,
          ],
          confidence: 75,
          predictedSavings: analysis.ltvGap * 10, // Rough estimate: gap * assumed monthly customers
        });
      } catch (loopErr) {
        logger.warn({ err: loopErr }, '[CohortLTV] Closed-loop tracking failed');
      }
    }

    // === STRATEGIC MEMORY: Record episode for LTV gap detection ===
    recordEpisode(
      'system',
      'audience',
      `LTV Gap Alert: ${analysis.bestChannel?.displayName} vs ${analysis.worstChannel?.displayName} (${ltvGapPercent.toFixed(0)}% gap) for ${client.brandName}`,
      JSON.stringify({ bestChannel: analysis.bestChannel?.displayName, worstChannel: analysis.worstChannel?.displayName, gap: ltvGapPercent }),
      'pending'
    ).catch(epErr => logger.warn({ err: epErr }, '[CohortLTV] Episode recording failed'));
  }

  // === STRATEGIC MEMORY: Record report summary ===
  try {
    const now = new Date();
    const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const reportRecord: ReportRecord = {
      id: uuidv4(),
      clientId,
      reportType: 'cohort-ltv',
      generatedAt: now.toISOString(),
      weekNumber,
      year: now.getFullYear(),
      headline: `LTV Report: ${analysis.channels?.length || 0} channels analyzed, ${ltvGapPercent.toFixed(0)}% LTV gap`,
      keyInsights: [
        `Best channel: ${analysis.bestChannel?.displayName || 'N/A'}`,
        `Worst channel: ${analysis.worstChannel?.displayName || 'N/A'}`,
        `LTV gap threshold: ${gapThreshold}%`,
      ],
      recommendations: shouldAlert ? [`Shift budget from ${analysis.worstChannel?.displayName} to ${analysis.bestChannel?.displayName}`] : [],
      metricsSnapshot: {
        channelCount: analysis.channels?.length || 0,
        ltvGap: ltvGapPercent,
        gapThreshold
      },
      qualityScore: 80,
      wasShipped: shouldAlert,
      shipDecision: shouldAlert ? 'SHIP' : 'HOLD',
      deliveredVia: [],
    };
    recordReport(reportRecord);
  } catch (repErr) {
    logger.warn({ err: repErr }, '[CohortLTV] Report recording failed');
  }

  return {
    ...analysis,
    clientId,
    clientName: client.brandName,
    revenueLevel: client.revenueLevel || 'unknown',
    gapThreshold,
    shouldAlert,
    alertReason,
  };
}

/**
 * Generate Smashed-branded HTML report for Cohort LTV
 */
export function generateCohortLTVHTMLReport(report: ClientCohortLTVReport, client: ServiceClient): string {
  const channels = report.channels || [];
  const cohorts = report.monthlyCohorts || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cohort LTV Report - ${client.brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }
    .meta { margin-top: 30px; display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
    .meta-item { text-align: center; }
    .meta-value { font-size: 32px; font-weight: 700; color: #EC8A23; }
    .meta-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .section { padding: 60px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 28px; font-weight: 600; margin-bottom: 40px; display: flex; align-items: center; gap: 12px; }
    .section-title::before { content: ''; width: 4px; height: 28px; background: #EC8A23; border-radius: 2px; }
    .channels-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
    .channel-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; }
    .channel-card.best { border-left: 4px solid #22c55e; }
    .channel-card.worst { border-left: 4px solid #ef4444; }
    .channel-name { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 16px; }
    .channel-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .stat { background: #1a1a1a; padding: 12px; border-radius: 8px; }
    .stat-value { font-size: 20px; font-weight: 700; color: #EC8A23; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; }
    .gap-card { background: linear-gradient(135deg, #1a1a1a 0%, #151515 100%); border: 1px solid #EC8A23; border-radius: 12px; padding: 32px; text-align: center; margin: 40px 0; }
    .gap-value { font-size: 64px; font-weight: 700; color: #EC8A23; }
    .gap-label { font-size: 18px; color: #888; margin-top: 8px; }
    .recommendations { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; }
    .rec-item { padding: 12px 0; border-bottom: 1px solid #2a2a2a; color: #aaa; }
    .rec-item:last-child { border-bottom: none; }
    .footer { text-align: center; padding: 60px 20px; color: #666; }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>Cohort LTV Analysis</h1>
    <div class="subtitle">${client.brandName} — ${report.daysAnalyzed} Day Analysis</div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-value">₹${Math.round(report.avgAccountLTV).toLocaleString('en-IN')}</div>
        <div class="meta-label">Average LTV</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${report.totalCustomers.toLocaleString('en-IN')}</div>
        <div class="meta-label">Total Customers</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${Math.round(report.avgRepeatRate)}%</div>
        <div class="meta-label">Repeat Rate</div>
      </div>
      <div class="meta-item">
        <div class="meta-value">${Math.round(report.attributionRate)}%</div>
        <div class="meta-label">Attribution Rate</div>
      </div>
    </div>
  </div>

  <div class="container">
    <div class="gap-card">
      <div class="gap-value">₹${Math.round(report.ltvGap).toLocaleString('en-IN')}</div>
      <div class="gap-label">${report.ltvGapExplanation}</div>
    </div>

    <div class="section">
      <h2 class="section-title">Channel Performance</h2>
      <div class="channels-grid">
        ${channels.map(ch => `
          <div class="channel-card ${ch === report.bestChannel ? 'best' : ch === report.worstChannel ? 'worst' : ''}">
            <div class="channel-name">${ch.displayName}</div>
            <div class="channel-stats">
              <div class="stat">
                <div class="stat-value">₹${Math.round(ch.avgLTV).toLocaleString('en-IN')}</div>
                <div class="stat-label">Avg LTV</div>
              </div>
              <div class="stat">
                <div class="stat-value">${ch.customers.toLocaleString('en-IN')}</div>
                <div class="stat-label">Customers</div>
              </div>
              <div class="stat">
                <div class="stat-value">${Math.round(ch.repeatRate)}%</div>
                <div class="stat-label">Repeat Rate</div>
              </div>
              <div class="stat">
                <div class="stat-value">${ch.avgOrdersPerCustomer.toFixed(1)}</div>
                <div class="stat-label">Orders/Customer</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    ${report.recommendations.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Recommendations</h2>
      <div class="recommendations">
        ${report.recommendations.map(r => `<div class="rec-item">→ ${r}</div>`).join('')}
      </div>
    </div>
    ` : ''}
  </div>

  <div class="footer">
    <div class="footer-logo">The Bridge Service</div>
    <p>Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top:8px"><a href="https://smashed.agency/scan">smashed.agency/scan</a> · Confidential Client Report</p>
  </div>
</body>
</html>`;
}
