/**
 * Creative Intelligence System — Cosmisk
 * Shared types & interfaces (leaf module — no runtime imports).
 */

import type { AUTO_REJECTION_CONDITIONS } from './rejection-conditions.js';

export type RejectionCondition = typeof AUTO_REJECTION_CONDITIONS[number];

/**
 * Core quality question: "Would this creative impress a top-tier D2C founder?"
 */
export interface CreativeQualityCheck {
  creativeId: string;
  passesFounderTest: boolean;  // Would a top-tier D2C founder be impressed?
  sophisticationScore: number;  // 0-100
  rejectionConditions: RejectionCondition[];
  qualityVerdict: 'approve' | 'revise' | 'reject';
  verdictReason: string;
}

/**
 * The reasoning engine must understand these before generating
 */
export interface CreativeReasoningContext {
  clientId: string;

  // Strategic understanding
  whatCreativeShouldExistNext: string;
  emotionalAngleToTest: string;
  formatForAudience: string;
  typographyStyle: string;

  // Pattern awareness
  saturatingHooks: string[];
  shiftingAudiencePsychology: string[];
  emergingCompetitorPatterns: string[];
  productsDeservingAttention: string[];

  // Evidence backing
  evidenceSources: string[];
  confidenceLevel: number;
}

/**
 * Cross-agent intelligence synthesis — creatives receive intelligence from all agents
 */
export interface CrossAgentCreativeContext {
  clientId: string;
  lastUpdated: string;

  // Agent signals
  fatigueSignals: {
    fatiguedCreatives: string[];
    daysToFatigue: number;
    urgentRefreshNeeded: boolean;
  };

  ltvSignals: {
    highLtvHookTypes: string[];
    lowLtvHookTypes: string[];
    ltvMultiplierByFormat: Record<string, number>;
  };

  cohortSignals: {
    repeatBuyerCreatives: string[];
    onePurchaseTrapCreatives: string[];
    bestCohortFormats: string[];
  };

  competitorSignals: {
    competitorGaps: string[];
    emergingAngles: string[];
    saturatedAngles: string[];
  };

  audienceSignals: {
    shiftingPreferences: string[];
    emergingDemographics: string[];
    decliningSentiments: string[];
  };

  retentionSignals: {
    highRetentionHooks: string[];
    lowRetentionHooks: string[];
  };

  emotionalSignals: {
    resonatingEmotions: string[];
    failingEmotions: string[];
    untestedEmotions: string[];
  };

  pricingSignals: {
    effectivePriceFraming: string[];
    failingPriceFraming: string[];
  };

  productSignals: {
    trendingProducts: string[];
    understockedProducts: string[];
    highMarginProducts: string[];
  };

  performanceSignals: {
    winningPatterns: string[];
    losingPatterns: string[];
    untestedCombinations: string[];
  };

  // Synthesized recommendation
  synthesisOutput: {
    nextCreativeRecommendation: string;
    confidence: number;
    reasoning: string;
  };
}

/**
 * Quality validation layers
 */
export interface QualityValidation {
  creativeId: string;
  validatedAt: string;

  // Validation scores (0-100)
  typographyScore: number;
  sophisticationScore: number;
  premiumAestheticScore: number;
  emotionalImpactScore: number;
  brandConsistencyScore: number;
  aiArtifactScore: number;  // Lower is better (0 = no AI artifacts)
  layoutIntelligenceScore: number;
  competitorBenchmarkScore: number;

  // Overall
  overallQualityScore: number;
  qualityTier: 'premium' | 'acceptable' | 'needs_work' | 'reject';

  // Rejection
  autoRejected: boolean;
  rejectionReasons: RejectionCondition[];

  // Benchmark
  comparedToBrands: string[];
  percentileVsBenchmark: number;
}

/**
 * Dimensions that evolve over time
 */
export type EvolutionDimension =
  | 'hooks'
  | 'layouts'
  | 'messaging'
  | 'emotional_structures'
  | 'visual_identity'
  | 'creative_formats'
  | 'audience_targeting'
  | 'creative_pacing';

/**
 * An evolution event
 */
export interface CreativeEvolution {
  id: string;
  clientId: string;
  recordedAt: string;
  dimension: EvolutionDimension;
  previousState: string;
  newState: string;
  triggerSignals: string[];
  confidence: number;
  applied: boolean;
  outcome?: 'positive' | 'neutral' | 'negative';
}

/**
 * Category-specific creative knowledge
 */
export interface CategoryKnowledge {
  category: string;
  updatedAt: string;
  aestheticPatterns: string[];
  typographyPatterns: string[];
  hookPatterns: string[];
  emotionalTriggers: string[];
  pricingPsychology: Record<string, string>;
  trustStructures: string[];
  visualHierarchy: string[];
  benchmarkBrands: string[];
  antiPatterns: string[];
}

/**
 * Human review request
 */
export interface HumanReviewRequest {
  id: string;
  clientId: string;
  createdAt: string;
  reviewType: 'approval' | 'escalation' | 'strategic_override' | 'premium_review' | 'brand_protection' | 'high_risk';
  creativeId: string;
  reason: string;
  aiRecommendation: string;
  aiConfidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  reviewerNotes?: string;
  reviewedAt?: string;
}
