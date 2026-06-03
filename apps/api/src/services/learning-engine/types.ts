/**
 * Learning Engine — Types
 *
 * Shared type definitions for the learning engine modules.
 */

// ============================================================================
// Public Types
// ============================================================================

export interface CreativeGuidance {
  // What to create
  recommendedFormats: string[];
  recommendedHooks: string[];
  recommendedAngles: string[];

  // Visual direction
  visualDirection: {
    style: string;
    typography: string;
    colorMood: string;
    layoutType: string;
  };

  // What to avoid
  avoid: string[];
  avoidReasons: Record<string, string>; // avoid -> why

  // Context
  reasoning: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-100
  basedOn: string[]; // What data sources informed this
}

export interface ClientPlaybook {
  clientId: string;
  lastUpdated: string;

  // Learned patterns
  winningPatterns: {
    format: string;
    avgRoas: number;
    avgLtv: number;
    sampleSize: number;
    confidence: 'high' | 'medium' | 'low';
  }[];

  losingPatterns: {
    format: string;
    avgRoas: number;
    returnRate: number;
    sampleSize: number;
    reason: string;
  }[];

  // Fatigue patterns
  fatiguePatterns: {
    format: string;
    avgDaysToFatigue: number;
    warningSignals: string[];
  }[];

  // Audience insights
  audienceInsights: {
    highLtvSources: string[];
    lowLtvSources: string[];
    repeatBuyerCreatives: string[];
    onePurchaseTrap: string[]; // Creatives that attract one-time buyers
  };

  // Competitor gaps
  competitorGaps: string[];
  competitorTrends: string[];
}

export interface Prediction {
  type: 'fatigue' | 'roas_decline' | 'cpa_spike' | 'opportunity';
  prediction: string;
  confidence: number;
  timeframe: string;
  basedOn: string[];
  suggestedAction: string;
}

/**
 * Stored prediction with tracking for accuracy measurement
 */
export interface StoredPrediction extends Prediction {
  id: string;
  clientId: string;
  createdAt: string;
  expiresAt: string; // When to verify
  expectedOutcome: {
    metric: string;       // e.g., 'ROAS', 'CPA', 'CTR'
    direction: 'increase' | 'decrease' | 'stable';
    minChange?: number;   // Minimum % change expected
    targetValue?: number; // Or specific target value
  };
  status: 'pending' | 'verified_correct' | 'verified_incorrect' | 'expired';
  verifiedAt?: string;
  actualOutcome?: {
    metric: string;
    actualValue: number;
    previousValue: number;
    changePercent: number;
  };
}

/**
 * Prediction accuracy stats by type
 */
export interface PredictionAccuracy {
  type: Prediction['type'];
  totalPredictions: number;
  correctPredictions: number;
  incorrectPredictions: number;
  pendingPredictions: number;
  accuracyRate: number; // 0-1
  avgConfidenceWhenCorrect: number;
  avgConfidenceWhenIncorrect: number;
}

/**
 * Items flagged for human review
 */
export interface HumanReviewItem {
  id: string;
  clientId: string;
  type: 'low_confidence_decision' | 'contradictory_signals' | 'unusual_pattern' | 'high_impact_action';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdAt: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  reviewedAt?: string;
  reviewedBy?: string;
  resolution?: string;
}

export interface LearningEngineOutput {
  clientId: string;
  generatedAt: string;
  guidance: CreativeGuidance;
  playbook: ClientPlaybook;
  predictions: Prediction[];
  qualityScore: number; // 0-100, how much data backed this
}

// ============================================================================
// Internal Data Aggregation Types (from existing analyzers)
// ============================================================================

export interface LTVByCreativeData {
  creativeId: string;
  creativeName: string;
  hookType: string;
  avgLtv: number;
  repeatRate: number;
  customers: number;
}

export interface CreativeReturnData {
  creativeId: string;
  creativeName: string;
  returnRate: number;
  refundAmount: number;
  orders: number;
}

export interface FatigueData {
  campaignId: string;
  campaignName: string;
  daysActive: number;
  ctrDecline: number;
  roasDecline: number;
  fatigueLevel: 'none' | 'early' | 'moderate' | 'severe';
}

export interface CompetitorData {
  dominantHooks: string[];
  dominantFormats: string[];
  gaps: string[];
  trends: string[];
}
