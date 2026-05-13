/**
 * Uncertainty-Aware Intelligence
 *
 * Instead of overconfident point estimates, this system:
 * 1. Provides confidence intervals, not just single numbers
 * 2. Detects and reports conflicting evidence
 * 3. Performs sensitivity analysis on key assumptions
 * 4. Tracks calibration over time (were we right?)
 * 5. Communicates uncertainty honestly to operators
 *
 * Example Output:
 *   Instead of: "ROAS will improve 20%"
 *
 *   Report: "ROAS improvement estimate:
 *     - Point estimate: 20%
 *     - 80% confidence interval: 8% to 35%
 *     - Distribution: Right-skewed (more upside than downside)
 *     - Evidence quality: Moderate
 *     - Key uncertainties:
 *       1. Competitor response unknown
 *       2. Seasonality may amplify or dampen
 *     - If Tier-2 CAC is 30% higher than assumed → improvement drops to 5%"
 */

import { type ConfidenceLevel } from './recursive-investigator.js';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Uncertainty Calculation Helpers
// ============================================================================

/**
 * Calculate mean from array of estimates
 */
function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calculate confidence interval
 */
function calculateConfidenceInterval(
  mean: number,
  stdDev: number,
  confidenceLevel: number = 0.8
): { low: number; high: number } {
  // Z-score for common confidence levels
  const zScores: Record<number, number> = {
    0.80: 1.28,
    0.90: 1.645,
    0.95: 1.96,
    0.99: 2.576,
  };

  const z = zScores[confidenceLevel] || 1.28;
  const margin = z * stdDev;

  return {
    low: mean - margin,
    high: mean + margin,
  };
}

/**
 * Detect distribution type from data
 */
function detectDistribution(values: number[], mean: number): DistributionType {
  if (values.length < 3) return 'uniform';

  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Check for bimodality (two clusters)
  const lowerHalf = values.filter(v => v < mean);
  const upperHalf = values.filter(v => v >= mean);
  if (Math.abs(lowerHalf.length - upperHalf.length) > values.length * 0.4) {
    return 'bimodal';
  }

  // Check for skewness
  const skewness = (mean - median) / (calculateStdDev(values, mean) || 1);

  if (skewness > 0.5) return 'skewed_right';
  if (skewness < -0.5) return 'skewed_left';
  return 'normal';
}

/**
 * Determine evidence quality based on source count and consistency
 */
function assessEvidenceQuality(
  values: number[],
  sources: string[]
): EvidenceQuality {
  const sourceCount = sources.length;
  const mean = calculateMean(values);
  const stdDev = calculateStdDev(values, mean);
  const coefficientOfVariation = mean !== 0 ? stdDev / Math.abs(mean) : 1;

  // Strong: multiple sources, low variation
  if (sourceCount >= 3 && coefficientOfVariation < 0.15) {
    return 'strong';
  }

  // Moderate: some sources, moderate variation
  if (sourceCount >= 2 && coefficientOfVariation < 0.3) {
    return 'moderate';
  }

  // Weak: few sources or high variation
  if (sourceCount >= 1 && coefficientOfVariation < 0.5) {
    return 'weak';
  }

  // Speculative: single source or very high variation
  return 'speculative';
}

/**
 * Determine impact severity from uncertainty magnitude
 */
function assessImpactSeverity(
  percentageUncertainty: number,
  context: 'revenue' | 'cost' | 'efficiency' | 'general'
): ImpactSeverity {
  // Revenue and cost uncertainties are more impactful
  const multiplier = context === 'revenue' || context === 'cost' ? 1.5 : 1.0;
  const adjustedUncertainty = percentageUncertainty * multiplier;

  if (adjustedUncertainty > 0.5) return 'critical';
  if (adjustedUncertainty > 0.3) return 'high';
  if (adjustedUncertainty > 0.15) return 'medium';
  return 'low';
}

// ============================================================================
// Uncertainty Intelligence Engine
// ============================================================================

export class UncertaintyIntelligenceEngine {
  private estimates: UncertainEstimate[] = [];
  private conflicts: EvidenceConflict[] = [];
  private sensitivities: SensitivityAnalysis[] = [];
  private calibrationHistory: CalibrationRecord[] = [];

  constructor(
    private clientId: string,
    private monthlySpend: number,
  ) {}

  /**
   * Analyze uncertainty across multiple inputs
   */
  async analyze(inputs: UncertaintyInput[]): Promise<UncertaintyAnalysisResult> {
    const startTime = Date.now();

    // Reset state
    this.estimates = [];
    this.conflicts = [];
    this.sensitivities = [];

    // Step 1: Build uncertain estimates for each input
    for (const input of inputs) {
      const estimate = this.buildUncertainEstimate(input);
      this.estimates.push(estimate);
    }

    // Step 2: Detect conflicts between estimates
    this.detectConflicts();

    // Step 3: Perform sensitivity analysis
    this.performSensitivityAnalysis();

    // Step 4: Calculate overall uncertainty
    const overallUncertainty = this.calculateOverallUncertainty();

    // Step 5: Build operator report
    const operatorReport = this.buildOperatorReport(overallUncertainty);

    const model: UncertaintyModel = {
      generatedAt: new Date(),
      estimates: this.estimates,
      conflicts: this.conflicts,
      sensitivities: this.sensitivities,
      calibrationHistory: this.calibrationHistory,
      overallUncertainty,
      operatorReport,
    };

    return {
      model,
      analysisTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Build uncertain estimate from raw inputs
   */
  private buildUncertainEstimate(input: UncertaintyInput): UncertainEstimate {
    const mean = calculateMean(input.rawEstimates);
    const stdDev = calculateStdDev(input.rawEstimates, mean);
    const ci = calculateConfidenceInterval(mean, stdDev, 0.8);
    const distribution = detectDistribution(input.rawEstimates, mean);
    const evidenceQuality = assessEvidenceQuality(input.rawEstimates, input.sources);

    // Build uncertainty sources from known risks
    const uncertaintySources: UncertaintySource[] = input.knownRisks.map((risk, i) => ({
      name: `Risk ${i + 1}`,
      description: risk,
      impact: this.assessRiskImpact(risk),
      direction: this.assessRiskDirection(risk),
      mitigation: this.suggestMitigation(risk),
    }));

    // Add standard uncertainty sources based on variable type
    uncertaintySources.push(...this.getStandardUncertaintySources(input.variable));

    return {
      id: `estimate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      variable: input.variable,
      description: input.description,
      pointEstimate: mean,
      unit: this.inferUnit(input.variable),
      confidenceInterval: {
        low: ci.low,
        high: ci.high,
        confidence: 0.8,
      },
      distribution,
      evidenceQuality,
      evidenceSources: input.sources,
      majorUncertaintySources: uncertaintySources,
      assumptions: input.assumptions,
    };
  }

  /**
   * Assess impact of a risk based on keywords
   */
  private assessRiskImpact(risk: string): ImpactSeverity {
    const lower = risk.toLowerCase();

    if (lower.includes('critical') || lower.includes('collapse') || lower.includes('fail')) {
      return 'critical';
    }
    if (lower.includes('significant') || lower.includes('major') || lower.includes('substantial')) {
      return 'high';
    }
    if (lower.includes('moderate') || lower.includes('some') || lower.includes('may')) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Assess direction of risk
   */
  private assessRiskDirection(risk: string): 'upside' | 'downside' | 'both' {
    const lower = risk.toLowerCase();

    if (lower.includes('opportunity') || lower.includes('upside') || lower.includes('better')) {
      return 'upside';
    }
    if (lower.includes('risk') || lower.includes('downside') || lower.includes('worse')) {
      return 'downside';
    }
    return 'both';
  }

  /**
   * Suggest mitigation for a risk
   */
  private suggestMitigation(risk: string): string | null {
    const lower = risk.toLowerCase();

    if (lower.includes('competitor')) {
      return 'Monitor competitor activity, prepare contingency plans';
    }
    if (lower.includes('seasonality') || lower.includes('seasonal')) {
      return 'Compare with historical seasonal patterns';
    }
    if (lower.includes('attribution')) {
      return 'Run incrementality tests to validate';
    }
    if (lower.includes('platform') || lower.includes('meta') || lower.includes('algorithm')) {
      return 'Diversify channels, maintain testing velocity';
    }

    return null;
  }

  /**
   * Get standard uncertainty sources for common variables
   */
  private getStandardUncertaintySources(variable: string): UncertaintySource[] {
    const lower = variable.toLowerCase();
    const sources: UncertaintySource[] = [];

    if (lower.includes('roas') || lower.includes('return')) {
      sources.push({
        name: 'Attribution Window',
        description: 'Attribution settings affect reported ROAS',
        impact: 'medium',
        direction: 'both',
        mitigation: 'Compare multiple attribution windows',
      });
    }

    if (lower.includes('cpa') || lower.includes('cost')) {
      sources.push({
        name: 'Auction Dynamics',
        description: 'CPM fluctuations affect CPA',
        impact: 'medium',
        direction: 'both',
        mitigation: 'Monitor CPM trends and competitor activity',
      });
    }

    if (lower.includes('conversion') || lower.includes('cvr')) {
      sources.push({
        name: 'Tracking Accuracy',
        description: 'Pixel/CAPI may miss some conversions',
        impact: 'medium',
        direction: 'downside',
        mitigation: 'Cross-reference with Shopify data',
      });
    }

    // Always add these standard sources
    sources.push({
      name: 'Sample Size',
      description: 'Estimates become more reliable with more data',
      impact: 'low',
      direction: 'both',
      mitigation: 'Wait for more data if possible',
    });

    return sources;
  }

  /**
   * Infer unit from variable name
   */
  private inferUnit(variable: string): string {
    const lower = variable.toLowerCase();

    if (lower.includes('roas') || lower.includes('ratio')) return 'x';
    if (lower.includes('rate') || lower.includes('ctr') || lower.includes('cvr') || lower.includes('%')) return '%';
    if (lower.includes('cpa') || lower.includes('cpm') || lower.includes('spend') || lower.includes('revenue') || lower.includes('₹')) return '₹';
    if (lower.includes('day') || lower.includes('time')) return 'days';
    if (lower.includes('count') || lower.includes('number')) return 'count';

    return '';
  }

  /**
   * Detect conflicts between estimates
   */
  private detectConflicts(): void {
    // Look for estimates that contradict each other
    for (let i = 0; i < this.estimates.length; i++) {
      for (let j = i + 1; j < this.estimates.length; j++) {
        const e1 = this.estimates[i];
        const e2 = this.estimates[j];

        // Check if variables are related
        if (!this.areRelatedVariables(e1.variable, e2.variable)) continue;

        // Check if confidence intervals don't overlap
        const overlaps = this.intervalsOverlap(e1.confidenceInterval, e2.confidenceInterval);

        if (!overlaps) {
          this.conflicts.push({
            id: `conflict_${Date.now()}_${i}_${j}`,
            topic: `${e1.variable} vs ${e2.variable}`,
            evidence1: {
              source: e1.evidenceSources.join(', '),
              finding: `${e1.variable}: ${e1.pointEstimate.toFixed(2)}${e1.unit}`,
              confidence: this.qualityToConfidence(e1.evidenceQuality),
              timestamp: new Date(),
            },
            evidence2: {
              source: e2.evidenceSources.join(', '),
              finding: `${e2.variable}: ${e2.pointEstimate.toFixed(2)}${e2.unit}`,
              confidence: this.qualityToConfidence(e2.evidenceQuality),
              timestamp: new Date(),
            },
            resolution: this.resolveConflict(e1, e2),
            resolutionReasoning: this.explainConflictResolution(e1, e2),
            impactOnConclusions: 'Conflicting estimates reduce confidence in related conclusions.',
          });
        }
      }
    }
  }

  /**
   * Check if two variables are related
   */
  private areRelatedVariables(v1: string, v2: string): boolean {
    const l1 = v1.toLowerCase();
    const l2 = v2.toLowerCase();

    // Same category
    const categories = ['roas', 'cpa', 'ctr', 'cvr', 'spend', 'revenue'];
    for (const cat of categories) {
      if (l1.includes(cat) && l2.includes(cat)) return true;
    }

    return false;
  }

  /**
   * Check if confidence intervals overlap
   */
  private intervalsOverlap(
    ci1: { low: number; high: number },
    ci2: { low: number; high: number }
  ): boolean {
    return ci1.low <= ci2.high && ci2.low <= ci1.high;
  }

  /**
   * Convert evidence quality to confidence number
   */
  private qualityToConfidence(quality: EvidenceQuality): number {
    const map: Record<EvidenceQuality, number> = {
      'strong': 0.85,
      'moderate': 0.65,
      'weak': 0.45,
      'speculative': 0.25,
    };
    return map[quality];
  }

  /**
   * Resolve conflict between two estimates
   */
  private resolveConflict(e1: UncertainEstimate, e2: UncertainEstimate): ConflictResolution {
    const q1 = this.qualityToConfidence(e1.evidenceQuality);
    const q2 = this.qualityToConfidence(e2.evidenceQuality);

    const gap = Math.abs(q1 - q2);

    if (gap > 0.2) {
      return q1 > q2 ? 'evidence1_wins' : 'evidence2_wins';
    }

    // Similar quality - hard to resolve
    if (gap < 0.1) {
      return 'unresolved';
    }

    return 'both_partially_true';
  }

  /**
   * Explain conflict resolution
   */
  private explainConflictResolution(e1: UncertainEstimate, e2: UncertainEstimate): string {
    const resolution = this.resolveConflict(e1, e2);

    if (resolution === 'evidence1_wins') {
      return `${e1.variable} estimate has stronger evidence (${e1.evidenceQuality} vs ${e2.evidenceQuality}).`;
    }
    if (resolution === 'evidence2_wins') {
      return `${e2.variable} estimate has stronger evidence (${e2.evidenceQuality} vs ${e1.evidenceQuality}).`;
    }
    if (resolution === 'both_partially_true') {
      return 'Both estimates may capture different aspects of reality. Consider they measure slightly different things.';
    }
    return 'Unable to resolve conflict with available evidence. Additional data needed.';
  }

  /**
   * Perform sensitivity analysis
   */
  private performSensitivityAnalysis(): void {
    // Analyze each estimate's assumptions
    for (const estimate of this.estimates) {
      for (const assumption of estimate.assumptions) {
        const sensitivity = this.analyzeAssumptionSensitivity(assumption, estimate);
        if (sensitivity) {
          this.sensitivities.push(sensitivity);
        }
      }
    }

    // Add standard sensitivities
    this.addStandardSensitivities();

    // Sort by impact severity
    const severityOrder: Record<ImpactSeverity, number> = {
      'critical': 4,
      'high': 3,
      'medium': 2,
      'low': 1,
    };
    this.sensitivities.sort((a, b) => severityOrder[b.impactSeverity] - severityOrder[a.impactSeverity]);
  }

  /**
   * Analyze sensitivity of a specific assumption
   */
  private analyzeAssumptionSensitivity(
    assumption: string,
    estimate: UncertainEstimate
  ): SensitivityAnalysis | null {
    const lower = assumption.toLowerCase();

    // Determine impact based on assumption type
    let impactSeverity: ImpactSeverity = 'medium';
    let ifWrong = 'Estimate may be off by the uncertainty range.';
    let howToVerify = 'Gather more data to validate assumption.';
    let currentBelief = 0.6;

    if (lower.includes('cac') || lower.includes('cost')) {
      impactSeverity = 'high';
      ifWrong = `If CAC is 30% higher than assumed, ${estimate.variable} impact drops significantly.`;
      howToVerify = 'Track actual CAC for new segments over 2-week period.';
      currentBelief = 0.5;
    }

    if (lower.includes('competitor')) {
      impactSeverity = 'high';
      ifWrong = 'Competitor response could compress expected gains or accelerate losses.';
      howToVerify = 'Monitor competitor activity via Ad Library, set up alerts.';
      currentBelief = 0.4;
    }

    if (lower.includes('seasonality') || lower.includes('seasonal')) {
      impactSeverity = 'medium';
      ifWrong = 'Seasonal effects may amplify or dampen expected changes.';
      howToVerify = 'Compare with same period last year, adjust expectations.';
      currentBelief = 0.7;
    }

    if (lower.includes('stable') || lower.includes('constant')) {
      impactSeverity = 'medium';
      ifWrong = 'If conditions change, estimate becomes less reliable.';
      howToVerify = 'Set up monitoring for key metrics that should stay stable.';
      currentBelief = 0.6;
    }

    if (lower.includes('critical') || lower.includes('fundamental') || lower.includes('core')) {
      impactSeverity = 'critical';
      ifWrong = 'Core assumption failure could invalidate all related conclusions.';
      howToVerify = 'Validate this assumption before proceeding with any major decisions.';
      currentBelief = 0.5;
    }

    return {
      id: `sensitivity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assumption,
      currentBelief,
      ifWrong,
      impactSeverity,
      howToVerify,
      verificationCost: impactSeverity === 'critical' || impactSeverity === 'high' ? 'low' : 'medium',
      recommendVerification: impactSeverity === 'critical' || impactSeverity === 'high',
    };
  }

  /**
   * Add standard sensitivities that apply to most analyses
   */
  private addStandardSensitivities(): void {
    // Attribution accuracy
    this.sensitivities.push({
      id: 'sensitivity_attribution',
      assumption: 'Attribution data accurately reflects true performance',
      currentBelief: 0.6,
      ifWrong: 'All ROAS/CPA estimates could be off by ±15-20%.',
      impactSeverity: 'medium',
      howToVerify: 'Run incrementality test, compare Meta to Shopify.',
      verificationCost: 'medium',
      recommendVerification: true,
    });

    // Platform stability
    this.sensitivities.push({
      id: 'sensitivity_platform',
      assumption: 'Meta platform behavior remains consistent',
      currentBelief: 0.5,
      ifWrong: 'Algorithm or policy changes could invalidate historical patterns.',
      impactSeverity: 'medium',
      howToVerify: 'Monitor platform announcements, maintain testing velocity.',
      verificationCost: 'low',
      recommendVerification: false,
    });

    // Market conditions
    this.sensitivities.push({
      id: 'sensitivity_market',
      assumption: 'Market conditions remain similar',
      currentBelief: 0.5,
      ifWrong: 'External events (macro, competitive, seasonal) could shift all metrics.',
      impactSeverity: 'high',
      howToVerify: 'Track industry news, competitor activity, economic indicators.',
      verificationCost: 'low',
      recommendVerification: false,
    });
  }

  /**
   * Calculate overall uncertainty level
   */
  private calculateOverallUncertainty(): OverallUncertainty {
    // Count estimates by quality
    const qualityCounts: Record<EvidenceQuality, number> = {
      'strong': 0,
      'moderate': 0,
      'weak': 0,
      'speculative': 0,
    };
    for (const e of this.estimates) {
      qualityCounts[e.evidenceQuality]++;
    }

    // Count conflicts
    const unresolvedConflicts = this.conflicts.filter(c => c.resolution === 'unresolved').length;

    // Count high-impact sensitivities
    const criticalSensitivities = this.sensitivities.filter(
      s => s.impactSeverity === 'critical' || s.impactSeverity === 'high'
    ).length;

    // Determine overall level
    let level: 'low' | 'moderate' | 'high' | 'very_high';
    let confidenceInConclusions: ConfidenceLevel;

    if (qualityCounts['speculative'] > qualityCounts['strong'] || unresolvedConflicts >= 2 || criticalSensitivities >= 3) {
      level = 'very_high';
      confidenceInConclusions = 'weak_hypothesis';
    } else if (qualityCounts['weak'] > qualityCounts['moderate'] || unresolvedConflicts >= 1 || criticalSensitivities >= 2) {
      level = 'high';
      confidenceInConclusions = 'early_signal';
    } else if (qualityCounts['moderate'] >= qualityCounts['strong']) {
      level = 'moderate';
      confidenceInConclusions = 'moderate_evidence';
    } else {
      level = 'low';
      confidenceInConclusions = 'strong_signal';
    }

    // Identify primary drivers
    const primaryDrivers: string[] = [];
    if (qualityCounts['weak'] + qualityCounts['speculative'] > 0) {
      primaryDrivers.push('Limited evidence quality on some estimates');
    }
    if (unresolvedConflicts > 0) {
      primaryDrivers.push(`${unresolvedConflicts} unresolved evidence conflicts`);
    }
    if (criticalSensitivities > 0) {
      primaryDrivers.push(`${criticalSensitivities} high-impact assumptions not verified`);
    }
    for (const e of this.estimates) {
      if (e.majorUncertaintySources.some(s => s.impact === 'critical')) {
        primaryDrivers.push(`Critical uncertainty in ${e.variable}`);
      }
    }

    // Recommendation
    let recommendation: string;
    if (level === 'very_high') {
      recommendation = 'Uncertainty is very high. Avoid major decisions until more data is gathered. Focus on verification.';
    } else if (level === 'high') {
      recommendation = 'Uncertainty is significant. Proceed cautiously with smaller tests before committing fully.';
    } else if (level === 'moderate') {
      recommendation = 'Uncertainty is manageable. Proceed with monitoring and be ready to adjust.';
    } else {
      recommendation = 'Uncertainty is low. Confidence in conclusions is reasonable for decision-making.';
    }

    return {
      level,
      primaryDrivers: primaryDrivers.slice(0, 4),
      recommendation,
      confidenceInConclusions,
    };
  }

  /**
   * Build operator-friendly uncertainty report
   */
  private buildOperatorReport(overall: OverallUncertainty): UncertaintyReport {
    // Headline
    const levelLanguage: Record<string, string> = {
      'low': 'High confidence in estimates',
      'moderate': 'Reasonable confidence, some uncertainty',
      'high': 'Significant uncertainty - proceed with caution',
      'very_high': 'High uncertainty - more data needed before acting',
    };
    const headline = levelLanguage[overall.level];

    // Key estimates with uncertainty
    const keyEstimates = this.estimates.slice(0, 5).map(e => {
      const range = `${e.confidenceInterval.low.toFixed(1)} to ${e.confidenceInterval.high.toFixed(1)}${e.unit}`;
      return `${e.variable}: ${e.pointEstimate.toFixed(1)}${e.unit} (80% CI: ${range}, evidence: ${e.evidenceQuality})`;
    });

    // Critical assumptions
    const criticalAssumptions = this.sensitivities
      .filter(s => s.impactSeverity === 'critical' || s.impactSeverity === 'high')
      .slice(0, 3)
      .map(s => `${s.assumption} (if wrong: ${s.ifWrong})`);

    // Conflicts to resolve
    const conflictsToResolve = this.conflicts
      .filter(c => c.resolution === 'unresolved')
      .map(c => `${c.topic}: ${c.evidence1.finding} vs ${c.evidence2.finding}`);

    // Sensitivity warnings
    const sensitivityWarnings = this.sensitivities
      .filter(s => s.recommendVerification)
      .slice(0, 3)
      .map(s => `Verify: ${s.assumption} (${s.howToVerify})`);

    // What could go wrong
    const whatCouldGoWrong: string[] = [];
    for (const e of this.estimates) {
      for (const source of e.majorUncertaintySources) {
        if (source.impact === 'critical' || source.impact === 'high') {
          whatCouldGoWrong.push(`${source.name}: ${source.description}`);
        }
      }
    }

    // Recommendation
    let recommendation: string;
    if (overall.level === 'very_high' || overall.level === 'high') {
      const topVerification = this.sensitivities.find(s => s.recommendVerification);
      recommendation = topVerification
        ? `Before acting: ${topVerification.howToVerify}`
        : 'Gather more data before making major decisions.';
    } else {
      recommendation = 'Proceed with planned actions while monitoring key uncertainties.';
    }

    return {
      headline,
      keyEstimates,
      criticalAssumptions,
      conflictsToResolve,
      sensitivityWarnings,
      whatCouldGoWrong: [...new Set(whatCouldGoWrong)].slice(0, 4),
      recommendation,
    };
  }

  /**
   * Record a prediction for calibration tracking
   */
  recordPrediction(
    prediction: string,
    predictedValue: number,
    confidenceInterval: { low: number; high: number },
    confidenceLevel: number = 0.8
  ): string {
    const record: CalibrationRecord = {
      id: `pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      prediction,
      predictedValue,
      confidenceInterval,
      confidenceLevel,
      predictionDate: new Date(),
      outcomeDate: null,
      actualValue: null,
      wasAccurate: null,
      errorMagnitude: null,
      lessonsLearned: null,
    };

    this.calibrationHistory.push(record);
    return record.id;
  }

  /**
   * Update a prediction with actual outcome
   */
  recordOutcome(
    predictionId: string,
    actualValue: number,
    lessonsLearned?: string
  ): void {
    const record = this.calibrationHistory.find(r => r.id === predictionId);
    if (!record) return;

    record.outcomeDate = new Date();
    record.actualValue = actualValue;
    record.wasAccurate = actualValue >= record.confidenceInterval.low &&
                         actualValue <= record.confidenceInterval.high;
    record.errorMagnitude = Math.abs(actualValue - record.predictedValue) / Math.abs(record.predictedValue);
    record.lessonsLearned = lessonsLearned || null;
  }

  /**
   * Get calibration summary
   */
  getCalibrationSummary(): {
    totalPredictions: number;
    completed: number;
    accurate: number;
    accuracyRate: number;
    averageError: number;
  } {
    const completed = this.calibrationHistory.filter(r => r.actualValue !== null);
    const accurate = completed.filter(r => r.wasAccurate);

    return {
      totalPredictions: this.calibrationHistory.length,
      completed: completed.length,
      accurate: accurate.length,
      accuracyRate: completed.length > 0 ? accurate.length / completed.length : 0,
      averageError: completed.length > 0
        ? completed.reduce((sum, r) => sum + (r.errorMagnitude || 0), 0) / completed.length
        : 0,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createUncertaintyIntelligenceEngine(
  clientId: string,
  monthlySpend: number,
): UncertaintyIntelligenceEngine {
  return new UncertaintyIntelligenceEngine(clientId, monthlySpend);
}

// ============================================================================
// Convenience Function
// ============================================================================

export async function analyzeUncertainty(
  inputs: UncertaintyInput[],
  clientId: string,
  monthlySpend: number,
): Promise<UncertaintyAnalysisResult> {
  const engine = createUncertaintyIntelligenceEngine(clientId, monthlySpend);
  return engine.analyze(inputs);
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format an uncertain estimate for operator display
 */
export function formatUncertainEstimate(estimate: UncertainEstimate): string {
  const { variable, pointEstimate, unit, confidenceInterval, distribution, evidenceQuality, majorUncertaintySources } = estimate;

  const distributionDesc: Record<DistributionType, string> = {
    'normal': 'symmetric',
    'uniform': 'uniform',
    'skewed_right': 'more upside potential',
    'skewed_left': 'more downside risk',
    'bimodal': 'two likely outcomes',
  };

  let output = `${variable} estimate:\n`;
  output += `  Point estimate: ${pointEstimate.toFixed(2)}${unit}\n`;
  output += `  80% confidence interval: ${confidenceInterval.low.toFixed(2)} to ${confidenceInterval.high.toFixed(2)}${unit}\n`;
  output += `  Distribution: ${distributionDesc[distribution]}\n`;
  output += `  Evidence quality: ${evidenceQuality}\n`;

  if (majorUncertaintySources.length > 0) {
    output += `  Key uncertainties:\n`;
    for (const source of majorUncertaintySources.slice(0, 3)) {
      output += `    - ${source.name}: ${source.description}\n`;
    }
  }

  return output;
}
