/**
 * Strategic Narrative Synthesis — theme pattern data (leaf module).
 *
 * Extracted verbatim from narrative-synthesis.ts. No behavior change.
 */

import { type ForceDirection } from './types.js';

// ============================================================================
// Theme Templates
// ============================================================================

/**
 * Common strategic themes in D2C advertising
 */
export const THEME_PATTERNS: Array<{
  id: string;
  name: string;
  keywords: string[];
  forceDirection: ForceDirection;
}> = [
  {
    id: 'trust_erosion',
    name: 'Trust Erosion',
    keywords: ['fatigue', 'frequency', 'saturation', 'decline', 'exhaustion', 'worn'],
    forceDirection: 'unfavorable',
  },
  {
    id: 'market_maturation',
    name: 'Market Maturation',
    keywords: ['cac', 'competition', 'saturated', 'crowded', 'consolidation'],
    forceDirection: 'unfavorable',
  },
  {
    id: 'expansion_opportunity',
    name: 'Expansion Opportunity',
    keywords: ['tier-2', 'untapped', 'underserved', 'opportunity', 'outperforming'],
    forceDirection: 'favorable',
  },
  {
    id: 'creative_performance',
    name: 'Creative Performance',
    keywords: ['creative', 'ugc', 'content', 'hook', 'engagement'],
    forceDirection: 'neutral',
  },
  {
    id: 'competitor_pressure',
    name: 'Competitor Pressure',
    keywords: ['competitor', 'cpm', 'auction', 'bidding', 'share'],
    forceDirection: 'unfavorable',
  },
  {
    id: 'attribution_complexity',
    name: 'Attribution Complexity',
    keywords: ['attribution', 'ios', 'tracking', 'measurement', 'pixel'],
    forceDirection: 'unfavorable',
  },
  {
    id: 'customer_quality',
    name: 'Customer Quality',
    keywords: ['ltv', 'repeat', 'retention', 'loyalty', 'cohort'],
    forceDirection: 'neutral',
  },
  {
    id: 'operational_efficiency',
    name: 'Operational Efficiency',
    keywords: ['efficiency', 'automation', 'scale', 'process', 'optimization'],
    forceDirection: 'favorable',
  },
];
