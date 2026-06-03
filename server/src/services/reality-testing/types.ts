/**
 * Reality Testing — shared types (leaf module, no runtime imports)
 */

// ============================================================================
// 1. INTELLIGENCE VALIDATION SYSTEMS
// ============================================================================

/**
 * Metrics we track to validate intelligence quality
 */
export interface IntelligenceMetrics {
  clientId: string;
  period: string;  // "2024-01", "2024-W15", etc.
  generatedAt: string;

  // Core metrics
  recommendationUsefulness: number;     // 0-100, based on operator ratings
  strategicAccuracy: number;            // 0-100, predictions that came true
  operatorTrust: number;                // 0-100, explicit trust signals
  wowFactorScore: number;               // 0-100, insights marked as "non-obvious"
  insightUniqueness: number;            // 0-100, not available elsewhere
  predictionUsefulness: number;         // 0-100, predictions that led to action
  executionLeverage: number;            // 0-100, time saved / value created
  decisionQualityImprovement: number;   // 0-100, before/after comparison

  // Behavioral metrics
  insightAdoptionRate: number;          // % of insights acted upon
  recommendationFollowThrough: number;  // % of recommendations completed
  decisionSpeedImprovement: number;     // % faster decisions
  creativeHitRateImprovement: number;   // % better creative performance

  // Engagement metrics
  sessionFrequency: number;             // Sessions per week
  timeInPlatform: number;               // Minutes per session
  featureUsageDepth: number;            // Features used / features available
  returnAfterInsight: number;           // % return within 24h of insight

  // Overall health
  overallScore: number;
  trend: 'improving' | 'stable' | 'declining';
  riskFlags: string[];
}

/**
 * A single recommendation with tracking
 */
export interface TrackedRecommendation {
  id: string;
  clientId: string;
  createdAt: string;

  // The recommendation
  type: string;
  headline: string;
  recommendation: string;
  confidence: number;
  urgency: string;

  // Tracking
  wasViewed: boolean;
  viewedAt?: string;
  wasActedUpon?: boolean;
  actedUponAt?: string;
  actionTaken?: string;

  // Outcome
  outcomeTracked?: boolean;
  outcomePositive?: boolean;
  outcomeNotes?: string;

  // Operator feedback
  operatorRating?: 1 | 2 | 3 | 4 | 5;
  operatorFeedback?: string;
  markedAsObvious?: boolean;
  markedAsUseless?: boolean;
  markedAsNonObvious?: boolean;

  // Validation
  validatedAt?: string;
  validationScore?: number;
}

// ============================================================================
// 2. FAKE INTELLIGENCE DETECTION
// ============================================================================

/**
 * Fake intelligence indicators
 */
export interface FakeIntelligenceAlert {
  id: string;
  clientId: string;
  detectedAt: string;

  // What we detected
  alertType: FakeIntelligenceType;
  severity: 'warning' | 'critical';
  description: string;

  // Evidence
  indicators: string[];
  affectedInsights: string[];

  // Remediation
  suggestedAction: string;
  autoAction?: string;
}

export type FakeIntelligenceType =
  | 'sounds_smart_useless'
  | 'too_obvious'
  | 'repetitive'
  | 'generic_predictions'
  | 'fluff_narratives'
  | 'no_action_taken';

/**
 * Detection patterns for fake intelligence
 */
export interface FakeIntelligencePattern {
  type: FakeIntelligenceType;
  detect: (context: FakeIntelligenceContext) => boolean;
  severity: 'warning' | 'critical';
  description: string;
  suggestedAction: string;
}

export interface FakeIntelligenceContext {
  clientId: string;
  recentRecommendations: TrackedRecommendation[];
  metrics?: IntelligenceMetrics;
  recentInsightTexts?: string[];
}

// ============================================================================
// 3. HUMAN FEEDBACK LOOPS
// ============================================================================

/**
 * Operator feedback on a recommendation
 */
export interface OperatorFeedback {
  id: string;
  recommendationId: string;
  clientId: string;
  operatorId: string;
  submittedAt: string;

  // Rating
  rating: 1 | 2 | 3 | 4 | 5;
  ratingDimensions?: {
    actionability: 1 | 2 | 3 | 4 | 5;
    accuracy: 1 | 2 | 3 | 4 | 5;
    timeliness: 1 | 2 | 3 | 4 | 5;
    uniqueness: 1 | 2 | 3 | 4 | 5;
  };

  // Qualitative
  feedbackType: 'helpful' | 'not_helpful' | 'obvious' | 'wrong' | 'late' | 'other';
  freeformFeedback?: string;

  // Corrections
  operatorCorrection?: string;
  operatorAlternative?: string;

  // Disagreement
  disagreedWith?: string;
  disagreementReason?: string;

  // Learning signals
  shouldHaveKnown?: boolean;
  alreadyDidThis?: boolean;
  willTryThis?: boolean;
}

/**
 * Aggregated feedback insights
 */
export interface FeedbackInsights {
  clientId: string;
  period: string;
  generatedAt: string;

  // Summary stats
  totalFeedback: number;
  averageRating: number;
  positivePercent: number;
  negativePercent: number;

  // By dimension
  dimensionScores: {
    actionability: number;
    accuracy: number;
    timeliness: number;
    uniqueness: number;
  };

  // Common issues
  topIssues: Array<{
    issue: string;
    count: number;
    percent: number;
  }>;

  // Corrections received
  correctionsCount: number;
  topCorrections: string[];

  // Learning recommendations
  learningSignals: string[];
}

// ============================================================================
// 4. OPERATOR BEHAVIOR LEARNING
// ============================================================================

/**
 * Operator behavior event
 */
export interface BehaviorEvent {
  id: string;
  clientId: string;
  operatorId: string;
  timestamp: string;

  // Event type
  eventType: BehaviorEventType;
  context: string;

  // Details
  itemId?: string;
  itemType?: string;
  action?: string;
  duration?: number;  // ms
  metadata?: Record<string, unknown>;
}

export type BehaviorEventType =
  | 'view_insight'
  | 'dismiss_insight'
  | 'act_on_insight'
  | 'ignore_insight'
  | 'expand_detail'
  | 'collapse_detail'
  | 'rate_insight'
  | 'share_insight'
  | 'session_start'
  | 'session_end'
  | 'feature_use'
  | 'search'
  | 'filter_change';

/**
 * Operator behavior profile
 */
export interface OperatorProfile {
  operatorId: string;
  clientId: string;
  lastUpdated: string;

  // Engagement patterns
  preferredTimes: string[];  // Hours of day
  avgSessionDuration: number;  // minutes
  sessionsPerWeek: number;

  // Content preferences
  preferredInsightTypes: string[];
  ignoredInsightTypes: string[];
  preferredDetailLevel: 'tldr' | 'summary' | 'detailed';
  urgencyThreshold: 'all' | 'high_only' | 'critical_only';

  // Decision patterns
  avgDecisionTime: number;  // ms from view to action
  actionRate: number;  // % of viewed insights acted upon
  feedbackRate: number;  // % of insights rated

  // Learning signals
  learningVelocity: 'fast' | 'moderate' | 'slow';
  trustLevel: 'high' | 'growing' | 'skeptical';

  // Personalization signals
  shouldSimplify: boolean;
  wantsMoreDetail: boolean;
  prefersVisual: boolean;
  needsUrgency: boolean;
}

// ============================================================================
// 5. DEPLOYMENT RISK MITIGATION
// ============================================================================

/**
 * Deployment risk types
 */
export type DeploymentRisk =
  | 'overtrust'
  | 'undertrust'
  | 'insight_fatigue'
  | 'recommendation_overload'
  | 'strategic_confusion'
  | 'false_confidence'
  | 'prediction_drift'
  | 'intelligence_decay'
  | 'operator_dependency'
  | 'organizational_resistance';

/**
 * Risk assessment for a client
 */
export interface RiskAssessment {
  clientId: string;
  assessedAt: string;

  // Overall risk level
  overallRisk: 'low' | 'moderate' | 'high' | 'critical';

  // Individual risks
  risks: Array<{
    type: DeploymentRisk;
    level: 'low' | 'moderate' | 'high';
    indicators: string[];
    mitigation: string;
  }>;

  // Recommendations
  priorityActions: string[];
}

// ============================================================================
// COMBINED: Reality Testing Package
// ============================================================================

/**
 * Complete reality testing package
 */
export interface RealityTestingPackage {
  clientId: string;
  generatedAt: string;

  // Validation
  intelligenceMetrics: IntelligenceMetrics;
  validationSummary: string;

  // Quality
  fakeIntelligenceAlerts: FakeIntelligenceAlert[];
  qualityStatus: 'healthy' | 'warning' | 'critical';

  // Feedback
  feedbackInsights: FeedbackInsights;
  learningSignals: string[];

  // Behavior
  operatorProfile?: OperatorProfile;
  personalizationRecommendations: string[];

  // Risk
  riskAssessment: RiskAssessment;

  // Action items
  priorityActions: string[];
}
