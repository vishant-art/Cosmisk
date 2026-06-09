/**
 * Self-Improving Cognition System — Types
 */

export type OutcomeAccuracy = 'correct' | 'partially_correct' | 'wrong' | 'pending';
export type PatternContext = 'geographic' | 'creative' | 'audience' | 'competitive' | 'pricing' | 'timing' | 'general';

export interface HypothesisOutcome {
  id: string;
  hypothesis: string;
  category: PatternContext;
  predictedValue: number | string;
  predictedConfidence: number;
  predictionDate: Date;
  outcomeDate: Date | null;
  actualValue: number | string | null;
  accuracy: OutcomeAccuracy;
  errorMagnitude: number | null;  // How far off were we (0-1)
  errorAnalysis: ErrorAnalysis | null;
  lessonLearned: string | null;
}

export interface ErrorAnalysis {
  errorType: 'overestimate' | 'underestimate' | 'wrong_direction' | 'wrong_factor' | 'timing_error';
  rootCause: string;
  missingFactors: string[];
  incorrectAssumptions: string[];
  whatWorked: string[];
  correctionNeeded: string;
}

export interface InvestigationOutcome {
  id: string;
  investigationType: string;
  category: PatternContext;
  startTime: Date;
  endTime: Date;
  timeSpentMinutes: number;
  leverageDiscovered: number;  // ₹ impact found
  actionsTaken: string[];
  roi: number;  // leverage / time
  wasValueable: boolean;
  shouldRepeat: boolean;
  notes: string;
}

export interface ReasoningPattern {
  id: string;
  name: string;
  description: string;
  contexts: PatternContext[];
  successRate: number;
  sampleSize: number;
  lastUpdated: Date;
  strengths: string[];
  weaknesses: string[];
  antiPatterns: string[];  // Situations where this pattern fails
  adjustments: PatternAdjustment[];
}

export interface PatternAdjustment {
  date: Date;
  adjustment: string;
  reason: string;
  impactOnSuccessRate: number;  // Change in success rate
}

export interface FeedbackRecord {
  id: string;
  feedbackDate: Date;
  feedbackType: 'positive' | 'negative' | 'correction' | 'suggestion';
  relatedPredictionId: string | null;
  feedback: string;
  actionTaken: string | null;
  lessonsExtracted: string[];
}

export interface CognitiveImprovement {
  id: string;
  improvementDate: Date;
  area: PatternContext;
  previousState: string;
  newState: string;
  evidenceForImprovement: string;
  measuredImpact: number | null;
}

export interface LearningSystemState {
  hypothesisOutcomes: HypothesisOutcome[];
  investigationOutcomes: InvestigationOutcome[];
  reasoningPatterns: ReasoningPattern[];
  feedbackRecords: FeedbackRecord[];
  cognitiveImprovements: CognitiveImprovement[];
  systemMetrics: SystemMetrics;
}

export interface SystemMetrics {
  totalPredictions: number;
  completedPredictions: number;
  accuracyRate: number;
  averageConfidenceWhenCorrect: number;
  averageConfidenceWhenWrong: number;
  calibrationScore: number;  // How well confidence matches accuracy
  topPerformingPatterns: string[];
  underperformingPatterns: string[];
  totalValueDiscovered: number;
  averageInvestigationROI: number;
}

export interface LearningReport {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  summary: LearningSummary;
  patternInsights: PatternInsight[];
  recommendations: LearningRecommendation[];
  calibrationAnalysis: CalibrationAnalysis;
}

export interface LearningSummary {
  headline: string;
  predictionsTracked: number;
  predictionsResolved: number;
  accuracyThisPeriod: number;
  calibrationThisPeriod: number;
  topLessons: string[];
  areasOfImprovement: string[];
  areasNeedingWork: string[];
}

export interface PatternInsight {
  pattern: string;
  successRate: number;
  trend: 'improving' | 'stable' | 'declining';
  insight: string;
  recommendation: string;
}

export interface LearningRecommendation {
  priority: 'high' | 'medium' | 'low';
  area: PatternContext;
  recommendation: string;
  expectedImpact: string;
}

export interface CalibrationAnalysis {
  overallCalibration: number;  // 1.0 = perfectly calibrated
  overconfidentBuckets: string[];
  underconfidentBuckets: string[];
  suggestion: string;
}
