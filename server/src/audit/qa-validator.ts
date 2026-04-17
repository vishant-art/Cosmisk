/**
 * QA Validator - Ensures audit output quality
 */

import type { AuditOutput, AuditInsight, AuditRecommendation } from './types.js';

interface QAResult {
  passed: boolean;
  score: number; // 0-100
  issues: QAIssue[];
  suggestions: string[];
}

interface QAIssue {
  severity: 'critical' | 'warning' | 'minor';
  category: string;
  message: string;
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

  // 5. Generate suggestions
  if (audit.creativeAnalysis.winners.length === 0) {
    suggestions.push('No winning creatives identified - consider lowering CPA threshold');
  }
  if (audit.creativeAnalysis.losers.length === 0 && audit.summary.wastedSpend > 0) {
    suggestions.push('Wasted spend exists but no losers identified - review classification logic');
  }
  if (audit.creativeAnalysis.recommendations.length < 3) {
    suggestions.push('Add more actionable recommendations for comprehensive audit');
  }

  // Calculate pass/fail
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const passed = criticalCount === 0 && score >= 60;

  return {
    passed,
    score: Math.max(0, score),
    issues,
    suggestions,
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
 * Format QA result for logging
 */
export function formatQAResult(result: QAResult): string {
  const lines: string[] = [];

  lines.push(`QA Score: ${result.score}/100 ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);

  if (result.issues.length > 0) {
    lines.push('\nIssues:');
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
