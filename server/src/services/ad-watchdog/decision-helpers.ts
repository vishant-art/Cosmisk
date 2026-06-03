import type { RecommendationType } from '../recommendation-loop.js';
import { VALID_ACTIONS, VALID_CONFIDENCES, VALID_URGENCIES, type WatchdogDecision } from './types.js';

/* ------------------------------------------------------------------ */
/*  Closed-Loop Helpers                                                */
/* ------------------------------------------------------------------ */

export function mapDecisionTypeToRecommendationType(decisionType: string): RecommendationType {
  const mapping: Record<string, RecommendationType> = {
    'roas_decline': 'decrease_budget',
    'cpa_spike': 'pause_campaign',
    'scale_opportunity': 'increase_budget',
    'creative_fatigue': 'refresh_creative',
    'wasted_spend': 'pause_campaign',
    'budget_reallocation': 'adjust_bidding',
    'oos_wasted_spend': 'fix_oos',
    'discount_leakage': 'fix_discount_leak',
    'channel_ltv_gap': 'change_targeting',
  };
  return mapping[decisionType] || 'general';
}

export function parseEstimatedImpact(impact: string): number {
  // Extract numeric value from strings like "Save Rs 15,000/week" or "Save $500/day"
  const match = impact.match(/[\d,]+/);
  if (match) {
    return parseInt(match[0].replace(/,/g, ''), 10);
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Validate Claude's decision output (#9)                             */
/* ------------------------------------------------------------------ */

export function validateDecision(d: any): WatchdogDecision | null {
  if (!d || typeof d !== 'object') return null;
  if (!d.reasoning || typeof d.reasoning !== 'string') return null;
  if (!d.suggestedAction || !VALID_ACTIONS.has(d.suggestedAction)) return null;

  return {
    type: String(d.type || 'unknown'),
    targetId: String(d.targetId || ''),
    targetName: String(d.targetName || 'Unknown'),
    reasoning: String(d.reasoning),
    confidence: VALID_CONFIDENCES.has(d.confidence) ? d.confidence : 'low',
    urgency: VALID_URGENCIES.has(d.urgency) ? d.urgency : 'medium',
    suggestedAction: d.suggestedAction,
    estimatedImpact: String(d.estimatedImpact || ''),
  };
}
