/**
 * Fatigue Detection Service
 * Analyzes creative performance to detect fatigue signals before performance tanks.
 *
 * Fatigue Signals:
 * - Frequency > 3.5 = warning, > 4.5 = critical
 * - CTR declining (7-day trend)
 * - CPM spiking
 * - Days running > 14 with declining metrics
 */

import { logger } from '../utils/logger.js';

export interface CreativeMetrics {
  id: string;
  name: string;
  thumbnailUrl?: string;
  format: 'video' | 'image' | 'carousel';
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  frequency: number;
  ctr: number;
  cpm: number;
  roas: number;
  daysActive: number;
  // Trend data (last 7 days)
  dailyCtr?: number[];
  dailyCpm?: number[];
}

export interface FatigueAlert {
  id: string;
  creativeId: string;
  creativeName: string;
  severity: 'critical' | 'warning';
  reason: string;
  frequency: number;
  ctrDecline: number;
  cpmIncrease: number;
  predictedDeath: string;
}

export type CreativeStatus = 'scaling' | 'healthy' | 'watch' | 'fatiguing' | 'dead';

export interface AnalyzedCreative extends CreativeMetrics {
  status: CreativeStatus;
}

/**
 * Analyze a list of creatives and detect fatigue
 */
export function analyzeCreatives(creatives: CreativeMetrics[]): AnalyzedCreative[] {
  return creatives.map(creative => {
    const status = determineStatus(creative);
    return { ...creative, status };
  });
}

/**
 * Determine the status of a creative based on its metrics
 */
function determineStatus(creative: CreativeMetrics): CreativeStatus {
  // Dead: zero conversions and high spend
  if (creative.conversions === 0 && creative.spend > 1000) {
    return 'dead';
  }

  // Critical fatigue: frequency > 4.5 or severe CTR decline
  if (creative.frequency > 4.5) {
    return 'fatiguing';
  }

  // Check CTR trend if available
  if (creative.dailyCtr && creative.dailyCtr.length >= 3) {
    const ctrDecline = computeDecline(creative.dailyCtr);
    if (ctrDecline > 20) {
      return 'fatiguing';
    }
  }

  // Watch: frequency between 3.5 and 4.5
  if (creative.frequency > 3.5) {
    return 'watch';
  }

  // Check for mild CTR decline
  if (creative.dailyCtr && creative.dailyCtr.length >= 3) {
    const ctrDecline = computeDecline(creative.dailyCtr);
    if (ctrDecline > 10) {
      return 'watch';
    }
  }

  // Scaling: high ROAS and recent
  if (creative.roas > 3 && creative.daysActive < 7) {
    return 'scaling';
  }

  // Healthy: good metrics
  if (creative.roas >= 1 && creative.frequency <= 3.5) {
    return 'healthy';
  }

  return 'watch';
}

/**
 * Generate fatigue alerts for creatives that need attention
 */
export function generateFatigueAlerts(creatives: CreativeMetrics[]): FatigueAlert[] {
  const alerts: FatigueAlert[] = [];

  for (const creative of creatives) {
    const alert = checkForFatigue(creative);
    if (alert) {
      alerts.push(alert);
    }
  }

  // Sort by severity (critical first) then by frequency
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    return b.frequency - a.frequency;
  });
}

/**
 * Check a single creative for fatigue signals
 */
function checkForFatigue(creative: CreativeMetrics): FatigueAlert | null {
  const reasons: string[] = [];
  let severity: 'critical' | 'warning' = 'warning';

  // Check frequency
  if (creative.frequency > 4.5) {
    reasons.push(`Frequency at ${creative.frequency.toFixed(1)} (critical threshold: 4.5)`);
    severity = 'critical';
  } else if (creative.frequency > 3.5) {
    reasons.push(`Frequency approaching limit at ${creative.frequency.toFixed(1)}`);
  }

  // Check CTR decline
  let ctrDecline = 0;
  if (creative.dailyCtr && creative.dailyCtr.length >= 3) {
    ctrDecline = computeDecline(creative.dailyCtr);
    if (ctrDecline > 20) {
      reasons.push(`CTR dropped ${ctrDecline.toFixed(0)}% in last 3 days`);
      severity = 'critical';
    } else if (ctrDecline > 10) {
      reasons.push(`CTR declining (${ctrDecline.toFixed(0)}% drop)`);
    }
  }

  // Check CPM spike
  let cpmIncrease = 0;
  if (creative.dailyCpm && creative.dailyCpm.length >= 3) {
    cpmIncrease = computeIncrease(creative.dailyCpm);
    if (cpmIncrease > 30) {
      reasons.push(`CPM spiked ${cpmIncrease.toFixed(0)}%`);
      if (severity !== 'critical') severity = 'critical';
    } else if (cpmIncrease > 15) {
      reasons.push(`CPM increasing (${cpmIncrease.toFixed(0)}% up)`);
    }
  }

  // Check days active with low performance
  if (creative.daysActive > 14 && creative.roas < 1) {
    reasons.push(`Running ${creative.daysActive} days with below break-even ROAS`);
    severity = 'critical';
  }

  if (reasons.length === 0) {
    return null;
  }

  // Predict death timing
  let predictedDeath = '5-7 days';
  if (severity === 'critical') {
    if (creative.frequency > 5 || ctrDecline > 25) {
      predictedDeath = '24-48 hours';
    } else {
      predictedDeath = '48-72 hours';
    }
  } else {
    if (creative.frequency > 4) {
      predictedDeath = '3-5 days';
    }
  }

  return {
    id: `alert-${creative.id}`,
    creativeId: creative.id,
    creativeName: creative.name,
    severity,
    reason: reasons.join('. '),
    frequency: creative.frequency,
    ctrDecline,
    cpmIncrease,
    predictedDeath,
  };
}

/**
 * Compute percentage decline in a metric over its recent values
 * Compares last value to first value
 */
function computeDecline(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return 0;
  const decline = ((first - last) / first) * 100;
  return Math.max(0, decline); // Only return positive decline
}

/**
 * Compute percentage increase in a metric over its recent values
 */
function computeIncrease(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return 0;
  const increase = ((last - first) / first) * 100;
  return Math.max(0, increase); // Only return positive increase
}

/**
 * Calculate summary metrics for the command center
 */
export interface CommandSummary {
  brief: string;
  spend: { value: number; change: number; sparkline: number[] };
  roas: { value: number; change: number; sparkline: number[] };
  savings: { value: number; change: number };
  fatigueCount: number;
  winnerCount: number;
  wastedSpend: number;
}

export function generateSummary(
  creatives: AnalyzedCreative[],
  alerts: FatigueAlert[],
  dailySpend: number[],
  dailyRoas: number[]
): CommandSummary {
  // Calculate totals
  const totalSpend = creatives.reduce((sum, c) => sum + c.spend, 0);
  const totalRevenue = creatives.reduce((sum, c) => sum + c.revenue, 0);
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Calculate change (compare last 3 days to previous 3 days)
  const spendChange = computeRecentChange(dailySpend);
  const roasChange = computeRecentChange(dailyRoas);

  // Count winners and fatiguing
  const winnerCount = creatives.filter(c => c.status === 'scaling' || (c.status === 'healthy' && c.roas > 3)).length;
  const fatigueCount = alerts.length;

  // Calculate wasted spend (dead creatives)
  const wastedSpend = creatives
    .filter(c => c.status === 'dead' || c.roas < 0.5)
    .reduce((sum, c) => sum + c.spend, 0);

  // Generate brief
  const brief = generateBrief(creatives, alerts, avgRoas, wastedSpend);

  return {
    brief,
    spend: { value: totalSpend, change: spendChange, sparkline: dailySpend.slice(-7) },
    roas: { value: avgRoas, change: roasChange, sparkline: dailyRoas.slice(-7) },
    savings: { value: wastedSpend, change: 0 }, // Potential savings
    fatigueCount,
    winnerCount,
    wastedSpend,
  };
}

function computeRecentChange(values: number[]): number {
  if (values.length < 6) return 0;
  const recent = values.slice(-3);
  const prior = values.slice(-6, -3);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  if (priorAvg === 0) return 0;
  return ((recentAvg - priorAvg) / priorAvg) * 100;
}

function generateBrief(
  creatives: AnalyzedCreative[],
  alerts: FatigueAlert[],
  avgRoas: number,
  wastedSpend: number
): string {
  const lines: string[] = [];

  // Fatigue alerts
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  if (criticalCount > 0) {
    lines.push(`⚠️ ${criticalCount} ad(s) need replacement in the next 48-72 hours`);
  } else if (alerts.length > 0) {
    lines.push(`📊 ${alerts.length} ad(s) showing early fatigue signals — monitor closely`);
  }

  // Winners
  const topPerformers = creatives.filter(c => c.roas > 5).sort((a, b) => b.roas - a.roas).slice(0, 2);
  if (topPerformers.length > 0) {
    const names = topPerformers.map(c => c.name.slice(0, 25)).join(', ');
    lines.push(`📈 Top performers: ${names} (${topPerformers[0].roas.toFixed(1)}x ROAS)`);
  }

  // Wasted spend
  if (wastedSpend > 1000) {
    lines.push(`🛑 Rs ${Math.round(wastedSpend / 100) * 100} wasted on underperforming ads — consider pausing`);
  }

  // Overall health
  if (avgRoas > 3) {
    lines.push(`✅ Overall account ROAS at ${avgRoas.toFixed(1)}x — performing well`);
  } else if (avgRoas < 1) {
    lines.push(`⚡ Account ROAS at ${avgRoas.toFixed(1)}x — needs optimization`);
  }

  // Recommendation
  if (criticalCount > 0) {
    lines.push(`\n💡 Priority: Generate replacement creatives for fatiguing ads`);
  } else if (topPerformers.length > 0) {
    lines.push(`\n💡 Recommendation: Create more creatives for your winning products`);
  }

  return lines.join('\n');
}
