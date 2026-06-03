/**
 * Strategic Intelligence Engine — Types
 *
 * STRATEGIC DEPTH, NOT TACTICAL RECOMMENDATIONS
 */

/**
 * Audience State — not sentiment, but psychological position
 */
export type AudienceState =
  | 'trust_intact'           // Baseline: audience trusts brand
  | 'curiosity_rising'       // New interest, evaluating
  | 'legitimacy_skepticism'  // Actively questioning if brand is real
  | 'purchase_anxiety'       // Wants to buy, but blocked by fear
  | 'trust_erosion'          // Trust declining over time
  | 'trust_contamination'    // Negative sentiment spreading
  | 'aspiration_fatigue'     // Tired of aspirational messaging
  | 'authenticity_hunger'    // Craving real, unpolished content
  | 'price_sensitivity_spike'// Economic anxiety affecting decisions
  | 'competitive_comparison' // Actively comparing alternatives
  | 'post_purchase_doubt'    // Buyer's remorse signals
  | 'community_formation';   // Loyal customer emergence

/**
 * Strategic Risk — business impact, not just observations
 */
export interface StrategicRisk {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  riskType: 'trust' | 'cac' | 'positioning' | 'scaling' | 'retention' | 'perception';

  // The interpretation, not just the observation
  observation: string;      // What we see
  interpretation: string;   // What it means psychologically
  businessImpact: string;   // What it means for the business
  strategicImplication: string; // What direction this suggests

  // Quantified impact
  estimatedImpact: {
    cacIncrease?: string;      // e.g., "+15-25%"
    conversionDecline?: string; // e.g., "-20-30%"
    trustScore?: string;        // e.g., "Declining"
    scalingRisk?: string;       // e.g., "High"
  };

  // What to do about it
  strategicDirection: string[];
  creativeSystemsNeeded: string[];

  detectedAt: string;
}

/**
 * Strategic Opportunity — not just "create more ads"
 */
export interface StrategicOpportunity {
  id: string;
  leverage: 'transformational' | 'high' | 'medium' | 'low';
  opportunityType: 'positioning' | 'trust' | 'narrative' | 'audience' | 'competitive' | 'emotional';

  // Deep interpretation
  signal: string;           // What we detected
  interpretation: string;   // What it reveals about audience psychology
  strategicValue: string;   // Why this matters strategically
  competitiveEdge: string;  // How this differentiates from competitors

  // Strategic direction
  narrativeDirection: string;
  emotionalTerritory: string;
  creativeSystemRecommendation: string[];

  // Founder-level insight
  founderInsight: string;   // The "wow" realization

  detectedAt: string;
}

/**
 * Audience Psychology Report — not comment summary
 */
export interface AudiencePsychologyReport {
  // Current state
  dominantState: AudienceState;
  stateTransitions: {
    from: AudienceState;
    to: AudienceState;
    confidence: number;
    evidence: string[];
  }[];

  // Psychological landscape
  trustLandscape: {
    overallTrust: 'strong' | 'stable' | 'fragile' | 'eroding' | 'contaminated';
    trustThreats: string[];
    trustOpportunities: string[];
  };

  emotionalLandscape: {
    dominantEmotions: string[];
    emergingEmotions: string[];
    fadingEmotions: string[];
    emotionalShifts: string[];
  };

  buyingFriction: {
    primaryBlockers: string[];
    hiddenFriction: string[];
    frictionTrend: 'increasing' | 'stable' | 'decreasing';
  };

  // Strategic interpretation
  strategicInterpretation: string;
}

/**
 * Category Intelligence — what's happening in the market
 */
export interface CategoryIntelligence {
  persuasionSaturation: {
    saturatedApproaches: string[];
    emergingApproaches: string[];
    underexploitedApproaches: string[];
  };

  narrativeShifts: {
    decliningNarratives: string[];
    risingNarratives: string[];
    categoryGaps: string[];
  };

  audienceEvolution: {
    sophisticationLevel: 'naive' | 'aware' | 'skeptical' | 'cynical';
    trustRequirements: string[];
    authenticityExpectations: string[];
  };
}

/**
 * Full Strategic Intelligence Output
 */
export interface StrategicIntelligenceOutput {
  clientId: string;
  generatedAt: string;

  // Executive summary — the founder-level insight
  executiveSummary: {
    headline: string;
    strategicSituation: string;
    criticalRisk: string | null;
    highestLeverageOpportunity: string | null;
    recommendedDirection: string;
  };

  // Deep analysis
  audiencePsychology: AudiencePsychologyReport;
  categoryIntelligence: CategoryIntelligence;

  // Risks and opportunities
  risks: StrategicRisk[];
  opportunities: StrategicOpportunity[];

  // Strategic direction — not tactical recommendations
  strategicDirection: {
    narrativeEvolution: string;
    trustStrategy: string;
    emotionalTerritory: string;
    creativeSystemPriorities: string[];
    whatToStopDoing: string[];
    whatToStartDoing: string[];
  };
}

// ============================================================================
// SIGNAL INPUTS (internal, shared across engine modules)
// ============================================================================

export interface CommentSignalInput {
  pattern: string;
  category: string;
  frequency: number;
  sentiment: string;
  examples: string[];
}

export interface FatigueSignalInput {
  creativeName: string;
  fatigueScore: number;
  ctrDrop: number;
  daysSinceDecline: number;
}

export interface PerformanceSignalInput {
  overallROAS: number;
  roasTrend: 'improving' | 'stable' | 'declining';
  cacTrend: 'improving' | 'stable' | 'increasing';
  topCreativeType: string;
}
