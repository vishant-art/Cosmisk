/**
 * Operator Experience Intelligence — shared types (leaf module)
 *
 * Holds every type declaration used across the operator-experience modules.
 * No runtime logic lives here, so it can be imported freely without creating
 * circular dependencies.
 */

import type { Evidence } from '../quality-gate.js';
import type { ClientPlaybook } from '../learning-engine.js';

// ============================================================================
// 1. NARRATIVE INTELLIGENCE
// ============================================================================

/**
 * Narrative template for different insight types
 */
export interface NarrativeTemplate {
  type: string;
  pattern: string;           // Recognition pattern
  template: string;          // Narrative structure with placeholders
  emotionalHook: string;     // What makes operator pause
  actionFrame: string;       // How to frame the action
}

/**
 * A fully formed narrative insight
 */
export interface NarrativeInsight {
  headline: string;          // 10 words max, punchy
  narrative: string;         // Full story (2-4 sentences)
  emotionalHook: string;     // What makes this non-obvious
  evidence: Evidence[];      // Backing data
  confidence: number;
  urgency: 'act_now' | 'this_week' | 'this_month' | 'when_ready';
  actionStatement: string;   // Clear next step
  alternativeAction?: string; // If they don't want primary action
  whatIfNothing: string;     // Cost of inaction
}

// ============================================================================
// 2. HIDDEN OPPORTUNITY SURFACING
// ============================================================================

/**
 * A hidden opportunity that humans wouldn't find themselves
 */
export interface HiddenOpportunity {
  id: string;
  title: string;
  description: string;
  whyHidden: string;          // Why a human wouldn't see this
  signalsCombined: string[];  // What data sources revealed this
  potentialUpside: string;    // Quantified if possible
  confidence: number;
  actionSteps: string[];
  timeToCapture: string;      // How long until opportunity closes
  lastTested?: string;        // When they last tried this (if ever)
}

export interface CrossSignalData {
  clientId: string;
  playbook?: ClientPlaybook;
  recentDecisions?: Array<{ type: string; target: string; timestamp: string }>;
  competitorData?: { gaps: string[]; trends: string[] };
  fatigueData?: Array<{ format: string; daysActive: number }>;
  ltvData?: Array<{ hookType: string; avgLtv: number; repeatRate: number }>;
  lastCreativeTest?: { format: string; date: string };
}

/**
 * Cross-signal opportunity patterns
 */
export interface OpportunityPattern {
  name: string;
  signals: string[];          // What signals to combine
  condition: (data: CrossSignalData) => boolean;
  generate: (data: CrossSignalData) => HiddenOpportunity | null;
}

// ============================================================================
// 3. STRATEGIC TIMING
// ============================================================================

/**
 * Time-sensitive intelligence with urgency framing
 */
export interface TimedIntelligence {
  id: string;
  title: string;
  description: string;
  windowOpens: string;        // When to act (might be "now")
  windowCloses: string;       // When opportunity expires
  daysRemaining: number;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  costOfDelay: string;        // What you lose per day of delay
  optimalTiming: string;      // Best time to act
  whyNow: string;             // Why this specific timing matters
}

// ============================================================================
// COMBINED: Full Operator Intelligence Package
// ============================================================================

/**
 * Complete intelligence package for an operator
 */
export interface OperatorIntelligencePackage {
  generatedAt: string;
  clientId: string;

  // The One Thing
  theOneThing: {
    action: string;
    narrative: string;
    urgency: TimedIntelligence['urgencyLevel'];
    whyThisAboveAll: string;
  } | null;

  // Narrative insights (top 3)
  narrativeInsights: NarrativeInsight[];

  // Hidden opportunities
  hiddenOpportunities: HiddenOpportunity[];

  // Timing brief
  timingBrief: string;
  timedItems: TimedIntelligence[];

  // Trust indicators
  confidenceScore: number;
  evidenceCount: number;
  predictionAccuracy?: number;
}

// ============================================================================
// TIER 2: ROLE-BASED INTELLIGENCE
// ============================================================================

/**
 * Operator persona types — each sees intelligence differently
 */
export type OperatorPersona = 'founder' | 'media_buyer' | 'creative_strategist' | 'growth_lead';

/**
 * Persona configuration — what each role cares about
 */
export interface PersonaConfig {
  persona: OperatorPersona;
  title: string;
  focusAreas: string[];
  metricsEmphasis: string[];
  decisionContext: string;
  urgencyThreshold: number;  // 0-1, higher = only show critical
  detailLevel: 'executive' | 'tactical' | 'detailed';
}

/**
 * Role-specific briefing
 */
export interface RoleBriefing {
  persona: OperatorPersona;
  title: string;
  generatedAt: string;

  // The single most important thing for this role
  theOneThing: {
    action: string;
    whyYou: string;  // Why this matters to YOUR role specifically
    impact: string;
  } | null;

  // Filtered and reframed insights for this role
  relevantInsights: Array<{
    headline: string;
    relevance: string;  // Why this matters to this persona
    action: string;
    urgency: NarrativeInsight['urgency'];
  }>;

  // Role-specific metrics summary
  keyMetrics: Array<{
    metric: string;
    value: string;
    change: string;
    interpretation: string;  // What this means for this role
  }>;

  // Questions this persona should be asking
  strategicQuestions: string[];
}

// ============================================================================
// TIER 2: DECISION COMPRESSION
// ============================================================================

/**
 * Decision compression levels
 */
export type CompressionLevel = 'one_thing' | 'top_three' | 'full_context';

/**
 * Compressed decision package
 */
export interface CompressedDecision {
  level: CompressionLevel;

  // THE ONE THING — if you do nothing else, do this
  theOneThing: {
    action: string;
    deadline: string;
    impact: string;
    confidence: number;
  } | null;

  // Top 3 if they want more
  topThree?: Array<{
    rank: 1 | 2 | 3;
    action: string;
    type: 'protect' | 'grow' | 'optimize';  // Category
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
  }>;

  // Full context if drilling down
  fullContext?: {
    actions: Array<{
      action: string;
      category: string;
      evidence: string;
      blockers?: string[];
    }>;
    skipList: string[];  // Actions we filtered out and why
  };
}

export interface ScoredAction {
  action: string;
  score: number;
  deadline: string;
  impactStatement: string;
  type: 'protect' | 'grow' | 'optimize';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  evidence: string;
  blockers?: string[];
}

// ============================================================================
// TIER 2: PROGRESSIVE DISCLOSURE
// ============================================================================

/**
 * Disclosure depth levels
 */
export type DisclosureDepth = 'tldr' | 'summary' | 'detailed' | 'full_audit';

/**
 * Progressive disclosure package
 */
export interface ProgressiveDisclosure {
  depth: DisclosureDepth;

  // TL;DR — 1 sentence
  tldr: string;

  // Summary — 3-5 bullet points
  summary?: string[];

  // Detailed — Full narrative with evidence
  detailed?: {
    narrative: string;
    evidence: Evidence[];
    alternatives: string[];
    risks: string[];
  };

  // Full audit trail (for those who want to verify)
  fullAudit?: {
    dataSourcesUsed: string[];
    calculationsPerformed: string[];
    assumptionsMade: string[];
    confidenceBreakdown: Record<string, number>;
  };

  // Drill-down prompts
  canDrillDeeper: boolean;
  nextDepth?: DisclosureDepth;
  drillDownPrompt?: string;
}

// ============================================================================
// COMBINED: Full Tier 2 Package
// ============================================================================

/**
 * Complete Tier 2 intelligence package
 */
export interface Tier2IntelligencePackage {
  generatedAt: string;
  clientId: string;

  // Role-specific briefings
  briefings: Record<OperatorPersona, RoleBriefing>;

  // Compressed decisions at all levels
  decisions: {
    oneThing: CompressedDecision;
    topThree: CompressedDecision;
    fullContext: CompressedDecision;
  };

  // Quick access formats
  fiveMinuteBrief: string;

  // Progressive disclosure for top insight
  topInsightDisclosure: ProgressiveDisclosure;
}

// ============================================================================
// TIER 3: TRUST & ANTICIPATION
// ============================================================================

// ============================================================================
// 3.1 PREDICTION SCORECARDS
// ============================================================================

/**
 * A tracked prediction with outcome
 */
export interface TrackedPrediction {
  id: string;
  clientId: string;
  createdAt: string;

  // The prediction
  prediction: string;
  predictedOutcome: string;
  predictedValue?: number;
  confidence: number;
  timeframe: string;  // "7 days", "30 days", etc.

  // Verification
  verificationDate?: string;
  actualOutcome?: string;
  actualValue?: number;
  wasAccurate?: boolean;
  accuracyScore?: number;  // 0-100, how close was the prediction

  // Context
  evidenceUsed: string[];
  insightType: string;
  actionTaken?: string;
}

/**
 * Prediction scorecard for a client
 */
export interface PredictionScorecard {
  clientId: string;
  generatedAt: string;

  // Overall accuracy
  totalPredictions: number;
  verifiedPredictions: number;
  accuratePredictions: number;
  overallAccuracy: number;  // Percentage

  // By category
  accuracyByType: Record<string, {
    total: number;
    accurate: number;
    accuracy: number;
  }>;

  // Trends
  recentAccuracy: number;  // Last 30 days
  accuracyTrend: 'improving' | 'stable' | 'declining';

  // Trust indicators
  trustScore: number;  // 0-100
  trustLevel: 'high' | 'medium' | 'low' | 'building';
  trustFactors: string[];

  // Recent predictions
  recentPredictions: TrackedPrediction[];

  // Accountability
  bestPredictionTypes: string[];
  worstPredictionTypes: string[];
  improvementAreas: string[];
}

// ============================================================================
// 3.2 COMPETITOR MOVEMENT ALERTS
// ============================================================================

/**
 * Types of competitor movements to track
 */
export type CompetitorMovementType =
  | 'new_creative'
  | 'creative_killed'
  | 'spend_increase'
  | 'spend_decrease'
  | 'new_angle'
  | 'format_shift'
  | 'targeting_change'
  | 'offer_change';

/**
 * A competitor movement alert
 */
export interface CompetitorMovement {
  id: string;
  clientId: string;
  detectedAt: string;

  // Competitor info
  competitorName: string;
  competitorId?: string;

  // Movement details
  movementType: CompetitorMovementType;
  description: string;
  significance: 'high' | 'medium' | 'low';

  // Evidence
  evidence: {
    source: string;
    dataPoint: string;
    comparisonPeriod?: string;
  }[];

  // Strategic implications
  implications: string[];
  suggestedResponse: string;
  responseUrgency: 'immediate' | 'this_week' | 'monitor';

  // Window
  firstMoverWindow?: string;

  // Status
  acknowledged: boolean;
  responseAction?: string;
}

export interface CompetitorSnapshot {
  competitorName: string;
  competitorId?: string;
  capturedAt: string;
  activeAds: number;
  estimatedSpend?: number;
  topFormats: string[];
  topAngles: string[];
  offers: string[];
  newCreatives: number;
  killedCreatives: number;
}

/**
 * Competitor movement detection patterns
 */
export interface MovementPattern {
  type: CompetitorMovementType;
  detect: (current: CompetitorSnapshot, previous: CompetitorSnapshot) => boolean;
  generateAlert: (current: CompetitorSnapshot, previous: CompetitorSnapshot, clientId: string) => CompetitorMovement | null;
}

// ============================================================================
// 3.3 ANTICIPATION ENGINE
// ============================================================================

/**
 * Anticipated need types
 */
export type AnticipatedNeedType =
  | 'creative_refresh'
  | 'budget_decision'
  | 'performance_review'
  | 'competitor_response'
  | 'seasonal_prep'
  | 'scale_decision'
  | 'cost_investigation';

/**
 * An anticipated need
 */
export interface AnticipatedNeed {
  id: string;
  clientId: string;
  anticipatedAt: string;

  // What we anticipate
  needType: AnticipatedNeedType;
  title: string;
  description: string;

  // Why we anticipate it
  triggerSignals: string[];
  confidence: number;

  // When
  expectedTiming: string;
  daysUntil: number;

  // Proactive support
  preemptiveAction: string;
  resourcesReady: string[];

  // Validation
  wasNeeded?: boolean;
  feedbackReceived?: string;
}

/**
 * Anticipation patterns based on signals
 */
export interface AnticipationPattern {
  needType: AnticipatedNeedType;
  signals: string[];
  condition: (context: AnticipationContext) => boolean;
  generate: (context: AnticipationContext) => AnticipatedNeed;
}

export interface AnticipationContext {
  clientId: string;
  daysSinceLastCreative?: number;
  topCreativeAge?: number;
  budgetUtilization?: number;
  performanceTrend?: 'improving' | 'stable' | 'declining';
  daysUntilMonthEnd?: number;
  seasonalEvents?: string[];
  competitorMovements?: CompetitorMovement[];
  recentDecisions?: string[];
}

// ============================================================================
// COMBINED: Full Tier 3 Package
// ============================================================================

/**
 * Complete Tier 3 intelligence package
 */
export interface Tier3IntelligencePackage {
  generatedAt: string;
  clientId: string;

  // Trust & Accountability
  predictionScorecard: PredictionScorecard;
  trustStatement: string;

  // Competitive Intelligence
  competitorMovements: CompetitorMovement[];
  competitorAlertsSummary: string;

  // Anticipation
  anticipatedNeeds: AnticipatedNeed[];
  anticipationBrief: string;

  // Combined trust score
  overallTrustScore: number;
  trustBreakdown: {
    predictionAccuracy: number;
    dataFreshness: number;
    coverageDepth: number;
  };
}

// ============================================================================
// COMPLETE OPERATOR EXPERIENCE PACKAGE
// ============================================================================

/**
 * The complete intelligence package combining all tiers
 */
export interface CompleteOperatorExperience {
  generatedAt: string;
  clientId: string;

  // Tier 1: Wow Moments
  tier1: OperatorIntelligencePackage;

  // Tier 2: Role-Based Intelligence
  tier2: Tier2IntelligencePackage;

  // Tier 3: Trust & Anticipation
  tier3: Tier3IntelligencePackage;

  // Executive summary
  executiveSummary: string;
}
