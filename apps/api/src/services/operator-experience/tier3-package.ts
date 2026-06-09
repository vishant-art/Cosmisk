/**
 * Operator Experience — COMBINED: Full Tier 3 Package
 */

import type {
  CompetitorSnapshot,
  AnticipationContext,
  PredictionScorecard,
  Tier3IntelligencePackage,
} from './types.js';
import { generatePredictionScorecard } from './predictions.js';
import { detectCompetitorMovements } from './competitors.js';
import { anticipateNeeds, formatAnticipatedNeeds } from './anticipation.js';

/**
 * Generate complete Tier 3 package
 */
export function generateTier3Package(
  clientId: string,
  competitorSnapshots?: { current: CompetitorSnapshot[]; previous: CompetitorSnapshot[] },
  anticipationContext?: AnticipationContext
): Tier3IntelligencePackage {
  // Generate prediction scorecard
  const predictionScorecard = generatePredictionScorecard(clientId);

  // Generate trust statement
  const trustStatement = generateTrustStatement(predictionScorecard);

  // Detect competitor movements
  const competitorMovements = competitorSnapshots
    ? detectCompetitorMovements(clientId, competitorSnapshots.current, competitorSnapshots.previous)
    : [];

  // Competitor alerts summary
  const competitorAlertsSummary = competitorMovements.length > 0
    ? `${competitorMovements.length} competitor movement(s) detected. ${competitorMovements.filter(m => m.significance === 'high').length} require attention.`
    : 'No significant competitor movements detected.';

  // Anticipate needs
  const anticipatedNeeds = anticipationContext
    ? anticipateNeeds(anticipationContext)
    : [];

  // Anticipation brief
  const anticipationBrief = formatAnticipatedNeeds(anticipatedNeeds);

  // Calculate overall trust score
  const overallTrustScore = calculateOverallTrust(predictionScorecard, competitorMovements.length);

  return {
    generatedAt: new Date().toISOString(),
    clientId,
    predictionScorecard,
    trustStatement,
    competitorMovements,
    competitorAlertsSummary,
    anticipatedNeeds,
    anticipationBrief,
    overallTrustScore,
    trustBreakdown: {
      predictionAccuracy: predictionScorecard.overallAccuracy,
      dataFreshness: 85,  // Would be calculated from actual data freshness
      coverageDepth: Math.min(predictionScorecard.verifiedPredictions * 10, 100),
    },
  };
}

/**
 * Generate trust statement
 */
function generateTrustStatement(scorecard: PredictionScorecard): string {
  if (scorecard.trustLevel === 'building') {
    return `Building trust with ${scorecard.verifiedPredictions} verified predictions so far. Accuracy tracking in progress.`;
  }

  if (scorecard.trustLevel === 'high') {
    return `High confidence recommendations. ${scorecard.overallAccuracy}% prediction accuracy across ${scorecard.verifiedPredictions} verifications.`;
  }

  if (scorecard.trustLevel === 'medium') {
    return `Recommendations backed by ${scorecard.overallAccuracy}% accuracy. ${scorecard.improvementAreas.length > 0 ? 'Some areas improving.' : 'Consistent track record.'}`;
  }

  return `Working to improve. Current accuracy: ${scorecard.overallAccuracy}%. Focusing on: ${scorecard.improvementAreas.join(', ') || 'all areas'}.`;
}

/**
 * Calculate overall trust score
 */
function calculateOverallTrust(scorecard: PredictionScorecard, competitorCoverage: number): number {
  let score = scorecard.trustScore * 0.6;  // 60% from predictions
  score += Math.min(competitorCoverage * 5, 20);  // Up to 20% from competitor coverage
  score += 20;  // Base score for having the system
  return Math.min(Math.round(score), 100);
}
