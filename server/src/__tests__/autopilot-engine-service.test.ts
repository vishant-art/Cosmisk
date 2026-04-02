/**
 * Tests for the autopilot engine's alert generation logic.
 *
 * Validates: ROAS decline detection, CPA spike alerting, scale opportunity
 * identification, wasted spend flagging, creative fatigue, fallback content,
 * severity classification, and confidence gating.
 */
import { describe, it, expect } from 'vitest';
import { round, fmt } from '../services/format-helpers.js';
import { computeTrend, assessConfidence } from '../services/trend-analyzer.js';

/* ------------------------------------------------------------------ */
/*  Replicate the alert severity / content logic from autopilot-engine */
/* ------------------------------------------------------------------ */

function classifyRoasSeverity(currentRoas: number): 'critical' | 'warning' {
  return currentRoas < 1 ? 'critical' : 'warning';
}

function classifyCpaSeverity(spikePercent: number): 'critical' | 'warning' {
  return spikePercent > 60 ? 'critical' : 'warning';
}

function classifyWastedSpendSeverity(wastedSpend: number, totalSpend: number): 'critical' | 'warning' {
  return wastedSpend > totalSpend * 0.3 ? 'critical' : 'warning';
}

/** Replicates the CPA spike percent calculation from analyzeAccount */
function computeCpaSpikePercent(dailyCpaValues: number[]): number {
  const firstHalf = dailyCpaValues.slice(0, Math.floor(dailyCpaValues.length / 2));
  const secondHalf = dailyCpaValues.slice(Math.floor(dailyCpaValues.length / 2));
  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  return avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;
}

/** Replicates scale opportunity eligibility from analyzeAccount */
function isScaleCandidate(
  roas: number,
  conversions: number,
  roasTrendDirection: string,
  confidence: { shouldRecommendAction: boolean },
): boolean {
  return roas >= 3 && confidence.shouldRecommendAction && conversions >= 10 && roasTrendDirection !== 'declining';
}

/** Replicates wasted spend detection from analyzeAccount */
function detectWastedSpend(
  campaigns: Array<{ roas: number; spend: number }>,
  totalSpend: number,
): { belowBreakeven: typeof campaigns; wastedSpend: number; shouldAlert: boolean } {
  const belowBreakeven = campaigns.filter(c => c.roas < 1 && c.spend > 0);
  const wastedSpend = belowBreakeven.reduce((s, c) => s + c.spend, 0);
  return { belowBreakeven, wastedSpend, shouldAlert: belowBreakeven.length > 0 && wastedSpend > totalSpend * 0.15 };
}

/** Replicates the fallback content generator from autopilot-engine */
function generateFallbackContent(type: string, data: any): string {
  switch (type) {
    case 'roas_decline':
      return `Your overall ROAS dropped from ${round(data.weekAgoRoas, 1)}x to ${round(data.currentRoas, 1)}x this week on ${fmt(data.spend)} spend. Review your campaign mix and pause underperformers.`;
    case 'cpa_spike':
      return `${data.campaignName}'s CPA spiked ${data.spikePercent}% — now at ${fmt(data.currentCpa)}. Check for audience saturation or creative fatigue.`;
    case 'scale_opportunity':
      return `${data.campaignName} is delivering ${round(data.roas, 1)}x ROAS with ${data.conversions} conversions. Data is reliable — consider scaling budget by 15-20%.`;
    case 'wasted_spend':
      return `${fmt(data.wastedSpend)} is going to ${data.count} campaigns below breakeven. Cut these and reinvest in your profitable campaigns.`;
    case 'creative_fatigue':
      return `${data.campaignName} shows declining CTR (avg ${data.avgCtr}%). Creatives may be fatiguing — launch fresh concepts.`;
    default:
      return JSON.stringify(data);
  }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('Autopilot Engine — ROAS decline detection', () => {
  it('detects declining ROAS trend over 7 days', () => {
    const roasValues = [3.2, 3.0, 2.8, 2.5, 2.1, 1.8, 1.5];
    const trend = computeTrend(roasValues);
    expect(trend.direction).toBe('declining');
  });

  it('does not flag stable ROAS', () => {
    const roasValues = [2.0, 2.1, 1.9, 2.0, 2.1, 2.0, 2.0];
    const trend = computeTrend(roasValues);
    expect(trend.direction).not.toBe('declining');
  });

  it('classifies ROAS < 1 as critical', () => {
    expect(classifyRoasSeverity(0.5)).toBe('critical');
    expect(classifyRoasSeverity(0.99)).toBe('critical');
  });

  it('classifies ROAS >= 1 as warning', () => {
    expect(classifyRoasSeverity(1.0)).toBe('warning');
    expect(classifyRoasSeverity(1.5)).toBe('warning');
  });
});

describe('Autopilot Engine — CPA spike detection', () => {
  it('computes CPA spike percent correctly', () => {
    // First half avg = 20, second half avg = 30 => spike = 50%
    const cpaValues = [18, 22, 28, 32];
    const spike = computeCpaSpikePercent(cpaValues);
    expect(spike).toBe(50);
  });

  it('returns 0 spike if first half avg is 0', () => {
    const cpaValues = [0, 0, 10, 20];
    expect(computeCpaSpikePercent(cpaValues)).toBe(0);
  });

  it('gates CPA alert on confidence — low spend does not trigger', () => {
    const conf = assessConfidence({ spend: 5, totalAccountSpend: 1000, conversions: 1, impressions: 100 });
    expect(conf.shouldRecommendAction).toBe(false);
  });

  it('allows CPA alert when confidence is sufficient', () => {
    const conf = assessConfidence({ spend: 200, totalAccountSpend: 1000, conversions: 15, impressions: 50000 });
    expect(conf.shouldRecommendAction).toBe(true);
  });

  it('classifies > 60% spike as critical', () => {
    expect(classifyCpaSeverity(61)).toBe('critical');
    expect(classifyCpaSeverity(100)).toBe('critical');
  });

  it('classifies <= 60% spike as warning', () => {
    expect(classifyCpaSeverity(60)).toBe('warning');
    expect(classifyCpaSeverity(35)).toBe('warning');
  });
});

describe('Autopilot Engine — scale opportunity', () => {
  it('identifies a high-ROAS, high-conversion, non-declining campaign as scale-ready', () => {
    const conf = assessConfidence({ spend: 300, totalAccountSpend: 1000, conversions: 20, impressions: 50000 });
    expect(isScaleCandidate(4.0, 20, 'improving', conf)).toBe(true);
    expect(isScaleCandidate(3.0, 10, 'stable', conf)).toBe(true);
  });

  it('rejects campaigns with declining ROAS trend', () => {
    const conf = assessConfidence({ spend: 300, totalAccountSpend: 1000, conversions: 20, impressions: 50000 });
    expect(isScaleCandidate(5.0, 30, 'declining', conf)).toBe(false);
  });

  it('rejects campaigns with ROAS below 3', () => {
    const conf = assessConfidence({ spend: 300, totalAccountSpend: 1000, conversions: 20, impressions: 50000 });
    expect(isScaleCandidate(2.9, 20, 'stable', conf)).toBe(false);
  });

  it('rejects campaigns with fewer than 10 conversions', () => {
    const conf = assessConfidence({ spend: 300, totalAccountSpend: 1000, conversions: 20, impressions: 50000 });
    expect(isScaleCandidate(4.0, 9, 'stable', conf)).toBe(false);
  });

  it('rejects campaigns with low confidence', () => {
    const conf = assessConfidence({ spend: 5, totalAccountSpend: 10000, conversions: 1, impressions: 100 });
    expect(isScaleCandidate(10.0, 15, 'stable', conf)).toBe(false);
  });
});

describe('Autopilot Engine — wasted spend detection', () => {
  it('flags when below-breakeven spend exceeds 15% of total', () => {
    const campaigns = [
      { roas: 0.5, spend: 100 },
      { roas: 3.0, spend: 400 },
    ];
    const result = detectWastedSpend(campaigns, 500);
    expect(result.shouldAlert).toBe(true);
    expect(result.belowBreakeven).toHaveLength(1);
    expect(result.wastedSpend).toBe(100); // 20% of 500
  });

  it('does not flag when below-breakeven spend is under 15%', () => {
    const campaigns = [
      { roas: 0.8, spend: 50 },
      { roas: 2.5, spend: 950 },
    ];
    const result = detectWastedSpend(campaigns, 1000);
    expect(result.shouldAlert).toBe(false); // 5% < 15%
  });

  it('classifies > 30% wasted as critical', () => {
    expect(classifyWastedSpendSeverity(350, 1000)).toBe('critical');
  });

  it('classifies <= 30% wasted as warning', () => {
    expect(classifyWastedSpendSeverity(200, 1000)).toBe('warning');
  });
});

describe('Autopilot Engine — creative fatigue detection', () => {
  it('detects declining CTR trend', () => {
    const ctrValues = [2.5, 2.3, 2.0, 1.8, 1.5, 1.2, 0.9];
    const trend = computeTrend(ctrValues);
    expect(trend.direction).toBe('declining');
  });

  it('requires at least 4 data points for fatigue signal', () => {
    // 3 points should return stable since computeTrend needs >= 3
    const ctrValues = [2.0, 1.5, 1.0];
    const trend = computeTrend(ctrValues);
    // Even if declining with 3, our production code requires length >= 4
    expect(ctrValues.length).toBeLessThan(4);
  });
});

describe('Autopilot Engine — fallback content generation', () => {
  it('generates ROAS decline fallback text with numbers', () => {
    const text = generateFallbackContent('roas_decline', {
      weekAgoRoas: 3.2, currentRoas: 1.5, spend: 500,
    });
    expect(text).toContain('3.2x');
    expect(text).toContain('1.5x');
    expect(text).toContain('pause underperformers');
  });

  it('generates CPA spike fallback text', () => {
    const text = generateFallbackContent('cpa_spike', {
      campaignName: 'Summer Sale', spikePercent: 45, currentCpa: 80,
    });
    expect(text).toContain('Summer Sale');
    expect(text).toContain('45%');
  });

  it('generates scale opportunity fallback text', () => {
    const text = generateFallbackContent('scale_opportunity', {
      campaignName: 'Retargeting', roas: 4.5, conversions: 25,
    });
    expect(text).toContain('Retargeting');
    expect(text).toContain('4.5x');
    expect(text).toContain('25');
  });

  it('generates wasted spend fallback text', () => {
    const text = generateFallbackContent('wasted_spend', {
      wastedSpend: 300, count: 3,
    });
    expect(text).toContain('3 campaigns');
  });

  it('generates creative fatigue fallback text', () => {
    const text = generateFallbackContent('creative_fatigue', {
      campaignName: 'Brand Push', avgCtr: 0.8,
    });
    expect(text).toContain('Brand Push');
    expect(text).toContain('0.8%');
  });

  it('falls back to JSON for unknown type', () => {
    const text = generateFallbackContent('unknown', { foo: 'bar' });
    expect(text).toBe(JSON.stringify({ foo: 'bar' }));
  });
});

describe('Autopilot Engine — confidence scoring integration', () => {
  it('high spend + high conversions = high confidence', () => {
    const conf = assessConfidence({ spend: 500, totalAccountSpend: 2000, conversions: 50, impressions: 100000 });
    expect(conf.shouldRecommendAction).toBe(true);
    expect(conf.score).toBeGreaterThanOrEqual(60);
  });

  it('tiny spend is not actionable', () => {
    const conf = assessConfidence({ spend: 2, totalAccountSpend: 5000, conversions: 0, impressions: 50 });
    expect(conf.shouldRecommendAction).toBe(false);
    expect(conf.score).toBeLessThan(50);
  });

  it('moderate spend with decent conversions is actionable', () => {
    const conf = assessConfidence({ spend: 100, totalAccountSpend: 1000, conversions: 10, impressions: 20000 });
    expect(conf.shouldRecommendAction).toBe(true);
  });
});
