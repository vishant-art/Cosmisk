/**
 * Ad Watchdog — shared types and validation constants (leaf module).
 *
 * These interfaces and the VALID_* constant sets are the single source of
 * truth shared across the decomposed modules. They are imported, never
 * duplicated.
 */

export interface AccountSnapshot {
  accountId: string;
  accountName: string;
  week: {
    spend: number; roas: number; cpa: number; ctr: number;
    impressions: number; conversions: number; revenue: number;
  };
  month: {
    spend: number; roas: number; cpa: number; ctr: number;
    impressions: number; conversions: number; revenue: number;
  };
  campaigns: Array<{
    name: string; spend: number; roas: number; cpa: number;
    ctr: number; conversions: number; impressions: number;
    roasTrend: string; cpaTrend: string; ctrTrend: string;
    confidence: string;
  }>;
  dailyRoas: number[];
  dailySpend: number[];
}

export interface WatchdogDecision {
  type: string;
  targetId: string;
  targetName: string;
  reasoning: string;
  confidence: 'high' | 'moderate' | 'low';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  suggestedAction: string;
  estimatedImpact: string;
}

export const VALID_ACTIONS = new Set(['pause', 'reduce_budget', 'increase_budget', 'new_creative', 'monitor']);
export const VALID_CONFIDENCES = new Set(['high', 'moderate', 'low']);
export const VALID_URGENCIES = new Set(['low', 'medium', 'high', 'critical']);

export interface CreativeAnalysisRow {
  adId: string;
  adName: string;
  creativeType: 'static' | 'video' | 'carousel' | 'catalog' | 'unknown';
  hookText: string;
  hookPattern: string;
  ctr: number;
  spend: number;
  impressions: number;
  imageUrl: string | null;
  videoId: string | null;
}

export interface ClientWatchdogReport {
  clientId: string;
  clientName: string;
  revenueLevel: string;
  accountName: string;
  decisions: WatchdogDecision[];
  filteredDecisions: WatchdogDecision[];  // After urgency filtering
  oosReport?: any;
  leakageReport?: any;
  shouldAlert: boolean;
  alertReason?: string;
  runAt: string;
}
