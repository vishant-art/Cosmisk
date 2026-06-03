/**
 * Reality Testing — 2. Fake Intelligence Detection
 *
 * Catches useless/obvious/repetitive outputs.
 */

import { logger } from '../../utils/logger.js';
import type {
  FakeIntelligenceAlert,
  FakeIntelligenceType,
  FakeIntelligencePattern,
  FakeIntelligenceContext,
  IntelligenceMetrics,
  TrackedRecommendation,
} from './types.js';

const FAKE_INTELLIGENCE_PATTERNS: FakeIntelligencePattern[] = [
  {
    type: 'sounds_smart_useless',
    detect: (ctx) => {
      // High view rate but low action rate = sounds smart but useless
      const viewed = ctx.recentRecommendations.filter(r => r.wasViewed);
      const actedUpon = ctx.recentRecommendations.filter(r => r.wasActedUpon);
      if (viewed.length < 5) return false;
      const actionRate = actedUpon.length / viewed.length;
      return actionRate < 0.15;  // Less than 15% acted upon
    },
    severity: 'critical',
    description: 'Insights are being viewed but not acted upon. They may sound smart but lack actionable value.',
    suggestedAction: 'Review insight format. Focus on specific, actionable recommendations with clear next steps.',
  },
  {
    type: 'too_obvious',
    detect: (ctx) => {
      // Many marked as obvious
      const obviousCount = ctx.recentRecommendations.filter(r => r.markedAsObvious).length;
      if (ctx.recentRecommendations.length < 5) return false;
      return (obviousCount / ctx.recentRecommendations.length) > 0.3;
    },
    severity: 'warning',
    description: 'Over 30% of insights are being marked as obvious. The system may be stating what operators already know.',
    suggestedAction: 'Increase insight threshold. Filter out patterns that experienced media buyers would already know.',
  },
  {
    type: 'repetitive',
    detect: (ctx) => {
      if (!ctx.recentInsightTexts || ctx.recentInsightTexts.length < 5) return false;

      // Check for repetitive patterns
      const uniqueStarts = new Set(
        ctx.recentInsightTexts.map(t => t.slice(0, 50).toLowerCase())
      );
      const repetitionRate = 1 - (uniqueStarts.size / ctx.recentInsightTexts.length);
      return repetitionRate > 0.4;  // Over 40% similar starts
    },
    severity: 'warning',
    description: 'Insights are becoming repetitive. Same patterns appearing too frequently.',
    suggestedAction: 'Implement insight deduplication. Track what\'s been shown and vary recommendations.',
  },
  {
    type: 'generic_predictions',
    detect: (ctx) => {
      // Low confidence scores across the board
      const avgConfidence = ctx.recentRecommendations.reduce(
        (sum, r) => sum + r.confidence, 0
      ) / ctx.recentRecommendations.length;
      return avgConfidence < 50 && ctx.recentRecommendations.length >= 5;
    },
    severity: 'warning',
    description: 'Predictions are too generic. Low confidence across recommendations suggests hedging.',
    suggestedAction: 'Require minimum confidence threshold. Only surface predictions with strong signals.',
  },
  {
    type: 'fluff_narratives',
    detect: (ctx) => {
      // Low usefulness ratings
      const rated = ctx.recentRecommendations.filter(r => r.operatorRating !== undefined);
      if (rated.length < 3) return false;
      const avgRating = rated.reduce((sum, r) => sum + (r.operatorRating || 3), 0) / rated.length;
      return avgRating < 2.5;
    },
    severity: 'critical',
    description: 'Narratives rated poorly by operators. Content may be fluffy without substance.',
    suggestedAction: 'Review narrative templates. Ensure every insight has concrete data and specific actions.',
  },
  {
    type: 'no_action_taken',
    detect: (ctx) => {
      // Very low action rate overall
      if (ctx.recentRecommendations.length < 10) return false;
      const actedUpon = ctx.recentRecommendations.filter(r => r.wasActedUpon);
      return (actedUpon.length / ctx.recentRecommendations.length) < 0.1;
    },
    severity: 'critical',
    description: 'Operators have stopped taking action on recommendations. System may have lost credibility.',
    suggestedAction: 'Urgent: Review recent recommendations for quality. Consider operator feedback session.',
  },
];

/**
 * Detect fake intelligence in recent outputs
 */
export function detectFakeIntelligence(
  clientId: string,
  recentRecommendations: TrackedRecommendation[],
  metrics?: IntelligenceMetrics,
  recentInsightTexts?: string[]
): FakeIntelligenceAlert[] {
  const alerts: FakeIntelligenceAlert[] = [];

  const context: FakeIntelligenceContext = {
    clientId,
    recentRecommendations,
    metrics,
    recentInsightTexts,
  };

  for (const pattern of FAKE_INTELLIGENCE_PATTERNS) {
    try {
      if (pattern.detect(context)) {
        alerts.push({
          id: `fake_${Date.now()}_${pattern.type}`,
          clientId,
          detectedAt: new Date().toISOString(),
          alertType: pattern.type,
          severity: pattern.severity,
          description: pattern.description,
          indicators: extractIndicators(context, pattern.type),
          affectedInsights: recentRecommendations.slice(0, 5).map(r => r.id),
          suggestedAction: pattern.suggestedAction,
        });

        logger.warn({ clientId, type: pattern.type }, '[Reality] Fake intelligence detected');
      }
    } catch (err) {
      logger.debug({ pattern: pattern.type, err }, '[Reality] Pattern detection failed');
    }
  }

  return alerts;
}

/**
 * Extract indicators for a fake intelligence type
 */
function extractIndicators(
  context: FakeIntelligenceContext,
  type: FakeIntelligenceType
): string[] {
  const indicators: string[] = [];

  switch (type) {
    case 'sounds_smart_useless': {
      const viewed = context.recentRecommendations.filter(r => r.wasViewed).length;
      const actedUpon = context.recentRecommendations.filter(r => r.wasActedUpon).length;
      indicators.push(`${viewed} viewed, only ${actedUpon} acted upon`);
      indicators.push(`Action rate: ${((actedUpon / viewed) * 100).toFixed(1)}%`);
      break;
    }
    case 'too_obvious': {
      const obvious = context.recentRecommendations.filter(r => r.markedAsObvious).length;
      indicators.push(`${obvious}/${context.recentRecommendations.length} marked obvious`);
      break;
    }
    case 'repetitive': {
      indicators.push('Similar insight patterns detected');
      indicators.push('Variation score below threshold');
      break;
    }
    case 'generic_predictions': {
      const avgConf = context.recentRecommendations.reduce((s, r) => s + r.confidence, 0)
        / context.recentRecommendations.length;
      indicators.push(`Average confidence: ${avgConf.toFixed(1)}%`);
      break;
    }
    case 'fluff_narratives': {
      const rated = context.recentRecommendations.filter(r => r.operatorRating);
      const avgRating = rated.reduce((s, r) => s + (r.operatorRating || 0), 0) / rated.length;
      indicators.push(`Average rating: ${avgRating.toFixed(1)}/5`);
      break;
    }
    case 'no_action_taken': {
      const actedUpon = context.recentRecommendations.filter(r => r.wasActedUpon).length;
      indicators.push(`Only ${actedUpon}/${context.recentRecommendations.length} acted upon`);
      break;
    }
  }

  return indicators;
}

/**
 * Format fake intelligence alert
 */
export function formatFakeIntelligenceAlert(alert: FakeIntelligenceAlert): string {
  const emoji = alert.severity === 'critical' ? '🚨' : '⚠️';

  const parts: string[] = [];
  parts.push(`${emoji} **INTELLIGENCE QUALITY ALERT**`);
  parts.push(`**Type:** ${alert.alertType.replace(/_/g, ' ')}`);
  parts.push(`**Issue:** ${alert.description}\n`);

  parts.push('**Indicators:**');
  for (const indicator of alert.indicators) {
    parts.push(`- ${indicator}`);
  }

  parts.push(`\n**Action:** ${alert.suggestedAction}`);

  return parts.join('\n');
}
