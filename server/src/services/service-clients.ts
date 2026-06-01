/**
 * The Bridge Service - Client Profile Management
 *
 * AI Infrastructure for service delivery (not SaaS).
 * Clients don't log in - we manage them internally.
 */

import { getDb } from '../db/index.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type RevenueLevel = 'starter' | '10l_plus' | '50l_plus' | '1cr_plus' | '5cr_plus';
export type ServiceTier = 'done_for_you' | 'done_with_you';
export type ClientStatus = 'prospect' | 'onboarding' | 'active' | 'paused' | 'churned';

export interface ServiceClient {
  id: string;
  brandName: string;
  category: string | null;
  revenueLevel: RevenueLevel | null;
  pricePointMin: number | null;
  pricePointMax: number | null;
  metaAdAccountId: string | null;
  shopifyStore: string | null;
  slackChannel: string | null;
  whatsappNumber: string | null;
  alertThreshold: number;
  serviceTier: ServiceTier;
  contractStart: string | null;
  contractEnd: string | null;
  monthlyFee: number | null;
  status: ClientStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientInput {
  brandName: string;
  category?: string;
  revenueLevel?: RevenueLevel;
  pricePointMin?: number;
  pricePointMax?: number;
  metaAdAccountId?: string;
  shopifyStore?: string;
  slackChannel?: string;
  whatsappNumber?: string;
  alertThreshold?: number;
  serviceTier?: ServiceTier;
  contractStart?: string;
  contractEnd?: string;
  monthlyFee?: number;
  status?: ClientStatus;
  notes?: string;
}

export interface CompetitorIntelStore {
  clientId: string;
  referencesShown: string[];       // Ad IDs already shown
  outcomes: Record<string, any>;   // refId -> outcome data
  clientCreativeStyle: any | null;
  searchQueriesUsed: string[];
  lastScrapeAt: string | null;
  lastReportAt: string | null;
  totalReferencesGiven: number;
  successfulAdoptions: number;
}

export interface OOSAgentStore {
  clientId: string;
  productCatalogHash: string | null;
  lastCheckAt: string | null;
  knownOOSProducts: string[];
  cumulativeWaste: number;
  alertsSent: number;
  lastAlertAt: string | null;
}

export interface DiscountAgentStore {
  clientId: string;
  activeCodes: string[];
  leakedCodes: string[];
  couponSitesChecked: string[];
  marginImpactTotal: number;
  lastScanAt: string | null;
  alertsSent: number;
}

export interface CreativeAgentStore {
  clientId: string;
  winningHooks: string[];
  fatiguedCreatives: string[];
  formatPerformance: Record<string, number>;  // format -> avg ROAS
  hookPerformance: Record<string, number>;    // hook type -> avg ROAS
  lastAnalysisAt: string | null;
  creativeCountAnalyzed: number;
}

export interface AgentRecommendation {
  id: string;
  clientId: string;
  agentType: string;
  recommendationType: string;
  recommendationData: any;
  deliveredVia: string | null;
  deliveredAt: string | null;
  outcomeStatus: 'pending' | 'adopted' | 'ignored' | 'failed';
  outcomeData: any | null;
  outcomeRecordedAt: string | null;
  createdAt: string;
}

// ============================================================================
// Client CRUD
// ============================================================================

export function createClient(input: CreateClientInput): ServiceClient {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO service_clients (
      id, brand_name, category, revenue_level,
      price_point_min, price_point_max,
      meta_ad_account_id, shopify_store, slack_channel, whatsapp_number,
      alert_threshold, service_tier, contract_start, contract_end,
      monthly_fee, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.brandName,
    input.category || null,
    input.revenueLevel || null,
    input.pricePointMin || null,
    input.pricePointMax || null,
    input.metaAdAccountId || null,
    input.shopifyStore || null,
    input.slackChannel || null,
    input.whatsappNumber || null,
    input.alertThreshold || 1000,
    input.serviceTier || 'done_for_you',
    input.contractStart || null,
    input.contractEnd || null,
    input.monthlyFee || null,
    input.status || 'prospect',
    input.notes || null,
    now,
    now
  );

  // Initialize agent stores
  db.prepare('INSERT INTO competitor_intel_store (client_id) VALUES (?)').run(id);
  db.prepare('INSERT INTO oos_agent_store (client_id) VALUES (?)').run(id);
  db.prepare('INSERT INTO discount_agent_store (client_id) VALUES (?)').run(id);
  db.prepare('INSERT INTO creative_agent_store (client_id) VALUES (?)').run(id);

  return getClient(id)!;
}

export function getClient(id: string): ServiceClient | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM service_clients WHERE id = ?').get(id) as any;  // DB-2: typed when row becomes a Drizzle result
  if (!row) return null;
  return mapRowToClient(row);
}

export function getClientByBrand(brandName: string): ServiceClient | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM service_clients WHERE brand_name = ?').get(brandName) as any;  // DB-2: typed when row becomes a Drizzle result
  if (!row) return null;
  return mapRowToClient(row);
}

export function listClients(status?: ClientStatus): ServiceClient[] {
  const db = getDb();
  let query = 'SELECT * FROM service_clients';
  const params: any[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY updated_at DESC';

  const rows = db.prepare(query).all(...params) as any[];  // DB-2: typed when row becomes a Drizzle result
  return rows.map(mapRowToClient);
}

export function updateClient(id: string, updates: Partial<CreateClientInput>): ServiceClient | null {
  const db = getDb();
  const existing = getClient(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.brandName !== undefined) { fields.push('brand_name = ?'); values.push(updates.brandName); }
  if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
  if (updates.revenueLevel !== undefined) { fields.push('revenue_level = ?'); values.push(updates.revenueLevel); }
  if (updates.pricePointMin !== undefined) { fields.push('price_point_min = ?'); values.push(updates.pricePointMin); }
  if (updates.pricePointMax !== undefined) { fields.push('price_point_max = ?'); values.push(updates.pricePointMax); }
  if (updates.metaAdAccountId !== undefined) { fields.push('meta_ad_account_id = ?'); values.push(updates.metaAdAccountId); }
  if (updates.shopifyStore !== undefined) { fields.push('shopify_store = ?'); values.push(updates.shopifyStore); }
  if (updates.slackChannel !== undefined) { fields.push('slack_channel = ?'); values.push(updates.slackChannel); }
  if (updates.whatsappNumber !== undefined) { fields.push('whatsapp_number = ?'); values.push(updates.whatsappNumber); }
  if (updates.alertThreshold !== undefined) { fields.push('alert_threshold = ?'); values.push(updates.alertThreshold); }
  if (updates.serviceTier !== undefined) { fields.push('service_tier = ?'); values.push(updates.serviceTier); }
  if (updates.contractStart !== undefined) { fields.push('contract_start = ?'); values.push(updates.contractStart); }
  if (updates.contractEnd !== undefined) { fields.push('contract_end = ?'); values.push(updates.contractEnd); }
  if (updates.monthlyFee !== undefined) { fields.push('monthly_fee = ?'); values.push(updates.monthlyFee); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }

  if (fields.length === 0) return existing;

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE service_clients SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getClient(id);
}

// ============================================================================
// Agent Store Access
// ============================================================================

export function getCompetitorIntelStore(clientId: string): CompetitorIntelStore | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM competitor_intel_store WHERE client_id = ?').get(clientId) as any;  // DB-2: typed when row becomes a Drizzle result
  if (!row) return null;

  return {
    clientId: row.client_id,
    referencesShown: JSON.parse(row.references_shown || '[]'),
    outcomes: JSON.parse(row.outcomes || '{}'),
    clientCreativeStyle: row.client_creative_style ? JSON.parse(row.client_creative_style) : null,
    searchQueriesUsed: JSON.parse(row.search_queries_used || '[]'),
    lastScrapeAt: row.last_scrape_at,
    lastReportAt: row.last_report_at,
    totalReferencesGiven: row.total_references_given || 0,
    successfulAdoptions: row.successful_adoptions || 0,
  };
}

export function updateCompetitorIntelStore(clientId: string, updates: Partial<CompetitorIntelStore>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.referencesShown !== undefined) {
    fields.push('references_shown = ?');
    values.push(JSON.stringify(updates.referencesShown));
  }
  if (updates.outcomes !== undefined) {
    fields.push('outcomes = ?');
    values.push(JSON.stringify(updates.outcomes));
  }
  if (updates.clientCreativeStyle !== undefined) {
    fields.push('client_creative_style = ?');
    values.push(JSON.stringify(updates.clientCreativeStyle));
  }
  if (updates.searchQueriesUsed !== undefined) {
    fields.push('search_queries_used = ?');
    values.push(JSON.stringify(updates.searchQueriesUsed));
  }
  if (updates.lastScrapeAt !== undefined) {
    fields.push('last_scrape_at = ?');
    values.push(updates.lastScrapeAt);
  }
  if (updates.lastReportAt !== undefined) {
    fields.push('last_report_at = ?');
    values.push(updates.lastReportAt);
  }
  if (updates.totalReferencesGiven !== undefined) {
    fields.push('total_references_given = ?');
    values.push(updates.totalReferencesGiven);
  }
  if (updates.successfulAdoptions !== undefined) {
    fields.push('successful_adoptions = ?');
    values.push(updates.successfulAdoptions);
  }

  if (fields.length > 0) {
    values.push(clientId);
    db.prepare(`UPDATE competitor_intel_store SET ${fields.join(', ')} WHERE client_id = ?`).run(...values);
  }
}

export function addReferenceShown(clientId: string, adId: string): void {
  const store = getCompetitorIntelStore(clientId);
  if (!store) return;

  if (!store.referencesShown.includes(adId)) {
    store.referencesShown.push(adId);
    updateCompetitorIntelStore(clientId, {
      referencesShown: store.referencesShown,
      totalReferencesGiven: store.totalReferencesGiven + 1,
    });
  }
}

export function hasReferenceBeenShown(clientId: string, adId: string): boolean {
  const store = getCompetitorIntelStore(clientId);
  return store?.referencesShown.includes(adId) || false;
}

// ============================================================================
// OOS Agent Store
// ============================================================================

export function getOOSAgentStore(clientId: string): OOSAgentStore | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM oos_agent_store WHERE client_id = ?').get(clientId) as any;  // DB-2: typed when row becomes a Drizzle result
  if (!row) return null;

  return {
    clientId: row.client_id,
    productCatalogHash: row.product_catalog_hash,
    lastCheckAt: row.last_check_at,
    knownOOSProducts: JSON.parse(row.known_oos_products || '[]'),
    cumulativeWaste: row.cumulative_waste || 0,
    alertsSent: row.alerts_sent || 0,
    lastAlertAt: row.last_alert_at,
  };
}

export function updateOOSAgentStore(clientId: string, updates: Partial<OOSAgentStore>): void {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.productCatalogHash !== undefined) {
    fields.push('product_catalog_hash = ?');
    values.push(updates.productCatalogHash);
  }
  if (updates.lastCheckAt !== undefined) {
    fields.push('last_check_at = ?');
    values.push(updates.lastCheckAt);
  }
  if (updates.knownOOSProducts !== undefined) {
    fields.push('known_oos_products = ?');
    values.push(JSON.stringify(updates.knownOOSProducts));
  }
  if (updates.cumulativeWaste !== undefined) {
    fields.push('cumulative_waste = ?');
    values.push(updates.cumulativeWaste);
  }
  if (updates.alertsSent !== undefined) {
    fields.push('alerts_sent = ?');
    values.push(updates.alertsSent);
  }
  if (updates.lastAlertAt !== undefined) {
    fields.push('last_alert_at = ?');
    values.push(updates.lastAlertAt);
  }

  if (fields.length > 0) {
    values.push(clientId);
    db.prepare(`UPDATE oos_agent_store SET ${fields.join(', ')} WHERE client_id = ?`).run(...values);
  }
}

/**
 * Get alert threshold based on client's revenue level
 * Scaled brands need higher thresholds to avoid noise
 */
export function getOOSAlertThreshold(client: ServiceClient): number {
  // Use client's custom threshold if set
  if (client.alertThreshold && client.alertThreshold > 0) {
    return client.alertThreshold;
  }

  // Default thresholds by revenue level
  switch (client.revenueLevel) {
    case '5cr_plus':
      return 10000; // Rs 10K - very scaled, only major issues
    case '1cr_plus':
      return 5000;  // Rs 5K - scaled brand
    case '50l_plus':
      return 2000;  // Rs 2K - growing brand
    case '10l_plus':
      return 1000;  // Rs 1K - emerging brand
    default:
      return 500;   // Rs 500 - starter brand
  }
}

// ============================================================================
// Discount Leakage Agent Store
// ============================================================================

export interface DiscountLeakageAgentStore {
  lastCheckAt?: string;
  knownLeakedCodes: string[];      // Codes we've already reported
  cumulativeLeakage: number;       // Total leakage found over time
  alertsSent: number;
  lastAlertAt?: string;
}

export function getDiscountLeakageStore(clientId: string): DiscountLeakageAgentStore | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT discount_leakage_store FROM service_clients WHERE id = ?
  `).get(clientId) as { discount_leakage_store?: string } | undefined;

  if (!row?.discount_leakage_store) return null;

  try {
    return JSON.parse(row.discount_leakage_store);
  } catch {
    return null;
  }
}

export function updateDiscountLeakageStore(clientId: string, updates: Partial<DiscountLeakageAgentStore>): void {
  const db = getDb();
  const existing = getDiscountLeakageStore(clientId) || {
    knownLeakedCodes: [],
    cumulativeLeakage: 0,
    alertsSent: 0,
  };

  const merged = { ...existing, ...updates };

  db.prepare(`
    UPDATE service_clients
    SET discount_leakage_store = ?
    WHERE id = ?
  `).run(JSON.stringify(merged), clientId);
}

export function getDiscountLeakageAlertThreshold(client: ServiceClient): number {
  // Leakage thresholds - slightly higher than OOS since it's about margin not spend
  if (client.alertThreshold && client.alertThreshold > 0) {
    return client.alertThreshold * 1.5; // 1.5x the OOS threshold
  }

  switch (client.revenueLevel) {
    case '5cr_plus':
      return 15000; // Rs 15K
    case '1cr_plus':
      return 7500;  // Rs 7.5K
    case '50l_plus':
      return 3000;  // Rs 3K
    case '10l_plus':
      return 1500;  // Rs 1.5K
    default:
      return 750;   // Rs 750
  }
}

// ============================================================================
// Watchdog Agent Store
// ============================================================================

export interface WatchdogAgentStore {
  lastRunAt?: string;
  totalDecisions: number;
  decisionsActedOn: number;
  alertsSent: number;
  lastAlertAt?: string;
  // Track recent decision types to avoid duplicate alerts
  recentDecisionTypes: string[];
}

export function getWatchdogStore(clientId: string): WatchdogAgentStore | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT watchdog_store FROM service_clients WHERE id = ?
  `).get(clientId) as { watchdog_store?: string } | undefined;

  if (!row?.watchdog_store) return null;

  try {
    return JSON.parse(row.watchdog_store);
  } catch {
    return null;
  }
}

export function updateWatchdogStore(clientId: string, updates: Partial<WatchdogAgentStore>): void {
  const db = getDb();
  const existing = getWatchdogStore(clientId) || {
    totalDecisions: 0,
    decisionsActedOn: 0,
    alertsSent: 0,
    recentDecisionTypes: [],
  };

  const merged = { ...existing, ...updates };

  db.prepare(`
    UPDATE service_clients
    SET watchdog_store = ?
    WHERE id = ?
  `).run(JSON.stringify(merged), clientId);
}

export function getWatchdogUrgencyThreshold(client: ServiceClient): 'low' | 'medium' | 'high' {
  // Higher revenue clients should only be alerted on higher urgency issues
  switch (client.revenueLevel) {
    case '5cr_plus':
      return 'high';     // Only high/critical urgency
    case '1cr_plus':
      return 'medium';   // Medium and above
    default:
      return 'low';      // All urgencies
  }
}

// ============================================================================
// Creative Scorer Agent Store
// ============================================================================

export interface CreativeScorerStore {
  lastScoredAt?: string;
  totalCreativesScored: number;
  avgScore: number;
  topPerformingFormats: string[];
  winningPatterns: string[];
  alertsSent: number;
  lastAlertAt?: string;
}

export function getCreativeScorerStore(clientId: string): CreativeScorerStore | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT creative_scorer_store FROM service_clients WHERE id = ?
  `).get(clientId) as { creative_scorer_store?: string } | undefined;

  if (!row?.creative_scorer_store) return null;

  try {
    return JSON.parse(row.creative_scorer_store);
  } catch {
    return null;
  }
}

export function updateCreativeScorerStore(clientId: string, updates: Partial<CreativeScorerStore>): void {
  const db = getDb();
  const existing = getCreativeScorerStore(clientId) || {
    totalCreativesScored: 0,
    avgScore: 0,
    topPerformingFormats: [],
    winningPatterns: [],
    alertsSent: 0,
  };

  const merged = { ...existing, ...updates };

  db.prepare(`
    UPDATE service_clients
    SET creative_scorer_store = ?
    WHERE id = ?
  `).run(JSON.stringify(merged), clientId);
}

export function getCreativeScoreThreshold(client: ServiceClient): number {
  // Minimum score threshold for "good" creative by revenue level
  // Higher revenue clients have stricter standards
  switch (client.revenueLevel) {
    case '5cr_plus':
      return 75;    // Only 75+ scores are "good"
    case '1cr_plus':
      return 65;    // 65+ for scaled brands
    case '50l_plus':
      return 55;    // 55+ for growing brands
    default:
      return 45;    // 45+ for starter brands
  }
}

// ============================================================================
// Cohort LTV Analyzer Store
// ============================================================================

export interface CohortLTVStore {
  lastAnalyzedAt?: string;
  bestChannel?: string;
  worstChannel?: string;
  ltvGap: number;
  avgLTV: number;
  alertsSent: number;
  lastAlertAt?: string;
}

export function getCohortLTVStore(clientId: string): CohortLTVStore | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT cohort_ltv_store FROM service_clients WHERE id = ?
  `).get(clientId) as { cohort_ltv_store?: string } | undefined;

  if (!row?.cohort_ltv_store) return null;

  try {
    return JSON.parse(row.cohort_ltv_store);
  } catch {
    return null;
  }
}

export function updateCohortLTVStore(clientId: string, updates: Partial<CohortLTVStore>): void {
  const db = getDb();
  const existing = getCohortLTVStore(clientId) || {
    ltvGap: 0,
    avgLTV: 0,
    alertsSent: 0,
  };

  const merged = { ...existing, ...updates };

  db.prepare(`
    UPDATE service_clients
    SET cohort_ltv_store = ?
    WHERE id = ?
  `).run(JSON.stringify(merged), clientId);
}

export function getCohortLTVGapThreshold(client: ServiceClient): number {
  // LTV gap threshold (%) to trigger alert - higher revenue = stricter
  switch (client.revenueLevel) {
    case '5cr_plus':
      return 30;    // 30%+ gap is significant
    case '1cr_plus':
      return 25;    // 25%+ gap
    case '50l_plus':
      return 20;    // 20%+ gap
    default:
      return 15;    // 15%+ gap for starter brands
  }
}

// ============================================================================
// Fatigue Detector Store
// ============================================================================

export interface FatigueDetectorStore {
  lastCheckedAt?: string;
  knownFatiguedCreatives: string[];  // Creative IDs already flagged
  totalFatiguedCount: number;
  alertsSent: number;
  lastAlertAt?: string;
}

export function getFatigueDetectorStore(clientId: string): FatigueDetectorStore | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT fatigue_detector_store FROM service_clients WHERE id = ?
  `).get(clientId) as { fatigue_detector_store?: string } | undefined;

  if (!row?.fatigue_detector_store) return null;

  try {
    return JSON.parse(row.fatigue_detector_store);
  } catch {
    return null;
  }
}

export function updateFatigueDetectorStore(clientId: string, updates: Partial<FatigueDetectorStore>): void {
  const db = getDb();
  const existing = getFatigueDetectorStore(clientId) || {
    knownFatiguedCreatives: [],
    totalFatiguedCount: 0,
    alertsSent: 0,
  };

  const merged = { ...existing, ...updates };

  db.prepare(`
    UPDATE service_clients
    SET fatigue_detector_store = ?
    WHERE id = ?
  `).run(JSON.stringify(merged), clientId);
}

export function getFatigueFrequencyThreshold(client: ServiceClient): number {
  // Frequency threshold before alerting - higher revenue = stricter monitoring
  switch (client.revenueLevel) {
    case '5cr_plus':
      return 3.0;    // Alert at 3.0+ frequency
    case '1cr_plus':
      return 3.5;    // Alert at 3.5+
    case '50l_plus':
      return 4.0;    // Alert at 4.0+
    default:
      return 4.5;    // Alert at 4.5+ for starter brands
  }
}

// ============================================================================
// Recommendations
// ============================================================================

export function createRecommendation(
  clientId: string,
  agentType: string,
  recommendationType: string,
  recommendationData: any,
): AgentRecommendation {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO agent_recommendations (
      id, client_id, agent_type, recommendation_type, recommendation_data, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, clientId, agentType, recommendationType, JSON.stringify(recommendationData), now);

  return {
    id,
    clientId,
    agentType,
    recommendationType,
    recommendationData,
    deliveredVia: null,
    deliveredAt: null,
    outcomeStatus: 'pending',
    outcomeData: null,
    outcomeRecordedAt: null,
    createdAt: now,
  };
}

export function markRecommendationDelivered(id: string, via: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE agent_recommendations
    SET delivered_via = ?, delivered_at = ?
    WHERE id = ?
  `).run(via, new Date().toISOString(), id);
}

export function recordRecommendationOutcome(
  id: string,
  status: 'adopted' | 'ignored' | 'failed',
  outcomeData?: any,
): void {
  const db = getDb();
  db.prepare(`
    UPDATE agent_recommendations
    SET outcome_status = ?, outcome_data = ?, outcome_recorded_at = ?
    WHERE id = ?
  `).run(status, outcomeData ? JSON.stringify(outcomeData) : null, new Date().toISOString(), id);
}

export function getPendingRecommendations(clientId: string): AgentRecommendation[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM agent_recommendations
    WHERE client_id = ? AND outcome_status = 'pending' AND delivered_at IS NOT NULL
    ORDER BY created_at DESC
  `).all(clientId) as any[];  // DB-2: typed when row becomes a Drizzle result

  return rows.map(row => ({
    id: row.id,
    clientId: row.client_id,
    agentType: row.agent_type,
    recommendationType: row.recommendation_type,
    recommendationData: JSON.parse(row.recommendation_data),
    deliveredVia: row.delivered_via,
    deliveredAt: row.delivered_at,
    outcomeStatus: row.outcome_status,
    outcomeData: row.outcome_data ? JSON.parse(row.outcome_data) : null,
    outcomeRecordedAt: row.outcome_recorded_at,
    createdAt: row.created_at,
  }));
}

// ============================================================================
// Helpers
// ============================================================================

function mapRowToClient(row: any): ServiceClient {
  return {
    id: row.id,
    brandName: row.brand_name,
    category: row.category,
    revenueLevel: row.revenue_level,
    pricePointMin: row.price_point_min,
    pricePointMax: row.price_point_max,
    metaAdAccountId: row.meta_ad_account_id,
    shopifyStore: row.shopify_store,
    slackChannel: row.slack_channel,
    whatsappNumber: row.whatsapp_number,
    alertThreshold: row.alert_threshold,
    serviceTier: row.service_tier,
    contractStart: row.contract_start,
    contractEnd: row.contract_end,
    monthlyFee: row.monthly_fee,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// Context for Agents - Get full client context for AI agents
// ============================================================================

export interface ClientContext {
  client: ServiceClient;
  competitorIntel: CompetitorIntelStore | null;
  // Add other agent stores as needed
}

export function getClientContext(clientId: string): ClientContext | null {
  const client = getClient(clientId);
  if (!client) return null;

  return {
    client,
    competitorIntel: getCompetitorIntelStore(clientId),
  };
}

// Category to actual search queries mapping
const CATEGORY_QUERY_MAP: Record<string, string[]> = {
  // Ethnic menswear
  'premium_ethnic_menswear': [
    'sherwani india',
    'kurta men india',
    'wedding wear men',
    'ethnic wear men',
    'designer kurta',
    'indo western men',
    'mens ethnic fashion',
    'bandhgala',
    'jodhpuri suit',
    'nehru jacket men',
  ],
  'ethnic_menswear': [
    'kurta men',
    'ethnic wear men india',
    'wedding kurta',
    'festive wear men',
  ],
  // Women's ethnic
  'ethnic_womenswear': [
    'saree india',
    'lehenga india',
    'salwar kameez',
    'anarkali',
    'designer saree',
  ],
  // Jewelry
  'jewelry': [
    'gold jewelry india',
    'diamond jewelry',
    'artificial jewelry india',
    'bridal jewelry',
  ],
  // Skincare/Beauty
  'skincare': [
    'skincare india',
    'face serum india',
    'natural skincare',
    'ayurvedic skincare',
  ],
  'beauty': [
    'makeup india',
    'cosmetics india',
    'lipstick india',
  ],
  // Home decor
  'home_decor': [
    'home decor india',
    'furniture india',
    'bedsheet india',
    'curtains india',
  ],
  // Fashion general
  'fashion': [
    'fashion india',
    'clothing india',
    'designer wear india',
  ],
  'menswear': [
    'mens fashion india',
    'shirts men india',
    'jeans men india',
  ],
  'womenswear': [
    'womens fashion india',
    'dresses women india',
    'tops women india',
  ],
};

/**
 * Get appropriate search queries for a client's category and level
 */
export function getSearchQueriesForClient(client: ServiceClient): string[] {
  const queries: string[] = [];

  // Use category-specific queries if available
  if (client.category && CATEGORY_QUERY_MAP[client.category]) {
    queries.push(...CATEGORY_QUERY_MAP[client.category]);
  } else if (client.category) {
    // Fallback: use category as-is but make it searchable
    const readable = client.category.replace(/_/g, ' ');
    queries.push(readable);
    queries.push(`${readable} india`);
  }

  // Add premium/luxury variants for scaled brands
  if (client.revenueLevel === '1cr_plus' || client.revenueLevel === '5cr_plus') {
    // Add "luxury" and "designer" variants of first 3 queries
    for (const q of queries.slice(0, 3)) {
      queries.push(`luxury ${q}`);
      queries.push(`designer ${q}`);
    }
  }

  return [...new Set(queries)]; // Dedupe
}

/**
 * Filter ads based on client level - don't show small player ads to scaled brands
 */
export function isAdRelevantForClient(
  client: ServiceClient,
  adDaysRunning: number,
  estimatedScale: 'small' | 'medium' | 'large',
): boolean {
  // For 1Cr+ brands, only show ads running 60+ days from medium/large players
  if (client.revenueLevel === '1cr_plus' || client.revenueLevel === '5cr_plus') {
    if (adDaysRunning < 60) return false;
    if (estimatedScale === 'small') return false;
  }

  // For 50L+ brands, show 30+ days from medium/large
  if (client.revenueLevel === '50l_plus') {
    if (adDaysRunning < 30) return false;
    if (estimatedScale === 'small') return false;
  }

  // For smaller brands, any proven ad (30+ days) is useful
  if (adDaysRunning < 30) return false;

  return true;
}
