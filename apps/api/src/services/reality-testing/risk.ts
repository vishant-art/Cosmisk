/**
 * Reality Testing — 5. Deployment Risk Mitigation
 *
 * Handles trust calibration issues and deployment risks.
 */

import type {
  RiskAssessment,
  IntelligenceMetrics,
  OperatorProfile,
  FeedbackInsights,
} from './types.js';
import { recommendationStore } from './stores.js';

/**
 * Assess deployment risks for a client
 */
export function assessDeploymentRisks(
  clientId: string,
  metrics: IntelligenceMetrics,
  profile?: OperatorProfile,
  feedback?: FeedbackInsights
): RiskAssessment {
  const risks: RiskAssessment['risks'] = [];

  // Check for overtrust
  if (metrics.insightAdoptionRate > 90 && metrics.strategicAccuracy < 70) {
    risks.push({
      type: 'overtrust',
      level: 'high',
      indicators: [
        `${metrics.insightAdoptionRate}% adoption rate`,
        `Only ${metrics.strategicAccuracy}% accuracy`,
        'Acting without verification',
      ],
      mitigation: 'Add confidence warnings. Require manual verification for low-confidence recommendations.',
    });
  }

  // Check for undertrust
  if (metrics.insightAdoptionRate < 15 && metrics.strategicAccuracy > 60) {
    risks.push({
      type: 'undertrust',
      level: 'moderate',
      indicators: [
        `Only ${metrics.insightAdoptionRate}% adoption`,
        `${metrics.strategicAccuracy}% accuracy (good)`,
        'Missing valid opportunities',
      ],
      mitigation: 'Build trust through prediction scorecards. Highlight successful past predictions.',
    });
  }

  // Check for insight fatigue
  if (profile && profile.actionRate < 10 && feedback && feedback.averageRating < 3) {
    risks.push({
      type: 'insight_fatigue',
      level: 'high',
      indicators: [
        'Declining engagement',
        'Low ratings',
        'Reduced session frequency',
      ],
      mitigation: 'Reduce insight volume. Focus on highest-impact only. Add novelty.',
    });
  }

  // Check for recommendation overload
  const recsCount = recommendationStore.get(clientId)?.length || 0;
  if (recsCount > 50 && metrics.insightAdoptionRate < 20) {
    risks.push({
      type: 'recommendation_overload',
      level: 'moderate',
      indicators: [
        `${recsCount} recommendations in queue`,
        'Low action rate',
        'Decision paralysis signals',
      ],
      mitigation: 'Implement THE ONE THING prioritization. Hide lower-priority items.',
    });
  }

  // Check for prediction drift
  if (metrics.strategicAccuracy < 50) {
    risks.push({
      type: 'prediction_drift',
      level: 'high',
      indicators: [
        `${metrics.strategicAccuracy}% accuracy`,
        'Below 50% threshold',
        'Predictions losing calibration',
      ],
      mitigation: 'Recalibrate prediction models. Increase evidence requirements.',
    });
  }

  // Check for intelligence decay
  if (metrics.wowFactorScore < 30) {
    risks.push({
      type: 'intelligence_decay',
      level: 'moderate',
      indicators: [
        `${metrics.wowFactorScore}% wow factor`,
        'Insights becoming routine',
        'No new patterns detected',
      ],
      mitigation: 'Introduce new signal sources. Refresh pattern detection algorithms.',
    });
  }

  // Check for operator dependency
  if (profile && profile.trustLevel === 'high' && profile.actionRate > 80) {
    risks.push({
      type: 'operator_dependency',
      level: 'low',
      indicators: [
        'High reliance on system',
        'Reduced independent analysis',
      ],
      mitigation: 'Encourage critical thinking. Show reasoning for all recommendations.',
    });
  }

  // Calculate overall risk
  const highRisks = risks.filter(r => r.level === 'high').length;
  const moderateRisks = risks.filter(r => r.level === 'moderate').length;

  let overallRisk: RiskAssessment['overallRisk'] = 'low';
  if (highRisks >= 2) overallRisk = 'critical';
  else if (highRisks >= 1) overallRisk = 'high';
  else if (moderateRisks >= 2) overallRisk = 'moderate';

  // Priority actions
  const priorityActions = risks
    .filter(r => r.level === 'high')
    .map(r => r.mitigation)
    .slice(0, 3);

  return {
    clientId,
    assessedAt: new Date().toISOString(),
    overallRisk,
    risks,
    priorityActions,
  };
}

/**
 * Format risk assessment
 */
export function formatRiskAssessment(assessment: RiskAssessment): string {
  const riskEmoji = {
    low: '🟢',
    moderate: '🟡',
    high: '🟠',
    critical: '🔴',
  };

  const parts: string[] = [];

  parts.push(`**DEPLOYMENT RISK ASSESSMENT** ${riskEmoji[assessment.overallRisk]}`);
  parts.push(`Overall Risk: ${assessment.overallRisk.toUpperCase()}\n`);

  if (assessment.risks.length === 0) {
    parts.push('No significant risks detected.');
  } else {
    for (const risk of assessment.risks) {
      parts.push(`**${risk.type.replace(/_/g, ' ')}** (${risk.level})`);
      parts.push(`- Indicators: ${risk.indicators.slice(0, 2).join(', ')}`);
      parts.push(`- Mitigation: ${risk.mitigation}\n`);
    }
  }

  if (assessment.priorityActions.length > 0) {
    parts.push('**Priority Actions:**');
    for (const action of assessment.priorityActions) {
      parts.push(`→ ${action}`);
    }
  }

  return parts.join('\n');
}
