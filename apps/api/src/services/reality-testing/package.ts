/**
 * Reality Testing — Combined Reality Testing Package
 *
 * Assembles validation, fake-detection, feedback, behavior, and risk
 * into a single package.
 */

import type {
  RealityTestingPackage,
  IntelligenceMetrics,
  FakeIntelligenceAlert,
  OperatorProfile,
  RiskAssessment,
} from './types.js';
import { recommendationStore } from './stores.js';
import { calculateIntelligenceMetrics } from './validation.js';
import { detectFakeIntelligence } from './fake-intelligence.js';
import { generateFeedbackInsights } from './feedback.js';
import { updateOperatorProfile, getPersonalizationRecommendations } from './behavior.js';
import { assessDeploymentRisks } from './risk.js';

/**
 * Generate complete reality testing package
 */
export function generateRealityTestingPackage(
  clientId: string,
  operatorId?: string
): RealityTestingPackage {
  // Calculate metrics
  const metrics = calculateIntelligenceMetrics(clientId, 'current');

  // Detect fake intelligence
  const recs = recommendationStore.get(clientId) || [];
  const fakeAlerts = detectFakeIntelligence(clientId, recs, metrics);

  // Get feedback insights
  const feedbackInsights = generateFeedbackInsights(clientId, 'current');

  // Get operator profile
  let operatorProfile: OperatorProfile | undefined;
  let personalizationRecs: string[] = [];
  if (operatorId) {
    operatorProfile = updateOperatorProfile(clientId, operatorId);
    personalizationRecs = getPersonalizationRecommendations(operatorProfile);
  }

  // Assess risks
  const riskAssessment = assessDeploymentRisks(clientId, metrics, operatorProfile, feedbackInsights);

  // Determine quality status
  let qualityStatus: RealityTestingPackage['qualityStatus'] = 'healthy';
  if (fakeAlerts.some(a => a.severity === 'critical')) {
    qualityStatus = 'critical';
  } else if (fakeAlerts.length > 0) {
    qualityStatus = 'warning';
  }

  // Generate validation summary
  const validationSummary = generateValidationSummary(metrics, fakeAlerts, riskAssessment);

  // Compile priority actions
  const priorityActions: string[] = [
    ...fakeAlerts.filter(a => a.severity === 'critical').map(a => a.suggestedAction),
    ...riskAssessment.priorityActions,
    ...feedbackInsights.learningSignals.slice(0, 2),
  ].slice(0, 5);

  return {
    clientId,
    generatedAt: new Date().toISOString(),
    intelligenceMetrics: metrics,
    validationSummary,
    fakeIntelligenceAlerts: fakeAlerts,
    qualityStatus,
    feedbackInsights,
    learningSignals: feedbackInsights.learningSignals,
    operatorProfile,
    personalizationRecommendations: personalizationRecs,
    riskAssessment,
    priorityActions,
  };
}

/**
 * Generate validation summary
 */
function generateValidationSummary(
  metrics: IntelligenceMetrics,
  alerts: FakeIntelligenceAlert[],
  risk: RiskAssessment
): string {
  const parts: string[] = [];

  parts.push(`**Intelligence Score:** ${metrics.overallScore}/100`);

  if (alerts.length === 0 && risk.overallRisk === 'low') {
    parts.push('✅ System performing well. Intelligence quality validated.');
  } else if (alerts.some(a => a.severity === 'critical') || risk.overallRisk === 'critical') {
    parts.push('🚨 Critical issues detected. Immediate attention required.');
  } else {
    parts.push('⚠️ Some issues detected. Review recommended.');
  }

  parts.push(`\n**Key Stats:**`);
  parts.push(`- Adoption Rate: ${metrics.insightAdoptionRate}%`);
  parts.push(`- Accuracy: ${metrics.strategicAccuracy}%`);
  parts.push(`- Wow Factor: ${metrics.wowFactorScore}%`);

  return parts.join('\n');
}
