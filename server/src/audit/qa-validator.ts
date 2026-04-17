/**
 * QA Validator - Ensures audit output quality and data integrity
 */

import type { AuditOutput, AuditInsight, AuditRecommendation, CreativePerformance } from './types.js';

interface QAResult {
  passed: boolean;
  score: number; // 0-100
  issues: QAIssue[];
  suggestions: string[];
  dataIntegrity: DataIntegrityResult;
  humanReviewRequired: boolean;
  humanReviewReasons: string[];
}

interface QAIssue {
  severity: 'critical' | 'warning' | 'minor';
  category: string;
  message: string;
}

interface DataIntegrityResult {
  passed: boolean;
  calculationErrors: CalculationError[];
  sanityViolations: SanityViolation[];
}

interface CalculationError {
  field: string;
  expected: number;
  actual: number;
  creative?: string;
  message: string;
}

interface SanityViolation {
  field: string;
  value: number;
  rule: string;
  creative?: string;
}

/**
 * Validate audit output quality
 */
export function validateAuditQuality(audit: AuditOutput): QAResult {
  const issues: QAIssue[] = [];
  const suggestions: string[] = [];
  let score = 100;

  // 1. Check insights quality
  const insightIssues = validateInsights(audit.creativeAnalysis.insights);
  issues.push(...insightIssues.issues);
  score -= insightIssues.deduction;

  // 2. Check recommendations quality
  const recIssues = validateRecommendations(audit.creativeAnalysis.recommendations);
  issues.push(...recIssues.issues);
  score -= recIssues.deduction;

  // 3. Check winners/losers analysis
  const analysisIssues = validateAnalysis(audit);
  issues.push(...analysisIssues.issues);
  score -= analysisIssues.deduction;

  // 4. Check summary consistency
  const summaryIssues = validateSummary(audit);
  issues.push(...summaryIssues.issues);
  score -= summaryIssues.deduction;

  // 5. DATA INTEGRITY VALIDATION (New)
  const dataIntegrity = validateDataIntegrity(audit);
  if (!dataIntegrity.passed) {
    for (const error of dataIntegrity.calculationErrors) {
      issues.push({
        severity: 'critical',
        category: 'data-integrity',
        message: error.message,
      });
      score -= 15;
    }
    for (const violation of dataIntegrity.sanityViolations) {
      issues.push({
        severity: violation.value < 0 ? 'critical' : 'warning',
        category: 'sanity-check',
        message: `${violation.field}: ${violation.value} violates rule "${violation.rule}"${violation.creative ? ` (${violation.creative})` : ''}`,
      });
      score -= violation.value < 0 ? 15 : 5;
    }
  }

  // 6. HUMAN REVIEW FLAGS (New)
  const humanReview = flagForHumanReview(audit);

  // 7. Generate suggestions
  if (audit.creativeAnalysis.winners.length === 0) {
    suggestions.push('No winning creatives identified - consider lowering CPA threshold');
  }
  if (audit.creativeAnalysis.losers.length === 0 && audit.summary.wastedSpend > 0) {
    suggestions.push('Wasted spend exists but no losers identified - review classification logic');
  }
  if (audit.creativeAnalysis.recommendations.length < 3) {
    suggestions.push('Add more actionable recommendations for comprehensive audit');
  }
  if (humanReview.required) {
    suggestions.push('⚠️ Manual review recommended due to unusual patterns');
  }

  // Calculate pass/fail
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const passed = criticalCount === 0 && score >= 60 && dataIntegrity.passed;

  return {
    passed,
    score: Math.max(0, score),
    issues,
    suggestions,
    dataIntegrity,
    humanReviewRequired: humanReview.required,
    humanReviewReasons: humanReview.reasons,
  };
}

/**
 * Validate insights quality
 */
function validateInsights(insights: AuditInsight[]): { issues: QAIssue[]; deduction: number } {
  const issues: QAIssue[] = [];
  let deduction = 0;

  // Check minimum insights count
  if (insights.length === 0) {
    issues.push({
      severity: 'critical',
      category: 'insights',
      message: 'No insights generated',
    });
    deduction += 30;
  } else if (insights.length < 2) {
    issues.push({
      severity: 'warning',
      category: 'insights',
      message: 'Too few insights - expected at least 2',
    });
    deduction += 10;
  }

  // Check for generic insights
  const genericPhrases = [
    'optimize your ads',
    'improve performance',
    'test more creatives',
    'increase budget',
    'better targeting',
  ];

  for (const insight of insights) {
    const lowerDetail = insight.detail.toLowerCase();

    // Check for generic advice
    for (const phrase of genericPhrases) {
      if (lowerDetail.includes(phrase) && !lowerDetail.includes('₹') && !lowerDetail.includes('%')) {
        issues.push({
          severity: 'warning',
          category: 'insights',
          message: `Generic insight: "${insight.title}" - should include specific data`,
        });
        deduction += 5;
        break;
      }
    }

    // Check if insight references data
    const hasNumbers = /\d/.test(insight.detail);
    if (!hasNumbers) {
      issues.push({
        severity: 'minor',
        category: 'insights',
        message: `Insight "${insight.title}" lacks specific numbers`,
      });
      deduction += 2;
    }
  }

  return { issues, deduction };
}

/**
 * Validate recommendations quality
 */
function validateRecommendations(recommendations: AuditRecommendation[]): { issues: QAIssue[]; deduction: number } {
  const issues: QAIssue[] = [];
  let deduction = 0;

  // Check minimum recommendations count
  if (recommendations.length === 0) {
    issues.push({
      severity: 'critical',
      category: 'recommendations',
      message: 'No recommendations generated',
    });
    deduction += 25;
  }

  // Check for high priority recommendations
  const highPriority = recommendations.filter(r => r.priority === 'high');
  if (recommendations.length > 0 && highPriority.length === 0) {
    issues.push({
      severity: 'warning',
      category: 'recommendations',
      message: 'No high priority recommendations - audit may lack urgency',
    });
    deduction += 5;
  }

  // Check recommendation quality
  for (const rec of recommendations) {
    // Check description length
    if (rec.description.length < 20) {
      issues.push({
        severity: 'minor',
        category: 'recommendations',
        message: `Recommendation "${rec.title}" has too brief description`,
      });
      deduction += 2;
    }

    // Check expected impact
    if (rec.expectedImpact.length < 10) {
      issues.push({
        severity: 'minor',
        category: 'recommendations',
        message: `Recommendation "${rec.title}" lacks clear expected impact`,
      });
      deduction += 2;
    }
  }

  return { issues, deduction };
}

/**
 * Validate winners/losers analysis
 */
function validateAnalysis(audit: AuditOutput): { issues: QAIssue[]; deduction: number } {
  const issues: QAIssue[] = [];
  let deduction = 0;

  const { winners, losers } = audit.creativeAnalysis;

  // Check winner reasons
  for (const winner of winners) {
    if (winner.whyItWorks === 'High conversion rate with efficient spend') {
      issues.push({
        severity: 'warning',
        category: 'analysis',
        message: `Winner "${winner.creative.adName}" has default reason - should be specific`,
      });
      deduction += 3;
    }
  }

  // Check loser reasons
  for (const loser of losers) {
    if (loser.whyItFails === 'Low conversion despite significant spend') {
      issues.push({
        severity: 'warning',
        category: 'analysis',
        message: `Loser "${loser.creative.adName}" has default reason - should be specific`,
      });
      deduction += 3;
    }
  }

  return { issues, deduction };
}

/**
 * Validate summary consistency
 */
function validateSummary(audit: AuditOutput): { issues: QAIssue[]; deduction: number } {
  const issues: QAIssue[] = [];
  let deduction = 0;

  const { summary, creativeAnalysis } = audit;

  // Check health score is reasonable
  if (summary.healthScore < 0 || summary.healthScore > 100) {
    issues.push({
      severity: 'critical',
      category: 'summary',
      message: `Invalid health score: ${summary.healthScore}`,
    });
    deduction += 20;
  }

  // Check top findings match insights
  if (summary.topFindings.length === 0 && creativeAnalysis.insights.length > 0) {
    issues.push({
      severity: 'warning',
      category: 'summary',
      message: 'Top findings empty but insights exist',
    });
    deduction += 5;
  }

  // Check wasted spend consistency
  if (summary.wastedSpend !== creativeAnalysis.wastedSpend.total) {
    issues.push({
      severity: 'minor',
      category: 'summary',
      message: 'Wasted spend mismatch between summary and analysis',
    });
    deduction += 2;
  }

  return { issues, deduction };
}

/**
 * Validate data integrity - cross-check calculations
 */
function validateDataIntegrity(audit: AuditOutput): DataIntegrityResult {
  const calculationErrors: CalculationError[] = [];
  const sanityViolations: SanityViolation[] = [];

  // Collect all creatives for validation
  const displayedCreatives: CreativePerformance[] = [
    ...audit.creativeAnalysis.winners.map(w => w.creative),
    ...audit.creativeAnalysis.losers.map(l => l.creative),
  ];

  // 1. Cross-check CPA calculations for each creative
  for (const creative of displayedCreatives) {
    const { spend, purchases, cpa } = creative;
    const conversions = purchases; // purchases are the conversions

    // CPA = spend / conversions (when conversions > 0)
    if (conversions > 0) {
      const expectedCpa = spend / conversions;
      const tolerance = 0.01; // 1% tolerance for rounding

      if (Math.abs(expectedCpa - cpa) / expectedCpa > tolerance) {
        calculationErrors.push({
          field: 'CPA',
          expected: expectedCpa,
          actual: cpa,
          creative: creative.adName,
          message: `CPA mismatch for "${creative.adName}": expected ₹${expectedCpa.toFixed(2)} (spend/conversions), got ₹${cpa.toFixed(2)}`,
        });
      }
    } else if (cpa > 0 && conversions === 0) {
      // CPA should be 0 or undefined when no conversions
      calculationErrors.push({
        field: 'CPA',
        expected: 0,
        actual: cpa,
        creative: creative.adName,
        message: `Invalid CPA for "${creative.adName}": CPA is ₹${cpa} but conversions is 0`,
      });
    }

    // 2. Cross-check ROAS calculations
    if (creative.roas !== undefined && spend > 0) {
      // ROAS = revenue / spend
      // We can't verify revenue directly, but we can sanity check
      const impliedRevenue = creative.roas * spend;

      // Check ROAS makes sense with conversions
      if (conversions === 0 && creative.roas > 0) {
        calculationErrors.push({
          field: 'ROAS',
          expected: 0,
          actual: creative.roas,
          creative: creative.adName,
          message: `Invalid ROAS for "${creative.adName}": ROAS is ${creative.roas}x but conversions is 0`,
        });
      }
    }

    // 3. Sanity checks for impossible values
    if (spend < 0) {
      sanityViolations.push({
        field: 'Spend',
        value: spend,
        rule: 'Spend cannot be negative',
        creative: creative.adName,
      });
    }

    if (conversions < 0) {
      sanityViolations.push({
        field: 'Conversions',
        value: conversions,
        rule: 'Conversions cannot be negative',
        creative: creative.adName,
      });
    }

    if (creative.roas && creative.roas > 100) {
      sanityViolations.push({
        field: 'ROAS',
        value: creative.roas,
        rule: 'ROAS exceeds 100x (extremely unusual)',
        creative: creative.adName,
      });
    }

    if (creative.roas && creative.roas < 0) {
      sanityViolations.push({
        field: 'ROAS',
        value: creative.roas,
        rule: 'ROAS cannot be negative',
        creative: creative.adName,
      });
    }

    if (cpa < 0) {
      sanityViolations.push({
        field: 'CPA',
        value: cpa,
        rule: 'CPA cannot be negative',
        creative: creative.adName,
      });
    }

    if (creative.impressions && creative.impressions < 0) {
      sanityViolations.push({
        field: 'Impressions',
        value: creative.impressions,
        rule: 'Impressions cannot be negative',
        creative: creative.adName,
      });
    }

    if (creative.clicks && creative.clicks < 0) {
      sanityViolations.push({
        field: 'Clicks',
        value: creative.clicks,
        rule: 'Clicks cannot be negative',
        creative: creative.adName,
      });
    }

    // Clicks should not exceed impressions
    if (creative.clicks && creative.impressions && creative.clicks > creative.impressions) {
      sanityViolations.push({
        field: 'Clicks',
        value: creative.clicks,
        rule: `Clicks (${creative.clicks}) exceed impressions (${creative.impressions})`,
        creative: creative.adName,
      });
    }
  }

  // 4. Validate wasted spend consistency
  // Note: wastedSpend.total includes ALL creatives with 0-1 purchases
  // wastedSpend.creatives is limited to top 10 for display
  // losers is limited to top 5 with high spend threshold (different criteria)

  const listedWastedSum = audit.creativeAnalysis.wastedSpend.creatives.reduce(
    (sum, c) => sum + c.amount,
    0
  );

  // The total should be >= sum of listed creatives (since listed is a subset)
  if (audit.creativeAnalysis.wastedSpend.total > 0 && listedWastedSum > 0) {
    if (listedWastedSum > audit.creativeAnalysis.wastedSpend.total * 1.01) { // 1% tolerance
      calculationErrors.push({
        field: 'Wasted Spend',
        expected: audit.creativeAnalysis.wastedSpend.total,
        actual: listedWastedSum,
        message: `Wasted spend inconsistency: listed creatives sum (₹${listedWastedSum.toFixed(2)}) exceeds total (₹${audit.creativeAnalysis.wastedSpend.total.toFixed(2)})`,
      });
    }
  }

  // Verify loser spend is included in wasted spend (losers should be subset of wasted)
  const totalLoserSpend = audit.creativeAnalysis.losers.reduce(
    (sum, l) => sum + l.creative.spend,
    0
  );

  if (totalLoserSpend > audit.creativeAnalysis.wastedSpend.total * 1.01) {
    calculationErrors.push({
      field: 'Loser Spend',
      expected: audit.creativeAnalysis.wastedSpend.total,
      actual: totalLoserSpend,
      message: `Loser spend (₹${totalLoserSpend.toFixed(2)}) exceeds total wasted (₹${audit.creativeAnalysis.wastedSpend.total.toFixed(2)}) - losers should be subset of wasted`,
    });
  }

  // 5. Validate health score range
  if (audit.summary.healthScore < 0 || audit.summary.healthScore > 100) {
    sanityViolations.push({
      field: 'Health Score',
      value: audit.summary.healthScore,
      rule: 'Health score must be between 0 and 100',
    });
  }

  return {
    passed: calculationErrors.length === 0 && sanityViolations.filter(v => v.value < 0).length === 0,
    calculationErrors,
    sanityViolations,
  };
}

/**
 * Flag audits that need human review
 */
function flagForHumanReview(audit: AuditOutput): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // 1. Extremely low or high health scores
  if (audit.summary.healthScore <= 10) {
    reasons.push(`Very low health score (${audit.summary.healthScore}/100) - verify data accuracy`);
  }
  if (audit.summary.healthScore >= 95) {
    reasons.push(`Unusually high health score (${audit.summary.healthScore}/100) - verify no data issues`);
  }

  // 2. High wasted spend percentage
  // Note: winners + losers don't represent ALL creatives (they're limited subsets)
  // wastedSpend.total is the accurate total of all non-performing spend
  const displayedCreatives = [
    ...audit.creativeAnalysis.winners.map(w => w.creative),
    ...audit.creativeAnalysis.losers.map(l => l.creative),
  ];
  const displayedSpend = displayedCreatives.reduce((sum, c) => sum + c.spend, 0);

  // Use the larger of displayed spend or wasted spend as denominator
  // (wasted can exceed displayed since displayed only shows top performers)
  const estimatedTotalSpend = Math.max(displayedSpend, audit.creativeAnalysis.wastedSpend.total);
  const totalSpend = estimatedTotalSpend;

  if (totalSpend > 0) {
    const wastedPercent = (audit.creativeAnalysis.wastedSpend.total / totalSpend) * 100;
    if (wastedPercent > 80) {
      reasons.push(`${wastedPercent.toFixed(1)}% of spend classified as wasted - verify thresholds`);
    }
  }

  // 3. No winners despite significant spend
  if (audit.creativeAnalysis.winners.length === 0 && totalSpend > 50000) {
    reasons.push(`No winning creatives despite ₹${totalSpend.toFixed(0)} total spend`);
  }

  // 4. All creatives are winners (suspicious)
  if (audit.creativeAnalysis.losers.length === 0 && audit.creativeAnalysis.winners.length > 5) {
    reasons.push('All creatives classified as winners - verify classification logic');
  }

  // 5. Extreme CPA variations
  const cpas = displayedCreatives.filter(c => c.cpa > 0).map(c => c.cpa);
  if (cpas.length >= 2) {
    const minCpa = Math.min(...cpas);
    const maxCpa = Math.max(...cpas);
    if (maxCpa > minCpa * 50) {
      reasons.push(`Extreme CPA variation: ₹${minCpa.toFixed(0)} to ₹${maxCpa.toFixed(0)} (${(maxCpa/minCpa).toFixed(0)}x difference)`);
    }
  }

  // 6. Very high or low ROAS
  const roasValues = displayedCreatives.filter(c => c.roas !== undefined && c.roas > 0).map(c => c.roas!);
  if (roasValues.some(r => r > 20)) {
    reasons.push(`ROAS exceeds 20x for some creatives - verify tracking accuracy`);
  }

  // 7. Low data volume
  const totalConversions = displayedCreatives.reduce((sum, c) => sum + c.purchases, 0);
  if (totalConversions < 10 && totalSpend > 10000) {
    reasons.push(`Only ${totalConversions} purchases despite ₹${totalSpend.toFixed(0)} spend - low statistical significance`);
  }

  // 8. Unusual date range
  const start = new Date(audit.dateRange.start);
  const end = new Date(audit.dateRange.end);
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > 90) {
    reasons.push(`Date range spans ${daysDiff} days - long analysis period may mask trends`);
  }
  if (daysDiff < 3) {
    reasons.push(`Date range only ${daysDiff} days - very short period, data may not be representative`);
  }

  return {
    required: reasons.length > 0,
    reasons,
  };
}

/**
 * Format QA result for logging
 */
export function formatQAResult(result: QAResult): string {
  const lines: string[] = [];

  lines.push(`QA Score: ${result.score}/100 ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);

  // Data Integrity Status
  if (result.dataIntegrity) {
    const integrityIcon = result.dataIntegrity.passed ? '✅' : '❌';
    lines.push(`Data Integrity: ${integrityIcon} ${result.dataIntegrity.passed ? 'VALID' : 'ISSUES FOUND'}`);

    if (result.dataIntegrity.calculationErrors.length > 0) {
      lines.push('\nCalculation Errors:');
      for (const error of result.dataIntegrity.calculationErrors) {
        lines.push(`  🔴 ${error.message}`);
      }
    }

    if (result.dataIntegrity.sanityViolations.length > 0) {
      lines.push('\nSanity Violations:');
      for (const violation of result.dataIntegrity.sanityViolations) {
        const icon = violation.value < 0 ? '🔴' : '🟡';
        lines.push(`  ${icon} ${violation.field}: ${violation.rule}${violation.creative ? ` (${violation.creative})` : ''}`);
      }
    }
  }

  // Human Review Required
  if (result.humanReviewRequired) {
    lines.push('\n⚠️  HUMAN REVIEW RECOMMENDED:');
    for (const reason of result.humanReviewReasons) {
      lines.push(`  • ${reason}`);
    }
  }

  if (result.issues.length > 0) {
    lines.push('\nQuality Issues:');
    for (const issue of result.issues) {
      const icon = issue.severity === 'critical' ? '🔴' :
                   issue.severity === 'warning' ? '🟡' : '🔵';
      lines.push(`  ${icon} [${issue.category}] ${issue.message}`);
    }
  }

  if (result.suggestions.length > 0) {
    lines.push('\nSuggestions:');
    for (const suggestion of result.suggestions) {
      lines.push(`  💡 ${suggestion}`);
    }
  }

  return lines.join('\n');
}

/**
 * Quick validation check - returns true if data is valid for export
 */
export function isAuditDataValid(audit: AuditOutput): boolean {
  const integrity = validateDataIntegrity(audit);

  // Critical: no negative values or calculation errors
  const hasCriticalIssues = integrity.calculationErrors.length > 0 ||
    integrity.sanityViolations.some(v => v.value < 0);

  return !hasCriticalIssues;
}

/**
 * Get human review reasons without running full validation
 */
export function getHumanReviewFlags(audit: AuditOutput): string[] {
  return flagForHumanReview(audit).reasons;
}
