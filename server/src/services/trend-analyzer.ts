/* ------------------------------------------------------------------ */
/*  Trend analysis & data confidence utilities                         */
/*                                                                     */
/*  Instead of hardcoded thresholds, these helpers provide contextual  */
/*  reasoning about whether a data point is meaningful enough to act   */
/*  on, and whether metrics are improving or declining.                */
/* ------------------------------------------------------------------ */

export interface TrendResult {
  direction: 'improving' | 'declining' | 'stable';
  pctChange: number;
  label: string;       // human-readable: "↑ improving 23%"
  recentAvg: number;
  priorAvg: number;
}

/**
 * Compute trend direction by comparing recent period vs prior period.
 * Split point: last 40% = "recent", first 60% = "prior".
 *
 * Example: 7 daily ROAS values [1.2, 1.1, 0.9, 1.0, 1.5, 1.8, 2.1]
 *   Prior (days 1-4): avg 1.05
 *   Recent (days 5-7): avg 1.80
 *   → "improving 71%"
 */
export function computeTrend(dailyValues: number[]): TrendResult {
  if (dailyValues.length < 3) {
    return { direction: 'stable', pctChange: 0, label: 'not enough data', recentAvg: 0, priorAvg: 0 };
  }

  // Split: recent = last ~40% of the period
  const splitIdx = Math.max(1, Math.floor(dailyValues.length * 0.6));
  const prior = dailyValues.slice(0, splitIdx);
  const recent = dailyValues.slice(splitIdx);

  const priorAvg = prior.reduce((s, v) => s + v, 0) / prior.length;
  const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;

  let pctChange = 0;
  if (priorAvg > 0) {
    pctChange = ((recentAvg - priorAvg) / priorAvg) * 100;
  } else if (recentAvg > 0) {
    pctChange = 100; // went from zero to something
  }

  // Use 10% threshold to avoid labeling noise as a trend
  const direction: TrendResult['direction'] =
    pctChange > 10 ? 'improving' : pctChange < -10 ? 'declining' : 'stable';

  const arrow = direction === 'improving' ? '↑' : direction === 'declining' ? '↓' : '→';
  const label = direction === 'stable'
    ? '→ stable'
    : `${arrow} ${direction} ${Math.abs(Math.round(pctChange))}%`;

  return { direction, pctChange, label, recentAvg, priorAvg };
}

/**
 * Build a map of daily metric values per entity (campaign/ad) from
 * Meta API time_increment=1 response rows.
 *
 * Input: array of rows, each having a name field and metric values.
 * Output: Map from entity name → array of daily metric values.
 */
export function buildDailyMap(
  rows: Array<{ name: string; [metric: string]: any }>,
  metric: string,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const row of rows) {
    const name = row.name;
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(row[metric] ?? 0);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Data confidence — contextual, not threshold-based                  */
/*                                                                     */
/*  Instead of "ignore if spend < X", we reason about the data:        */
/*  - What % of total account spend does this campaign represent?      */
/*  - How many conversions — is it 1 lucky conversion or 50?           */
/*  - How many days has it been running?                                */
/*  These factors produce a confidence assessment, not a binary filter. */
/* ------------------------------------------------------------------ */

export type Confidence = 'high' | 'moderate' | 'low' | 'insufficient';

export interface DataConfidence {
  level: Confidence;
  reason: string;          // "2% of total spend, only 1 conversion"
  caveat: string;          // appended to recommendations: "(small sample — monitor before scaling)"
  shouldRecommendAction: boolean;  // can we confidently suggest scaling/pausing?
}

/**
 * Assess how much confidence we should place in a campaign/ad's metrics.
 * This replaces hardcoded spend thresholds with contextual reasoning.
 */
export function assessConfidence(opts: {
  spend: number;
  totalAccountSpend: number;
  conversions: number;
  daysActive?: number;
  impressions?: number;
}): DataConfidence {
  const { spend, totalAccountSpend, conversions, daysActive, impressions } = opts;
  const reasons: string[] = [];
  let score = 0; // 0-100

  // Factor 1: Spend proportion — how much of the account's budget went here?
  const spendPct = totalAccountSpend > 0 ? (spend / totalAccountSpend) * 100 : 0;
  if (spendPct >= 15) {
    score += 35;
  } else if (spendPct >= 5) {
    score += 25;
  } else if (spendPct >= 1) {
    score += 10;
    reasons.push(`only ${spendPct.toFixed(1)}% of total spend`);
  } else if (spend > 0) {
    score += 3;
    reasons.push(`${spendPct.toFixed(1)}% of total spend — very small sample`);
  }

  // Factor 2: Conversion volume — 1 conversion is a coin flip, 20+ is a pattern
  if (conversions >= 20) {
    score += 35;
  } else if (conversions >= 5) {
    score += 20;
  } else if (conversions >= 2) {
    score += 10;
    reasons.push(`only ${conversions} conversions`);
  } else if (conversions === 1) {
    score += 3;
    reasons.push('only 1 conversion — could be coincidence');
  } else {
    reasons.push('no conversions recorded');
  }

  // Factor 3: Impression volume — did enough people see the ad?
  if (impressions !== undefined) {
    if (impressions >= 10000) {
      score += 15;
    } else if (impressions >= 1000) {
      score += 10;
    } else if (impressions > 0) {
      score += 3;
      reasons.push(`only ${impressions} impressions`);
    }
  } else {
    score += 8; // unknown, give moderate credit
  }

  // Factor 4: Time in market
  if (daysActive !== undefined) {
    if (daysActive >= 7) {
      score += 15;
    } else if (daysActive >= 3) {
      score += 8;
    } else {
      score += 2;
      reasons.push(`only ${daysActive} day${daysActive !== 1 ? 's' : ''} of data`);
    }
  } else {
    score += 8; // unknown
  }

  // Map score to confidence level
  let level: Confidence;
  let caveat: string;
  let shouldRecommendAction: boolean;

  if (score >= 70) {
    level = 'high';
    caveat = '';
    shouldRecommendAction = true;
  } else if (score >= 45) {
    level = 'moderate';
    caveat = '(moderate confidence — results are directional)';
    shouldRecommendAction = true;
  } else if (score >= 20) {
    level = 'low';
    caveat = '(small sample — monitor before acting)';
    shouldRecommendAction = false;
  } else {
    level = 'insufficient';
    caveat = '(insufficient data — wait for more spend before drawing conclusions)';
    shouldRecommendAction = false;
  }

  const reason = reasons.length > 0 ? reasons.join(', ') : 'solid data volume';

  return { level, reason, caveat, shouldRecommendAction };
}

/**
 * Generate a contextual qualifier for a metric, explaining WHY the number
 * may or may not be reliable. Used inline in recommendations.
 *
 * Example: "20.00x ROAS looks strong, but based on only 1 conversion
 * from ₹21 spend (0.2% of total). Wait for more data before scaling."
 */
export function qualifyMetric(opts: {
  metricName: string;      // "ROAS"
  metricValue: string;     // "20.00x"
  spend: number;
  totalAccountSpend: number;
  conversions: number;
  fmtFn: (n: number) => string;  // currency formatter
}): string {
  const conf = assessConfidence(opts);
  if (conf.level === 'high') return '';  // no qualifier needed

  const spendPct = opts.totalAccountSpend > 0
    ? ((opts.spend / opts.totalAccountSpend) * 100).toFixed(1)
    : '0';

  if (conf.level === 'insufficient' || conf.level === 'low') {
    return `${opts.metricValue} ${opts.metricName} looks promising but based on ${opts.conversions} conversion${opts.conversions !== 1 ? 's' : ''} from ${opts.fmtFn(opts.spend)} (${spendPct}% of total). Wait for more data before acting on this.`;
  }

  // moderate — mention but don't block
  return `Note: based on ${opts.fmtFn(opts.spend)} spend (${spendPct}% of total).`;
}

/**
 * Describe trend context for a recommendation.
 * Used to override aggregate-based decisions when trend tells a different story.
 *
 * Example: "Despite weak 7-day average, ROAS is ↑ improving 45% in the last 3 days."
 */
export function trendCaveat(
  metricName: string,
  aggregateIsBad: boolean,
  trend: TrendResult,
): string | null {
  if (trend.direction === 'stable') return null;

  if (aggregateIsBad && trend.direction === 'improving') {
    return `Despite weak ${metricName} overall, it's ${trend.label} recently — give it more time before pausing.`;
  }
  if (!aggregateIsBad && trend.direction === 'declining') {
    return `${metricName} looks good overall but is ${trend.label} recently — watch closely.`;
  }
  return null;
}
