/**
 * Self-Improving Cognition System
 *
 * Instead of static reasoning, this system:
 * 1. Tracks all predictions/hypotheses with confidence levels
 * 2. Measures actual outcomes against predictions
 * 3. Analyzes errors to understand where reasoning failed
 * 4. Identifies patterns in successful vs failed reasoning
 * 5. Updates weights/priors based on track record
 * 6. Propagates lessons to improve future reasoning
 *
 * Example Learning:
 *   Hypothesis: "Tier-2 expansion will yield 2x ROAS vs metros"
 *   Confidence: 75%
 *   Outcome: Partially correct - ROAS was 1.6x, not 2x
 *
 *   Error Analysis:
 *   - Underestimated shipping cost impact on margins
 *   - Overestimated price sensitivity difference
 *   - Correctly predicted lower competition
 *
 *   Lesson: "Tier-2 ROAS projections should discount 20% for logistics"
 *
 *   Pattern Updated:
 *   "Geographic expansion hypotheses" → Add logistics cost adjustment
 *   Success rate: 65% → 70% after adjustment
 */

import { type ConfidenceLevel } from './recursive-investigator.js';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Default Reasoning Patterns
// ============================================================================

const DEFAULT_REASONING_PATTERNS: Omit<ReasoningPattern, 'id'>[] = [
  {
    name: 'Geographic Expansion Analysis',
    description: 'Reasoning about expanding to new geographic markets',
    contexts: ['geographic'],
    successRate: 0.65,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Good at identifying low-competition areas'],
    weaknesses: ['Often underestimates logistics costs'],
    antiPatterns: ['Assuming metro patterns apply to Tier-2/3'],
    adjustments: [],
  },
  {
    name: 'Creative Performance Prediction',
    description: 'Predicting which creative approaches will perform best',
    contexts: ['creative'],
    successRate: 0.55,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Identifying broad creative themes'],
    weaknesses: ['Hard to predict viral potential'],
    antiPatterns: ['Assuming past winners will continue winning indefinitely'],
    adjustments: [],
  },
  {
    name: 'Audience Fatigue Detection',
    description: 'Identifying when audiences are becoming fatigued',
    contexts: ['audience'],
    successRate: 0.70,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Frequency-based signals are reliable'],
    weaknesses: ['Hard to distinguish fatigue from external factors'],
    antiPatterns: ['Ignoring seasonal effects on engagement'],
    adjustments: [],
  },
  {
    name: 'Competitive Response Prediction',
    description: 'Predicting how competitors will respond to our actions',
    contexts: ['competitive'],
    successRate: 0.45,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Pattern recognition from historical behavior'],
    weaknesses: ['Competitors can be unpredictable'],
    antiPatterns: ['Assuming competitors will maintain same strategy'],
    adjustments: [],
  },
  {
    name: 'Pricing Elasticity Analysis',
    description: 'Understanding price sensitivity and optimal pricing',
    contexts: ['pricing'],
    successRate: 0.60,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Historical price-demand relationships'],
    weaknesses: ['Market conditions can shift elasticity'],
    antiPatterns: ['Ignoring competitive pricing context'],
    adjustments: [],
  },
  {
    name: 'Timing/Seasonality Analysis',
    description: 'Understanding temporal patterns and optimal timing',
    contexts: ['timing'],
    successRate: 0.75,
    sampleSize: 0,
    lastUpdated: new Date(),
    strengths: ['Historical patterns are often repeated'],
    weaknesses: ['Unexpected events can disrupt patterns'],
    antiPatterns: ['Over-relying on last year\'s exact patterns'],
    adjustments: [],
  },
];

// ============================================================================
// Self-Improving Cognition Engine
// ============================================================================

export class SelfImprovingCognitionEngine {
  private hypothesisOutcomes: HypothesisOutcome[] = [];
  private investigationOutcomes: InvestigationOutcome[] = [];
  private reasoningPatterns: ReasoningPattern[] = [];
  private feedbackRecords: FeedbackRecord[] = [];
  private cognitiveImprovements: CognitiveImprovement[] = [];

  constructor(
    private clientId: string,
  ) {
    // Initialize with default patterns
    this.reasoningPatterns = DEFAULT_REASONING_PATTERNS.map((p, i) => ({
      ...p,
      id: `pattern_${i}_${Date.now()}`,
    }));
  }

  // ==========================================================================
  // Prediction Tracking
  // ==========================================================================

  /**
   * Record a new prediction/hypothesis
   */
  recordPrediction(
    hypothesis: string,
    predictedValue: number | string,
    confidence: number,
    category: PatternContext = 'general'
  ): string {
    const id = `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.hypothesisOutcomes.push({
      id,
      hypothesis,
      category,
      predictedValue,
      predictedConfidence: confidence,
      predictionDate: new Date(),
      outcomeDate: null,
      actualValue: null,
      accuracy: 'pending',
      errorMagnitude: null,
      errorAnalysis: null,
      lessonLearned: null,
    });

    return id;
  }

  /**
   * Record the actual outcome of a prediction
   */
  recordOutcome(
    predictionId: string,
    actualValue: number | string,
    lessonLearned?: string
  ): HypothesisOutcome | null {
    const prediction = this.hypothesisOutcomes.find(p => p.id === predictionId);
    if (!prediction) return null;

    prediction.outcomeDate = new Date();
    prediction.actualValue = actualValue;

    // Calculate accuracy
    const accuracy = this.calculateAccuracy(prediction.predictedValue, actualValue);
    prediction.accuracy = accuracy.accuracy;
    prediction.errorMagnitude = accuracy.errorMagnitude;

    // Perform error analysis if not correct
    if (accuracy.accuracy !== 'correct') {
      prediction.errorAnalysis = this.analyzeError(prediction, actualValue);
    }

    prediction.lessonLearned = lessonLearned || this.generateLessonLearned(prediction);

    // Update reasoning patterns
    this.updateReasoningPattern(prediction);

    return prediction;
  }

  /**
   * Calculate accuracy of a prediction
   */
  private calculateAccuracy(
    predicted: number | string,
    actual: number | string
  ): { accuracy: OutcomeAccuracy; errorMagnitude: number } {
    // Handle string comparisons
    if (typeof predicted === 'string' || typeof actual === 'string') {
      const predictedStr = String(predicted).toLowerCase();
      const actualStr = String(actual).toLowerCase();

      if (predictedStr === actualStr) {
        return { accuracy: 'correct', errorMagnitude: 0 };
      }
      if (predictedStr.includes(actualStr) || actualStr.includes(predictedStr)) {
        return { accuracy: 'partially_correct', errorMagnitude: 0.3 };
      }
      return { accuracy: 'wrong', errorMagnitude: 1.0 };
    }

    // Handle numeric comparisons
    const predictedNum = Number(predicted);
    const actualNum = Number(actual);

    if (predictedNum === 0 && actualNum === 0) {
      return { accuracy: 'correct', errorMagnitude: 0 };
    }

    const errorMagnitude = Math.abs(predictedNum - actualNum) / Math.max(Math.abs(predictedNum), Math.abs(actualNum), 1);

    if (errorMagnitude < 0.1) {
      return { accuracy: 'correct', errorMagnitude };
    }
    if (errorMagnitude < 0.3) {
      return { accuracy: 'partially_correct', errorMagnitude };
    }
    return { accuracy: 'wrong', errorMagnitude };
  }

  /**
   * Analyze why a prediction was wrong
   */
  private analyzeError(
    prediction: HypothesisOutcome,
    actualValue: number | string
  ): ErrorAnalysis {
    const predicted = prediction.predictedValue;

    // Determine error type
    let errorType: ErrorAnalysis['errorType'] = 'wrong_factor';

    if (typeof predicted === 'number' && typeof actualValue === 'number') {
      if (predicted > actualValue) {
        errorType = 'overestimate';
      } else if (predicted < actualValue) {
        errorType = 'underestimate';
      }

      // Check if direction was wrong (positive vs negative)
      if ((predicted > 0 && actualValue < 0) || (predicted < 0 && actualValue > 0)) {
        errorType = 'wrong_direction';
      }
    }

    // Generate analysis based on category
    const categoryAnalysis = this.getCategorySpecificAnalysis(prediction.category);

    return {
      errorType,
      rootCause: `${errorType.replace('_', ' ')} in ${prediction.category} prediction`,
      missingFactors: categoryAnalysis.missingFactors,
      incorrectAssumptions: categoryAnalysis.incorrectAssumptions,
      whatWorked: this.identifyWhatWorked(prediction),
      correctionNeeded: this.suggestCorrection(errorType, prediction.category),
    };
  }

  /**
   * Get category-specific error analysis
   */
  private getCategorySpecificAnalysis(category: PatternContext): {
    missingFactors: string[];
    incorrectAssumptions: string[];
  } {
    const analyses: Record<PatternContext, { missingFactors: string[]; incorrectAssumptions: string[] }> = {
      'geographic': {
        missingFactors: ['Logistics costs', 'Local competition', 'Brand awareness levels'],
        incorrectAssumptions: ['Metro patterns apply to other regions', 'CAC scales linearly'],
      },
      'creative': {
        missingFactors: ['Audience saturation level', 'Competitive creative landscape', 'Platform algorithm changes'],
        incorrectAssumptions: ['Past winners continue performing', 'Creative rules are universal'],
      },
      'audience': {
        missingFactors: ['Seasonal behavior shifts', 'Competitor audience capture', 'External events'],
        incorrectAssumptions: ['Audience behavior is stable', 'Fatigue indicators are universal'],
      },
      'competitive': {
        missingFactors: ['Competitor internal priorities', 'New market entrants', 'Platform favoritism'],
        incorrectAssumptions: ['Competitors will maintain strategy', 'Rational responses expected'],
      },
      'pricing': {
        missingFactors: ['Competitive pricing moves', 'Cost structure changes', 'Customer segment mix'],
        incorrectAssumptions: ['Price elasticity is constant', 'Historical patterns hold'],
      },
      'timing': {
        missingFactors: ['Unexpected events', 'Platform algorithm timing', 'Cultural shifts'],
        incorrectAssumptions: ['Last year patterns repeat exactly', 'Seasonal effects are predictable'],
      },
      'general': {
        missingFactors: ['Context-specific factors', 'External market conditions'],
        incorrectAssumptions: ['General rules apply to specific case'],
      },
    };

    return analyses[category] || analyses['general'];
  }

  /**
   * Identify what worked in a prediction
   */
  private identifyWhatWorked(prediction: HypothesisOutcome): string[] {
    const whatWorked: string[] = [];

    // If partially correct, the direction was probably right
    if (prediction.accuracy === 'partially_correct') {
      whatWorked.push('Directional prediction was correct');
      whatWorked.push('Core hypothesis was valid');
    }

    // High confidence that was wrong is valuable learning
    if (prediction.predictedConfidence > 0.7 && prediction.accuracy === 'wrong') {
      whatWorked.push('Identified an area where overconfidence occurred');
    }

    // Low confidence that was correct suggests good uncertainty awareness
    if (prediction.predictedConfidence < 0.5 && prediction.accuracy === 'correct') {
      whatWorked.push('Appropriately uncertain about difficult prediction');
    }

    return whatWorked;
  }

  /**
   * Suggest correction based on error type
   */
  private suggestCorrection(errorType: ErrorAnalysis['errorType'], category: PatternContext): string {
    const corrections: Record<string, string> = {
      'overestimate_geographic': 'Apply 20% discount to geographic expansion projections for logistics',
      'underestimate_geographic': 'Account for stronger local advantages than assumed',
      'overestimate_creative': 'Reduce creative performance projections by 15% for conservative planning',
      'underestimate_creative': 'Consider viral potential more in creative scoring',
      'overestimate_audience': 'Factor in audience saturation earlier in projections',
      'underestimate_audience': 'Account for audience freshness benefits more',
      'wrong_direction_competitive': 'Re-examine competitive intelligence methods',
      'wrong_factor_pricing': 'Add more factors to pricing elasticity model',
      'timing_error_timing': 'Adjust seasonal expectations with ±2 week buffer',
    };

    const key = `${errorType}_${category}`;
    return corrections[key] || `Adjust ${category} predictions to account for ${errorType.replace('_', ' ')}`;
  }

  /**
   * Generate lesson learned from prediction outcome
   */
  private generateLessonLearned(prediction: HypothesisOutcome): string {
    if (prediction.accuracy === 'correct') {
      return `${prediction.category} prediction approach validated. Continue using current method.`;
    }

    if (prediction.accuracy === 'partially_correct') {
      return `${prediction.category} direction was right but magnitude was off. Calibrate future estimates.`;
    }

    if (prediction.errorAnalysis) {
      return `${prediction.errorAnalysis.rootCause}. ${prediction.errorAnalysis.correctionNeeded}`;
    }

    return `${prediction.category} prediction needs review. Examine assumptions.`;
  }

  /**
   * Update reasoning pattern based on outcome
   */
  private updateReasoningPattern(prediction: HypothesisOutcome): void {
    const pattern = this.reasoningPatterns.find(p => p.contexts.includes(prediction.category));
    if (!pattern) return;

    // Update sample size
    pattern.sampleSize++;
    pattern.lastUpdated = new Date();

    // Update success rate
    const outcomeValue = prediction.accuracy === 'correct' ? 1 :
                         prediction.accuracy === 'partially_correct' ? 0.5 : 0;

    // Weighted update (more recent outcomes matter more)
    const weight = 1 / Math.sqrt(pattern.sampleSize);
    pattern.successRate = pattern.successRate * (1 - weight) + outcomeValue * weight;

    // Add adjustment if there's a lesson
    if (prediction.lessonLearned && prediction.accuracy !== 'correct') {
      pattern.adjustments.push({
        date: new Date(),
        adjustment: prediction.lessonLearned,
        reason: `Based on ${prediction.accuracy} prediction`,
        impactOnSuccessRate: 0,  // Will be measured over time
      });
    }

    // Update weaknesses if pattern of errors emerges
    if (prediction.errorAnalysis) {
      for (const factor of prediction.errorAnalysis.missingFactors) {
        if (!pattern.weaknesses.includes(factor)) {
          pattern.weaknesses.push(factor);
        }
      }
    }
  }

  // ==========================================================================
  // Investigation Tracking
  // ==========================================================================

  /**
   * Start tracking an investigation
   */
  startInvestigation(
    investigationType: string,
    category: PatternContext = 'general'
  ): string {
    const id = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.investigationOutcomes.push({
      id,
      investigationType,
      category,
      startTime: new Date(),
      endTime: new Date(),  // Will be updated
      timeSpentMinutes: 0,
      leverageDiscovered: 0,
      actionsTaken: [],
      roi: 0,
      wasValueable: false,
      shouldRepeat: true,
      notes: '',
    });

    return id;
  }

  /**
   * Complete an investigation and record outcomes
   */
  completeInvestigation(
    investigationId: string,
    leverageDiscovered: number,
    actionsTaken: string[],
    notes: string
  ): InvestigationOutcome | null {
    const investigation = this.investigationOutcomes.find(i => i.id === investigationId);
    if (!investigation) return null;

    investigation.endTime = new Date();
    investigation.timeSpentMinutes = Math.round(
      (investigation.endTime.getTime() - investigation.startTime.getTime()) / 60000
    );
    investigation.leverageDiscovered = leverageDiscovered;
    investigation.actionsTaken = actionsTaken;
    investigation.notes = notes;

    // Calculate ROI
    if (investigation.timeSpentMinutes > 0) {
      investigation.roi = leverageDiscovered / investigation.timeSpentMinutes;
    }

    // Determine if valuable
    investigation.wasValueable = leverageDiscovered > 50000 || // ₹50K+
                                  actionsTaken.length >= 2;

    // Determine if should repeat
    investigation.shouldRepeat = investigation.roi > 5000;  // ₹5K per minute

    return investigation;
  }

  // ==========================================================================
  // Feedback Processing
  // ==========================================================================

  /**
   * Record founder/operator feedback
   */
  recordFeedback(
    feedbackType: FeedbackRecord['feedbackType'],
    feedback: string,
    relatedPredictionId?: string
  ): string {
    const id = `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const record: FeedbackRecord = {
      id,
      feedbackDate: new Date(),
      feedbackType,
      relatedPredictionId: relatedPredictionId || null,
      feedback,
      actionTaken: null,
      lessonsExtracted: [],
    };

    // Extract lessons from feedback
    record.lessonsExtracted = this.extractLessonsFromFeedback(feedback, feedbackType);

    // Apply feedback to related prediction if exists
    if (relatedPredictionId) {
      const prediction = this.hypothesisOutcomes.find(p => p.id === relatedPredictionId);
      if (prediction && !prediction.lessonLearned) {
        prediction.lessonLearned = feedback;
      }
    }

    this.feedbackRecords.push(record);

    return id;
  }

  /**
   * Extract lessons from feedback text
   */
  private extractLessonsFromFeedback(feedback: string, feedbackType: FeedbackRecord['feedbackType']): string[] {
    const lessons: string[] = [];
    const lower = feedback.toLowerCase();

    // Pattern matching for common feedback types
    if (feedbackType === 'correction') {
      lessons.push(`Correction: ${feedback}`);
    }

    if (lower.includes('should have') || lower.includes('should\'ve')) {
      lessons.push('Missed factor identified');
    }

    if (lower.includes('too') && (lower.includes('high') || lower.includes('low'))) {
      lessons.push('Calibration adjustment needed');
    }

    if (lower.includes('didn\'t consider') || lower.includes('forgot')) {
      lessons.push('Missing factor to add to analysis');
    }

    if (feedbackType === 'positive') {
      lessons.push('Validated approach for future use');
    }

    return lessons;
  }

  // ==========================================================================
  // Learning Reports
  // ==========================================================================

  /**
   * Generate learning report for a time period
   */
  generateLearningReport(
    periodDays: number = 30
  ): LearningReport {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Filter to period
    const periodPredictions = this.hypothesisOutcomes.filter(
      p => p.predictionDate >= periodStart && p.predictionDate <= periodEnd
    );
    const periodInvestigations = this.investigationOutcomes.filter(
      i => i.startTime >= periodStart && i.startTime <= periodEnd
    );

    // Calculate metrics
    const resolvedPredictions = periodPredictions.filter(p => p.accuracy !== 'pending');
    const correctPredictions = resolvedPredictions.filter(
      p => p.accuracy === 'correct' || p.accuracy === 'partially_correct'
    );
    const accuracyRate = resolvedPredictions.length > 0
      ? correctPredictions.length / resolvedPredictions.length
      : 0;

    // Calibration analysis
    const calibrationAnalysis = this.analyzeCalibration(resolvedPredictions);

    // Pattern insights
    const patternInsights = this.generatePatternInsights();

    // Recommendations
    const recommendations = this.generateLearningRecommendations(calibrationAnalysis, patternInsights);

    // Top lessons
    const topLessons = resolvedPredictions
      .filter(p => p.lessonLearned)
      .map(p => p.lessonLearned!)
      .slice(0, 5);

    // Areas of improvement/needing work
    const areasOfImprovement = patternInsights
      .filter(p => p.trend === 'improving')
      .map(p => p.pattern);
    const areasNeedingWork = patternInsights
      .filter(p => p.trend === 'declining' || p.successRate < 0.5)
      .map(p => p.pattern);

    const summary: LearningSummary = {
      headline: this.generateLearningHeadline(accuracyRate, calibrationAnalysis),
      predictionsTracked: periodPredictions.length,
      predictionsResolved: resolvedPredictions.length,
      accuracyThisPeriod: accuracyRate,
      calibrationThisPeriod: calibrationAnalysis.overallCalibration,
      topLessons,
      areasOfImprovement,
      areasNeedingWork,
    };

    return {
      generatedAt: new Date(),
      periodStart,
      periodEnd,
      summary,
      patternInsights,
      recommendations,
      calibrationAnalysis,
    };
  }

  /**
   * Analyze calibration (how well confidence matches accuracy)
   */
  private analyzeCalibration(predictions: HypothesisOutcome[]): CalibrationAnalysis {
    if (predictions.length === 0) {
      return {
        overallCalibration: 1.0,
        overconfidentBuckets: [],
        underconfidentBuckets: [],
        suggestion: 'Not enough predictions to analyze calibration.',
      };
    }

    // Bucket predictions by confidence level
    const buckets: Record<string, { correct: number; total: number }> = {
      'low (0-40%)': { correct: 0, total: 0 },
      'medium (40-70%)': { correct: 0, total: 0 },
      'high (70-100%)': { correct: 0, total: 0 },
    };

    for (const pred of predictions) {
      const conf = pred.predictedConfidence;
      const isCorrect = pred.accuracy === 'correct' || pred.accuracy === 'partially_correct';

      if (conf < 0.4) {
        buckets['low (0-40%)'].total++;
        if (isCorrect) buckets['low (0-40%)'].correct++;
      } else if (conf < 0.7) {
        buckets['medium (40-70%)'].total++;
        if (isCorrect) buckets['medium (40-70%)'].correct++;
      } else {
        buckets['high (70-100%)'].total++;
        if (isCorrect) buckets['high (70-100%)'].correct++;
      }
    }

    // Find miscalibrated buckets
    const overconfidentBuckets: string[] = [];
    const underconfidentBuckets: string[] = [];

    for (const [bucket, data] of Object.entries(buckets)) {
      if (data.total < 3) continue;  // Need enough samples

      const actualRate = data.correct / data.total;
      const expectedRate = bucket.includes('low') ? 0.3 :
                           bucket.includes('medium') ? 0.55 : 0.85;

      if (actualRate < expectedRate - 0.15) {
        overconfidentBuckets.push(bucket);
      }
      if (actualRate > expectedRate + 0.15) {
        underconfidentBuckets.push(bucket);
      }
    }

    // Calculate overall calibration score
    let calibrationError = 0;
    let totalSamples = 0;

    for (const [bucket, data] of Object.entries(buckets)) {
      if (data.total === 0) continue;

      const actualRate = data.correct / data.total;
      const expectedRate = bucket.includes('low') ? 0.3 :
                           bucket.includes('medium') ? 0.55 : 0.85;

      calibrationError += Math.abs(actualRate - expectedRate) * data.total;
      totalSamples += data.total;
    }

    const overallCalibration = totalSamples > 0
      ? 1 - (calibrationError / totalSamples)
      : 1.0;

    // Generate suggestion
    let suggestion = 'Calibration is reasonable.';
    if (overconfidentBuckets.length > 0) {
      suggestion = `Overconfident in ${overconfidentBuckets.join(', ')} buckets. Lower confidence on similar predictions.`;
    } else if (underconfidentBuckets.length > 0) {
      suggestion = `Underconfident in ${underconfidentBuckets.join(', ')} buckets. Can be more confident.`;
    }

    return {
      overallCalibration,
      overconfidentBuckets,
      underconfidentBuckets,
      suggestion,
    };
  }

  /**
   * Generate insights for each reasoning pattern
   */
  private generatePatternInsights(): PatternInsight[] {
    return this.reasoningPatterns.map(pattern => {
      // Determine trend from adjustments
      const recentAdjustments = pattern.adjustments.filter(
        a => a.date.getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
      );

      let trend: PatternInsight['trend'] = 'stable';
      if (recentAdjustments.length > 0) {
        const avgImpact = recentAdjustments.reduce((sum, a) => sum + a.impactOnSuccessRate, 0) / recentAdjustments.length;
        trend = avgImpact > 0.05 ? 'improving' : avgImpact < -0.05 ? 'declining' : 'stable';
      }

      // Generate insight
      let insight: string;
      if (pattern.successRate >= 0.7) {
        insight = 'Strong performer. Continue current approach.';
      } else if (pattern.successRate >= 0.5) {
        insight = 'Moderate success. Consider adjustments from lessons learned.';
      } else {
        insight = 'Underperforming. Review approach and add missing factors.';
      }

      // Generate recommendation
      let recommendation: string;
      if (pattern.weaknesses.length > 0) {
        recommendation = `Address weakness: ${pattern.weaknesses[0]}`;
      } else if (pattern.antiPatterns.length > 0) {
        recommendation = `Avoid: ${pattern.antiPatterns[0]}`;
      } else {
        recommendation = 'Maintain current approach.';
      }

      return {
        pattern: pattern.name,
        successRate: pattern.successRate,
        trend,
        insight,
        recommendation,
      };
    });
  }

  /**
   * Generate learning recommendations
   */
  private generateLearningRecommendations(
    calibration: CalibrationAnalysis,
    patterns: PatternInsight[]
  ): LearningRecommendation[] {
    const recommendations: LearningRecommendation[] = [];

    // Calibration-based recommendations
    if (calibration.overconfidentBuckets.length > 0) {
      recommendations.push({
        priority: 'high',
        area: 'general',
        recommendation: `Reduce confidence levels by 10-15% for ${calibration.overconfidentBuckets[0]} predictions`,
        expectedImpact: 'Better calibration, more realistic expectation setting',
      });
    }

    // Pattern-based recommendations
    const underperformers = patterns.filter(p => p.successRate < 0.5);
    for (const pattern of underperformers.slice(0, 2)) {
      const category = this.reasoningPatterns.find(p => p.name === pattern.pattern)?.contexts[0] || 'general';
      recommendations.push({
        priority: pattern.successRate < 0.3 ? 'high' : 'medium',
        area: category,
        recommendation: pattern.recommendation,
        expectedImpact: `Improve ${pattern.pattern} success rate`,
      });
    }

    // Look for patterns needing more data
    const lowSample = this.reasoningPatterns.filter(p => p.sampleSize < 5);
    for (const pattern of lowSample.slice(0, 2)) {
      recommendations.push({
        priority: 'low',
        area: pattern.contexts[0] || 'general',
        recommendation: `Track more ${pattern.name} predictions to improve pattern reliability`,
        expectedImpact: 'Better statistical confidence in pattern performance',
      });
    }

    return recommendations;
  }

  /**
   * Generate learning headline
   */
  private generateLearningHeadline(accuracyRate: number, calibration: CalibrationAnalysis): string {
    if (accuracyRate >= 0.7 && calibration.overallCalibration >= 0.8) {
      return 'Strong cognitive performance with good calibration.';
    }
    if (accuracyRate >= 0.5) {
      if (calibration.overconfidentBuckets.length > 0) {
        return 'Reasonable accuracy but overconfident. Calibration adjustment needed.';
      }
      return 'Moderate accuracy. Room for improvement in specific areas.';
    }
    return 'Accuracy below target. Review reasoning approaches and assumptions.';
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get current system state
   */
  getState(): LearningSystemState {
    return {
      hypothesisOutcomes: this.hypothesisOutcomes,
      investigationOutcomes: this.investigationOutcomes,
      reasoningPatterns: this.reasoningPatterns,
      feedbackRecords: this.feedbackRecords,
      cognitiveImprovements: this.cognitiveImprovements,
      systemMetrics: this.calculateSystemMetrics(),
    };
  }

  /**
   * Calculate current system metrics
   */
  private calculateSystemMetrics(): SystemMetrics {
    const completed = this.hypothesisOutcomes.filter(p => p.accuracy !== 'pending');
    const correct = completed.filter(p => p.accuracy === 'correct' || p.accuracy === 'partially_correct');
    const wrong = completed.filter(p => p.accuracy === 'wrong');

    const avgConfWhenCorrect = correct.length > 0
      ? correct.reduce((sum, p) => sum + p.predictedConfidence, 0) / correct.length
      : 0;

    const avgConfWhenWrong = wrong.length > 0
      ? wrong.reduce((sum, p) => sum + p.predictedConfidence, 0) / wrong.length
      : 0;

    const totalValue = this.investigationOutcomes.reduce((sum, i) => sum + i.leverageDiscovered, 0);
    const avgROI = this.investigationOutcomes.length > 0
      ? this.investigationOutcomes.reduce((sum, i) => sum + i.roi, 0) / this.investigationOutcomes.length
      : 0;

    const sortedPatterns = [...this.reasoningPatterns].sort((a, b) => b.successRate - a.successRate);
    const topPerforming = sortedPatterns.slice(0, 3).map(p => p.name);
    const underperforming = sortedPatterns.slice(-2).map(p => p.name);

    return {
      totalPredictions: this.hypothesisOutcomes.length,
      completedPredictions: completed.length,
      accuracyRate: completed.length > 0 ? correct.length / completed.length : 0,
      averageConfidenceWhenCorrect: avgConfWhenCorrect,
      averageConfidenceWhenWrong: avgConfWhenWrong,
      calibrationScore: avgConfWhenCorrect > avgConfWhenWrong ? 0.7 : 0.4,  // Simplified
      topPerformingPatterns: topPerforming,
      underperformingPatterns: underperforming,
      totalValueDiscovered: totalValue,
      averageInvestigationROI: avgROI,
    };
  }

  /**
   * Import historical data
   */
  importHistoricalData(
    predictions: HypothesisOutcome[],
    investigations: InvestigationOutcome[],
    feedback: FeedbackRecord[]
  ): void {
    this.hypothesisOutcomes.push(...predictions);
    this.investigationOutcomes.push(...investigations);
    this.feedbackRecords.push(...feedback);

    // Re-update patterns with historical data
    for (const prediction of predictions.filter(p => p.accuracy !== 'pending')) {
      this.updateReasoningPattern(prediction);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createSelfImprovingCognitionEngine(
  clientId: string,
): SelfImprovingCognitionEngine {
  return new SelfImprovingCognitionEngine(clientId);
}
