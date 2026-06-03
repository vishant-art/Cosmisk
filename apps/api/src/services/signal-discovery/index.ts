/**
 * Signal Discovery — universal data-source query layer (stub).
 *
 * The strategic-cognition cluster (causal-intelligence,
 * competing-hypotheses, recursive-investigator, strategic-curiosity) treats
 * this module as a unified entry point for asking "what does data source X
 * say about metric Y?" across Meta, Shopify, audience-overlap, competitor
 * intel, and more.
 *
 * Production version: queries Meta Insights API, Shopify Admin GraphQL,
 * audience-overlap reports, etc. with caching + a session ledger.
 *
 * Stub behaviour: every query returns a `success: false` result so the
 * downstream `if (!data.success) return null;` guards in the strategic-
 * cognition detectors short-circuit cleanly. No real I/O happens; this is
 * type plumbing only.
 */

import { logger } from '../../utils/logger.js';
import type { MetaApiService } from '../meta-api.js';
import type { ShopifyClient } from '../shopify-client.js';

// ============================================================================
// SignalSource — every string literal observed in strategic-cognition/*.
// Keep this union additive: adding new sources is safe; removing breaks
// every dataSource: 'foo' assignment.
// ============================================================================

// Exactly the 14 sources keyed in competing-hypotheses.ts's
// `Record<SignalSource, string>` method map. Keep this union in lock-step
// with that map: adding a source needs both edits, removing requires
// updating the map too. Other categorical strings used inside the
// strategic-cognition cluster (e.g. CausalNode.type's 'observable' /
// 'latent') are unrelated enums, NOT SignalSource members.
export type SignalSource =
  | 'meta_ads'
  | 'meta_ad_comments'
  | 'shopify_orders'
  | 'shopify_customers'
  | 'shopify_inventory'
  | 'creative_performance'
  | 'audience_overlap'
  | 'competitor_intel'
  | 'discount_tracking'
  | 'cohort_analysis'
  | 'attribution_data'
  | 'creator_performance'
  | 'funnel_behavior'
  | 'pricing_data';

// ============================================================================
// SignalResult — minimum shape required by every detector in
// strategic-cognition/strategic-curiosity.ts (which reads .success and
// .dataPoints). Adding extra fields below is safe.
// ============================================================================

export interface SignalResult {
  source: SignalSource;
  success: boolean;
  dataPoints: number;
  metric?: string;
  value?: number | string;
  raw?: unknown;
  fetchedAt?: Date;
  notes?: string;
}

export interface SignalQuery {
  source: SignalSource;
  metric?: string;
  method?: string;                 // strategic-cognition cluster passes a method discriminator
  window?: { startDate: string; endDate: string };
  filters?: Record<string, unknown>;
  [key: string]: unknown;          // permissive — call sites pass varying ad-hoc fields
}

// ============================================================================
// SignalDiscoveryService — class used as a member field in every strategic
// engine. We export the methods called externally: initialize(),
// startSession(), query().
// ============================================================================

export class SignalDiscoveryService {
  private metaApi: MetaApiService | null = null;
  private shopify: ShopifyClient | null = null;
  private sessionActive: boolean = false;

  constructor(
    public readonly clientId: string,
    public readonly monthlySpend: number,
  ) {}

  // initialize() accepts undefined to mirror real-world boot paths where
  // either client may not yet be available (e.g. clients without Shopify).
  initialize(metaApi: MetaApiService | undefined, shopify: ShopifyClient | undefined): void {
    this.metaApi = metaApi ?? null;
    this.shopify = shopify ?? null;
    logger.debug(
      { clientId: this.clientId, hasMeta: !!metaApi, hasShopify: !!shopify },
      '[signal-discovery] initialize stub — clients stored, no calls made',
    );
  }

  startSession(): void {
    this.sessionActive = true;
    logger.debug({ clientId: this.clientId }, '[signal-discovery] startSession stub');
  }

  async query(q: SignalQuery): Promise<SignalResult> {
    logger.debug(
      { clientId: this.clientId, source: q.source, sessionActive: this.sessionActive },
      '[signal-discovery] query stub — returning success:false',
    );
    return {
      source: q.source,
      success: false,
      dataPoints: 0,
      metric: q.metric,
      fetchedAt: new Date(),
      notes: 'signal-discovery stub — production data sources not yet wired',
    };
  }
}

export function createSignalDiscovery(
  clientId: string,
  monthlySpend: number,
): SignalDiscoveryService {
  return new SignalDiscoveryService(clientId, monthlySpend);
}
