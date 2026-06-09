/**
 * Uncertainty-Aware Intelligence — Types
 */

import { type ConfidenceLevel } from '../recursive-investigator.js';

export type DistributionType = 'normal' | 'uniform' | 'skewed_right' | 'skewed_left' | 'bimodal';
export type EvidenceQuality = 'strong' | 'moderate' | 'weak' | 'speculative';
export type ImpactSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ConflictResolution = 'evidence1_wins' | 'evidence2_wins' | 'both_partially_true' | 'unresolved';

export interface UncertainEstimate {
  id: string;
  variable: string;
  description: string;
  pointEstimate: number;
  unit: string;  // '%', '₹', 'days', etc.
  confidenceInterval: {
    low: number;
    high: number;
    confidence: number;  // 0.8 = 80% confidence interval
  };
  distribution: DistributionType;
  evidenceQuality: EvidenceQuality;
  evidenceSources: string[];
  majorUncertaintySources: UncertaintySource[];
  assumptions: string[];
}

export interface UncertaintySource {
  name: string;
  description: string;
  impact: ImpactSeverity;
  direction: 'upside' | 'downside' | 'both';
  mitigation: string | null;
}

export interface EvidenceConflict {
  id: string;
  topic: string;
  evidence1: {
    source: string;
    finding: string;
    confidence: number;
    timestamp: Date;
  };
  evidence2: {
    source: string;
    finding: string;
    confidence: number;
    timestamp: Date;
  };
  resolution: ConflictResolution;
  resolutionReasoning: string;
  impactOnConclusions: string;
}

export interface SensitivityAnalysis {
  id: string;
  assumption: string;
  currentBelief: number;  // 0-1, how confident we are in this assumption
  ifWrong: string;        // What happens if this assumption is wrong
  impactSeverity: ImpactSeverity;
  howToVerify: string;
  verificationCost: 'low' | 'medium' | 'high';
  recommendVerification: boolean;
}

export interface CalibrationRecord {
  id: string;
  prediction: string;
  predictedValue: number;
  confidenceInterval: { low: number; high: number };
  confidenceLevel: number;
  predictionDate: Date;
  outcomeDate: Date | null;
  actualValue: number | null;
  wasAccurate: boolean | null;  // Did actual fall within CI?
  errorMagnitude: number | null;
  lessonsLearned: string | null;
}

export interface UncertaintyModel {
  generatedAt: Date;
  estimates: UncertainEstimate[];
  conflicts: EvidenceConflict[];
  sensitivities: SensitivityAnalysis[];
  calibrationHistory: CalibrationRecord[];
  overallUncertainty: OverallUncertainty;
  operatorReport: UncertaintyReport;
}

export interface OverallUncertainty {
  level: 'low' | 'moderate' | 'high' | 'very_high';
  primaryDrivers: string[];
  recommendation: string;
  confidenceInConclusions: ConfidenceLevel;
}

export interface UncertaintyReport {
  headline: string;
  keyEstimates: string[];
  criticalAssumptions: string[];
  conflictsToResolve: string[];
  sensitivityWarnings: string[];
  whatCouldGoWrong: string[];
  recommendation: string;
}

export interface UncertaintyInput {
  variable: string;
  description: string;
  rawEstimates: number[];  // Multiple estimates from different sources
  sources: string[];
  assumptions: string[];
  knownRisks: string[];
}

export interface UncertaintyAnalysisResult {
  model: UncertaintyModel;
  analysisTimeMs: number;
}
