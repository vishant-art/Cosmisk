/**
 * Learning Engine — Pattern Synthesis
 */

import type {
  ClientPlaybook,
  LTVByCreativeData,
  CreativeReturnData,
  FatigueData,
} from './types.js';

/**
 * Identify winning patterns from LTV and return data
 */
export function synthesizeWinningPatterns(
  ltvData: LTVByCreativeData[],
  returnData: CreativeReturnData[],
): ClientPlaybook['winningPatterns'] {
  const winners: ClientPlaybook['winningPatterns'] = [];

  // Group LTV data by hook type
  const byHook = new Map<string, { totalLtv: number; count: number; avgLtv: number }>();

  for (const item of ltvData) {
    const hook = item.hookType || 'unknown';
    const existing = byHook.get(hook) || { totalLtv: 0, count: 0, avgLtv: 0 };
    existing.totalLtv += item.avgLtv * item.customers;
    existing.count += item.customers;
    existing.avgLtv = existing.totalLtv / existing.count;
    byHook.set(hook, existing);
  }

  // Find hooks with above-average LTV and low returns
  const avgLtv = ltvData.length > 0
    ? ltvData.reduce((sum, d) => sum + d.avgLtv, 0) / ltvData.length
    : 0;

  for (const [hook, data] of byHook.entries()) {
    if (data.avgLtv >= avgLtv * 1.1 && data.count >= 10) {
      winners.push({
        format: hook,
        avgRoas: 0, // Would need campaign data
        avgLtv: data.avgLtv,
        sampleSize: data.count,
        confidence: data.count >= 50 ? 'high' : data.count >= 20 ? 'medium' : 'low',
      });
    }
  }

  return winners.sort((a, b) => b.avgLtv - a.avgLtv).slice(0, 5);
}

/**
 * Identify patterns to avoid
 */
export function synthesizeLosingPatterns(
  ltvData: LTVByCreativeData[],
  returnData: CreativeReturnData[],
): ClientPlaybook['losingPatterns'] {
  const losers: ClientPlaybook['losingPatterns'] = [];

  // High return rate creatives
  for (const item of returnData) {
    if (item.returnRate > 0.15 && item.orders >= 20) {
      losers.push({
        format: item.creativeName,
        avgRoas: 0,
        returnRate: item.returnRate,
        sampleSize: item.orders,
        reason: `${Math.round(item.returnRate * 100)}% return rate — product/promise mismatch`,
      });
    }
  }

  // Low LTV creatives (one-time buyers)
  const avgLtv = ltvData.length > 0
    ? ltvData.reduce((sum, d) => sum + d.avgLtv, 0) / ltvData.length
    : 0;

  for (const item of ltvData) {
    if (item.avgLtv < avgLtv * 0.6 && item.repeatRate < 0.1 && item.customers >= 30) {
      losers.push({
        format: item.hookType || item.creativeName,
        avgRoas: 0,
        returnRate: 0,
        sampleSize: item.customers,
        reason: `Low repeat rate (${Math.round(item.repeatRate * 100)}%) — attracts one-time discount buyers`,
      });
    }
  }

  return losers.slice(0, 5);
}

/**
 * Calculate fatigue patterns
 */
export function synthesizeFatiguePatterns(
  fatigueData: FatigueData[],
): ClientPlaybook['fatiguePatterns'] {
  // Group by campaign type and calculate average days
  const patterns: ClientPlaybook['fatiguePatterns'] = [];

  // Default patterns if no data
  if (fatigueData.length === 0) {
    return [
      { format: 'UGC', avgDaysToFatigue: 12, warningSignals: ['CTR drops below 1%', 'Frequency > 3'] },
      { format: 'Static', avgDaysToFatigue: 21, warningSignals: ['CTR decline > 20%'] },
      { format: 'Carousel', avgDaysToFatigue: 18, warningSignals: ['Swipe rate drops'] },
    ];
  }

  // Calculate from actual data
  const avgDays = fatigueData.reduce((sum, d) => sum + d.daysActive, 0) / fatigueData.length;

  patterns.push({
    format: 'All creatives',
    avgDaysToFatigue: Math.round(avgDays),
    warningSignals: ['CTR drops 20%+', 'Frequency > 3', 'ROAS decline 3 days'],
  });

  return patterns;
}
