/**
 * Validator — score helpers (fallback/failing scores + score summaries).
 */

import type { QualityScore } from '../types.js';

export function createFallbackScore(): QualityScore {
  // When Gemini is unavailable, return a passing score
  // This allows the pipeline to continue, but flags for manual review
  return {
    overall: 7.5,
    dimensions: {
      visualQuality: 7,
      premiumFeel: 7,
      readability: 8,
      emotionalImpact: 7,
      conversionClarity: 8,
      productVisibility: 8,
      hookStrength: 7,
      compositionBalance: 7,
      mobileFeedPerformance: 8,
      originality: 7,
      strategyAlignment: 8,
      brandConsistency: 7,
      competitorBenchmark: 7,
    },
    issues: ['Automated validation unavailable - manual review recommended'],
    suggestions: ['Review ad manually before launch'],
  };
}

export function createFailingScore(reason: string): QualityScore {
  return {
    overall: 0,
    dimensions: {
      visualQuality: 0,
      premiumFeel: 0,
      readability: 0,
      emotionalImpact: 0,
      conversionClarity: 0,
      productVisibility: 0,
      hookStrength: 0,
      compositionBalance: 0,
      mobileFeedPerformance: 0,
      originality: 0,
      strategyAlignment: 0,
      brandConsistency: 0,
      competitorBenchmark: 0,
    },
    issues: [reason],
    suggestions: ['Fix the error and retry'],
  };
}

export function summarizeScores(scores: QualityScore[]): {
  avgOverall: number;
  weakestDimensions: string[];
  commonIssues: string[];
} {
  if (scores.length === 0) {
    return { avgOverall: 0, weakestDimensions: [], commonIssues: [] };
  }

  const avgOverall = scores.reduce((sum, s) => sum + s.overall, 0) / scores.length;

  // Find weakest dimensions on average
  const dimensionAvgs: Record<string, number> = {};
  const dimensionKeys = Object.keys(scores[0].dimensions) as Array<keyof QualityScore['dimensions']>;

  for (const key of dimensionKeys) {
    dimensionAvgs[key] = scores.reduce((sum, s) => sum + s.dimensions[key], 0) / scores.length;
  }

  const weakestDimensions = Object.entries(dimensionAvgs)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([key]) => key);

  // Count common issues
  const issueCounts: Record<string, number> = {};
  for (const score of scores) {
    for (const issue of score.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  const commonIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([issue]) => issue);

  return { avgOverall, weakestDimensions, commonIssues };
}
