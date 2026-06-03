/**
 * Operator Experience — TIER 3.2: COMPETITOR MOVEMENT ALERTS
 */

import { logger } from '../../utils/logger.js';
import type { MovementPattern, CompetitorSnapshot, CompetitorMovement } from './types.js';

/**
 * Movement detection patterns
 */
const MOVEMENT_PATTERNS: MovementPattern[] = [
  {
    type: 'spend_increase',
    detect: (current, previous) => {
      if (!current.estimatedSpend || !previous.estimatedSpend) return false;
      return current.estimatedSpend > previous.estimatedSpend * 1.3;  // 30%+ increase
    },
    generateAlert: (current, previous, clientId) => ({
      id: `move_${Date.now()}`,
      clientId,
      detectedAt: new Date().toISOString(),
      competitorName: current.competitorName,
      competitorId: current.competitorId,
      movementType: 'spend_increase',
      description: `${current.competitorName} increased ad spend by ~${Math.round(((current.estimatedSpend! / previous.estimatedSpend!) - 1) * 100)}%`,
      significance: 'high',
      evidence: [{
        source: 'Meta Ad Library',
        dataPoint: `Estimated spend: ${previous.estimatedSpend} → ${current.estimatedSpend}`,
        comparisonPeriod: '7 days',
      }],
      implications: [
        'They may have found a winning angle or audience',
        'Expect increased competition for your audiences',
        'CPMs in your category may rise',
      ],
      suggestedResponse: 'Analyze their top-spending creatives for patterns. Consider defensive budget increase.',
      responseUrgency: 'this_week',
      firstMoverWindow: '1-2 weeks before market adjusts',
      acknowledged: false,
    }),
  },
  {
    type: 'new_angle',
    detect: (current, previous) => {
      const newAngles = current.topAngles.filter(a => !previous.topAngles.includes(a));
      return newAngles.length > 0;
    },
    generateAlert: (current, previous, clientId) => {
      const newAngles = current.topAngles.filter(a => !previous.topAngles.includes(a));
      return {
        id: `move_${Date.now()}`,
        clientId,
        detectedAt: new Date().toISOString(),
        competitorName: current.competitorName,
        competitorId: current.competitorId,
        movementType: 'new_angle',
        description: `${current.competitorName} testing new angle: "${newAngles[0]}"`,
        significance: 'medium',
        evidence: [{
          source: 'Meta Ad Library',
          dataPoint: `New creative angle detected: ${newAngles.join(', ')}`,
        }],
        implications: [
          'They\'re testing new positioning',
          'This angle may or may not work for them',
          'Worth monitoring performance indicators',
        ],
        suggestedResponse: `Consider if "${newAngles[0]}" angle could work for your brand. Monitor their commitment.`,
        responseUrgency: 'monitor',
        acknowledged: false,
      };
    },
  },
  {
    type: 'creative_killed',
    detect: (current, previous) => {
      return current.killedCreatives > 3;  // Killed multiple creatives
    },
    generateAlert: (current, previous, clientId) => ({
      id: `move_${Date.now()}`,
      clientId,
      detectedAt: new Date().toISOString(),
      competitorName: current.competitorName,
      competitorId: current.competitorId,
      movementType: 'creative_killed',
      description: `${current.competitorName} killed ${current.killedCreatives} creatives — possible strategy shift`,
      significance: 'medium',
      evidence: [{
        source: 'Meta Ad Library',
        dataPoint: `${current.killedCreatives} ads no longer running`,
        comparisonPeriod: '7 days',
      }],
      implications: [
        'These angles/formats may not have worked for them',
        'They\'re pivoting creative strategy',
        'Avoid similar approaches if you were considering them',
      ],
      suggestedResponse: 'Note which creative types they killed. Avoid similar approaches unless you have different data.',
      responseUrgency: 'monitor',
      acknowledged: false,
    }),
  },
  {
    type: 'offer_change',
    detect: (current, previous) => {
      return current.offers.some(o => !previous.offers.includes(o));
    },
    generateAlert: (current, previous, clientId) => {
      const newOffers = current.offers.filter(o => !previous.offers.includes(o));
      return {
        id: `move_${Date.now()}`,
        clientId,
        detectedAt: new Date().toISOString(),
        competitorName: current.competitorName,
        competitorId: current.competitorId,
        movementType: 'offer_change',
        description: `${current.competitorName} launched new offer: "${newOffers[0]}"`,
        significance: 'high',
        evidence: [{
          source: 'Meta Ad Library',
          dataPoint: `New offer detected: ${newOffers.join(', ')}`,
        }],
        implications: [
          'Price competition may intensify',
          'Your offer may need review',
          'Watch for market response',
        ],
        suggestedResponse: 'Review your current offer competitiveness. Consider matching or differentiating.',
        responseUrgency: 'this_week',
        firstMoverWindow: '1 week to respond before customers notice',
        acknowledged: false,
      };
    },
  },
];

/**
 * Detect competitor movements
 */
export function detectCompetitorMovements(
  clientId: string,
  currentSnapshots: CompetitorSnapshot[],
  previousSnapshots: CompetitorSnapshot[]
): CompetitorMovement[] {
  const movements: CompetitorMovement[] = [];

  for (const current of currentSnapshots) {
    const previous = previousSnapshots.find(p =>
      p.competitorName === current.competitorName || p.competitorId === current.competitorId
    );

    if (!previous) continue;  // New competitor, can't compare

    for (const pattern of MOVEMENT_PATTERNS) {
      try {
        if (pattern.detect(current, previous)) {
          const alert = pattern.generateAlert(current, previous, clientId);
          if (alert) {
            movements.push(alert);
            logger.debug({
              type: pattern.type,
              competitor: current.competitorName
            }, '[Experience] Competitor movement detected');
          }
        }
      } catch (err) {
        logger.debug({ pattern: pattern.type, err }, '[Experience] Movement detection failed');
      }
    }
  }

  // Sort by significance
  const significanceOrder = { high: 0, medium: 1, low: 2 };
  movements.sort((a, b) => significanceOrder[a.significance] - significanceOrder[b.significance]);

  return movements;
}

/**
 * Format competitor alert for notification
 */
export function formatCompetitorAlert(movement: CompetitorMovement): string {
  const urgencyEmoji = {
    immediate: '🚨',
    this_week: '⚡',
    monitor: '👀',
  };

  const parts: string[] = [];

  parts.push(`${urgencyEmoji[movement.responseUrgency]} **COMPETITOR ALERT**`);
  parts.push(`**${movement.competitorName}**: ${movement.description}\n`);

  parts.push('**Implications:**');
  for (const impl of movement.implications) {
    parts.push(`- ${impl}`);
  }

  parts.push(`\n**Suggested Response:** ${movement.suggestedResponse}`);

  if (movement.firstMoverWindow) {
    parts.push(`**Window:** ${movement.firstMoverWindow}`);
  }

  return parts.join('\n');
}
