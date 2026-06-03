/**
 * Strategic Narrative Synthesis — shared types (leaf module).
 *
 * Extracted verbatim from narrative-synthesis.ts. No behavior change.
 */

import { type ConfidenceLevel } from '../recursive-investigator.js';
import { type HypothesisEvaluationResult } from '../competing-hypotheses.js';
import { type CausalAnalysisResult } from '../causal-intelligence.js';
import { type CuriosityScanResult } from '../strategic-curiosity.js';

// ============================================================================
// Types
// ============================================================================

export type MarketState = 'growing' | 'maturing' | 'disrupting' | 'declining';
export type CompetitivePosition = 'leading' | 'challenging' | 'defending' | 'retreating';
export type TimeHorizon = 'immediate' | 'short_term' | 'medium_term' | 'long_term';
export type ForceDirection = 'favorable' | 'unfavorable' | 'neutral';

export interface WorldviewModel {
  marketState: MarketState;
  marketStateEvidence: string[];
  competitivePosition: CompetitivePosition;
  competitiveEvidence: string[];
  customerBehavior: string;
  keyRisks: string[];
  keyOpportunities: string[];
  overallSentiment: 'optimistic' | 'cautious' | 'concerning' | 'critical';
}

export interface StrategicForce {
  id: string;
  name: string;
  direction: ForceDirection;
  strength: number;  // 0-1
  timeHorizon: TimeHorizon;
  description: string;
  evidence: string[];
  implications: string[];
}

export interface InflectionPoint {
  id: string;
  description: string;
  timing: string;
  probability: number;  // 0-1
  impactIfOccurs: string;
  impactSeverity: 'low' | 'medium' | 'high' | 'critical';
  preparatoryAction: string;
  earlyWarningSignals: string[];
}

export interface StrategicImperative {
  id: string;
  priority: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  action: string;
  rationale: string;
  riskOfInaction: string;
  dependencies: string[];
  successMetrics: string[];
}

export interface NarrativeUncertainty {
  area: string;
  description: string;
  confidenceRange: string;  // e.g., "±30%"
  whatCouldGoWrong: string;
  howToVerify: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  supportingFindings: string[];
  strength: number;  // 0-1, how much evidence supports this
}

export interface Contradiction {
  finding1: string;
  source1: string;
  finding2: string;
  source2: string;
  resolution: 'finding1_correct' | 'finding2_correct' | 'both_partially_true' | 'unresolved';
  explanation: string;
}

export interface StrategicNarrative {
  generatedAt: Date;
  timeframe: string;
  worldview: WorldviewModel;
  themes: Theme[];
  keyForces: StrategicForce[];
  dominantTrend: string;
  inflectionPoints: InflectionPoint[];
  strategicImperatives: StrategicImperative[];
  contradictionsResolved: Contradiction[];
  uncertainties: NarrativeUncertainty[];
  executiveSummary: ExecutiveSummary;
}

export interface ExecutiveSummary {
  headline: string;
  situation: string;
  implications: string;
  recommendation: string;
  confidence: ConfidenceLevel;
  watchFor: string;
}

export interface NarrativeInputs {
  hypothesisResults?: HypothesisEvaluationResult[];
  causalResults?: CausalAnalysisResult[];
  curiosityResults?: CuriosityScanResult[];
  additionalFindings?: string[];
  clientContext?: {
    industry: string;
    monthlySpend: number;
    competitorNames?: string[];
    recentChanges?: string[];
  };
}

export interface NarrativeSynthesisResult {
  narrative: StrategicNarrative;
  synthesisTimeMs: number;
  inputsUsed: {
    hypotheses: number;
    causalModels: number;
    curiosityScans: number;
    additionalFindings: number;
  };
}
