/**
 * Quality Gate — shared types (leaf module, no runtime deps)
 */

/**
 * Evidence — The proof behind every recommendation.
 * No recommendation should exist without traceable evidence.
 */
export interface Evidence {
  metric: string;           // e.g., 'CPA', 'CTR', 'ROAS', 'OOS_count'
  currentValue: number;     // Current measured value
  comparisonValue?: number; // Previous value or threshold for comparison
  comparisonType?: 'threshold' | 'previous_period' | 'benchmark' | 'target';
  changePercent?: number;   // Calculated change (e.g., -40%)
  source: string;           // e.g., 'meta_insights_2024-05-09', 'shopify_inventory'
  timestamp: string;        // ISO timestamp of data
  accountId?: string;       // Which ad account
  entityId?: string;        // Campaign/adset/ad ID
  entityName?: string;      // Human-readable name
}

/**
 * Confidence factors that influence recommendation reliability
 */
export interface ConfidenceFactors {
  dataFreshness: number;      // 0-1: How recent is the evidence
  signalStrength: number;     // 0-1: How strong is the change
  corroboratingSignals: number; // 0-1: How many signals agree
  historicalAccuracy?: number;  // 0-1: Past prediction accuracy
}

export interface QualityCheckResult {
  passes: boolean;
  score: number; // 0-100
  reasons: string[];
  filtered?: string; // If filtered, why
  confidence?: number; // 0-1 confidence score
  confidenceFactors?: ConfidenceFactors;
  evidenceQuality?: 'strong' | 'moderate' | 'weak' | 'none';
  requiresHumanReview?: boolean;
}

export interface InsightInput {
  text: string;
  category?: string;
  basedOn?: string[]; // What signals contributed
  confidence?: number;
  evidence?: Evidence[]; // Required for production-grade insights
}

export interface DecisionInput {
  type: string;
  reasoning: string;
  suggestedAction: string;
  targetName: string;
  basedOn?: string[];
  evidence?: Evidence[]; // Required for production-grade decisions
  urgency?: string;
}

export interface QualityGateConfig {
  minScore: number; // 0-100, default 60
  requireSynthesis: boolean; // Must combine 2+ signals
  allowObvious: boolean; // If false, filter obvious insights
  strictMode: boolean; // If true, reject marginal cases
}
