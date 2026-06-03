import {
  validateMonetaryClaim,
  calculateWastedSpend,
  correctWasteReasoning,
  type CampaignData,
} from '../factual-validation.js';
import type { AccountSnapshot, WatchdogDecision } from './types.js';

/* ------------------------------------------------------------------ */
/*  FACTUAL VALIDATION (using shared utility)                          */
/* ------------------------------------------------------------------ */

/**
 * Apply factual validation to watchdog decisions
 * Uses shared factual-validation.ts utility
 */
export function applyFactualValidation(
  decisions: WatchdogDecision[],
  snapshot: AccountSnapshot,
): WatchdogDecision[] {
  // Convert snapshot campaigns to CampaignData format
  const campaigns: CampaignData[] = snapshot.campaigns.map(c => ({
    name: c.name,
    spend: c.spend,
    roas: c.roas,
    conversions: c.conversions,
  }));

  return decisions.map(decision => {
    // Only validate wasted_spend type decisions
    if (decision.type !== 'wasted_spend') {
      return decision;
    }

    const actual = calculateWastedSpend(campaigns);
    const validation = validateMonetaryClaim({
      source: 'ad-watchdog',
      claimType: 'wasted_spend',
      aiText: decision.reasoning + ' ' + decision.estimatedImpact,
      actualValue: actual.wasteSpend,
      threshold: 200, // Allow up to 200% deviation before flagging
    });

    if (!validation.isValid) {
      // Return corrected decision instead of rejecting entirely
      return {
        ...decision,
        reasoning: correctWasteReasoning(decision.reasoning, actual),
        confidence: 'low' as const, // Downgrade confidence after correction
        estimatedImpact: `Save ₹${Math.round(actual.wasteSpend * 4.3).toLocaleString()}/month`,
      };
    }

    return decision;
  });
}
