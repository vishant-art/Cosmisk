/**
 * Uncertainty Calculation Helpers
 */

import { type DistributionType, type EvidenceQuality, type ImpactSeverity } from './types.js';

/**
 * Calculate mean from array of estimates
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
export function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calculate confidence interval
 */
export function calculateConfidenceInterval(
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
export function detectDistribution(values: number[], mean: number): DistributionType {
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
export function assessEvidenceQuality(
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
export function assessImpactSeverity(
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
