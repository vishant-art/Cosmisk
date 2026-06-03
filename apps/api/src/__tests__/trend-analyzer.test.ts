import { describe, it, expect } from 'vitest';
import {
  computeTrend,
  buildDailyMap,
  assessConfidence,
  qualifyMetric,
  trendCaveat,
} from '../services/trend-analyzer.js';

describe('computeTrend', () => {
  it('detects improving trend', () => {
    // Prior (days 1-4): avg ~1.05, Recent (days 5-7): avg ~1.80
    const result = computeTrend([1.2, 1.1, 0.9, 1.0, 1.5, 1.8, 2.1]);
    expect(result.direction).toBe('improving');
    expect(result.pctChange).toBeGreaterThan(40);
    expect(result.label).toContain('improving');
    expect(result.recentAvg).toBeGreaterThan(result.priorAvg);
  });

  it('detects declining trend', () => {
    const result = computeTrend([3.0, 2.8, 2.5, 2.2, 1.5, 1.0, 0.8]);
    expect(result.direction).toBe('declining');
    expect(result.pctChange).toBeLessThan(-10);
    expect(result.label).toContain('declining');
  });

  it('reports stable when change is within noise threshold (< 10%)', () => {
    const result = computeTrend([2.0, 2.1, 1.9, 2.0, 2.05, 1.95, 2.0]);
    expect(result.direction).toBe('stable');
    expect(result.label).toContain('stable');
  });

  it('requires at least 3 data points', () => {
    expect(computeTrend([]).direction).toBe('stable');
    expect(computeTrend([1.0]).direction).toBe('stable');
    expect(computeTrend([1.0, 2.0]).direction).toBe('stable');
    expect(computeTrend([1.0, 2.0]).label).toBe('not enough data');
  });

  it('handles all zeros', () => {
    const result = computeTrend([0, 0, 0, 0, 0]);
    expect(result.direction).toBe('stable');
    expect(result.pctChange).toBe(0);
  });

  it('handles recovery from zero', () => {
    const result = computeTrend([0, 0, 0, 0, 1.0, 2.0, 3.0]);
    expect(result.direction).toBe('improving');
    expect(result.pctChange).toBe(100);
  });

  it('splits at 60/40 boundary', () => {
    // 10 values: split at index 6, prior = [0..5], recent = [6..9]
    const values = [1, 1, 1, 1, 1, 1, 5, 5, 5, 5];
    const result = computeTrend(values);
    expect(result.direction).toBe('improving');
    expect(result.priorAvg).toBe(1);
    expect(result.recentAvg).toBe(5);
  });
});

describe('buildDailyMap', () => {
  it('groups rows by name and extracts metric values', () => {
    const rows = [
      { name: 'Campaign A', roas: 2.5, spend: 100 },
      { name: 'Campaign A', roas: 3.0, spend: 120 },
      { name: 'Campaign B', roas: 1.5, spend: 80 },
    ];
    const map = buildDailyMap(rows, 'roas');
    expect(map.get('Campaign A')).toEqual([2.5, 3.0]);
    expect(map.get('Campaign B')).toEqual([1.5]);
  });

  it('handles missing metric values as 0', () => {
    const map = buildDailyMap([{ name: 'X' }], 'nonexistent');
    expect(map.get('X')).toEqual([0]);
  });

  it('handles empty input', () => {
    expect(buildDailyMap([], 'roas').size).toBe(0);
  });
});

describe('assessConfidence', () => {
  it('returns high confidence for strong data', () => {
    const result = assessConfidence({
      spend: 5000,
      totalAccountSpend: 10000,
      conversions: 50,
      daysActive: 14,
      impressions: 100000,
    });
    expect(result.level).toBe('high');
    expect(result.shouldRecommendAction).toBe(true);
    expect(result.caveat).toBe('');
  });

  it('returns insufficient confidence for near-zero data', () => {
    const result = assessConfidence({
      spend: 5,
      totalAccountSpend: 50000,
      conversions: 0,
      daysActive: 1,
      impressions: 50,
    });
    expect(result.level).toBe('insufficient');
    expect(result.shouldRecommendAction).toBe(false);
    expect(result.reason).toContain('no conversions');
  });

  it('catches the "20x ROAS on tiny spend" trap', () => {
    // Classic mistake: 1 lucky conversion from tiny spend shows amazing ROAS
    const result = assessConfidence({
      spend: 21,
      totalAccountSpend: 50000,
      conversions: 1,
      daysActive: 2,
      impressions: 200,
    });
    expect(result.level).toBe('insufficient');
    expect(result.shouldRecommendAction).toBe(false);
    expect(result.reason).toContain('only 1 conversion');
  });

  it('returns moderate for mid-range data', () => {
    const result = assessConfidence({
      spend: 800,
      totalAccountSpend: 10000,
      conversions: 8,
      daysActive: 5,
      impressions: 5000,
    });
    expect(result.level).toBe('moderate');
    expect(result.shouldRecommendAction).toBe(true);
    expect(result.caveat).toContain('directional');
  });

  it('flags low confidence when spend proportion is tiny', () => {
    const result = assessConfidence({
      spend: 50,
      totalAccountSpend: 100000,
      conversions: 3,
      daysActive: 7,
      impressions: 2000,
    });
    expect(['low', 'insufficient']).toContain(result.level);
    expect(result.reason).toContain('% of total spend');
  });

  it('handles zero total account spend without crashing', () => {
    const result = assessConfidence({
      spend: 100,
      totalAccountSpend: 0,
      conversions: 5,
    });
    expect(result).toBeDefined();
    expect(typeof result.level).toBe('string');
  });
});

describe('qualifyMetric', () => {
  const fmt = (n: number) => `₹${n}`;

  it('returns empty string for high-confidence data', () => {
    const result = qualifyMetric({
      metricName: 'ROAS',
      metricValue: '3.5x',
      spend: 5000,
      totalAccountSpend: 10000,
      conversions: 50,
      fmtFn: fmt,
    });
    expect(result).toBe('');
  });

  it('warns about small sample size', () => {
    const result = qualifyMetric({
      metricName: 'ROAS',
      metricValue: '20.00x',
      spend: 21,
      totalAccountSpend: 50000,
      conversions: 1,
      fmtFn: fmt,
    });
    expect(result).toContain('looks promising');
    expect(result).toContain('1 conversion');
    expect(result).toContain('₹21');
    expect(result).toContain('Wait for more data');
  });

  it('adds moderate note for mid-confidence', () => {
    const result = qualifyMetric({
      metricName: 'CPA',
      metricValue: '₹120',
      spend: 800,
      totalAccountSpend: 10000,
      conversions: 8,
      fmtFn: fmt,
    });
    expect(result).toContain('₹800');
  });
});

describe('trendCaveat', () => {
  it('warns when aggregate looks bad but trend is improving', () => {
    const trend = computeTrend([0.5, 0.6, 0.4, 0.3, 1.0, 1.5, 2.0]);
    const result = trendCaveat('ROAS', true, trend);
    expect(result).toContain('improving');
    expect(result).toContain('give it more time');
  });

  it('warns when aggregate looks good but trend is declining', () => {
    const trend = computeTrend([4.0, 3.8, 3.5, 3.0, 2.0, 1.5, 1.0]);
    const result = trendCaveat('ROAS', false, trend);
    expect(result).toContain('declining');
    expect(result).toContain('watch closely');
  });

  it('returns null for stable trends', () => {
    const trend = computeTrend([2.0, 2.1, 1.9, 2.0, 2.05, 1.95, 2.0]);
    expect(trendCaveat('ROAS', false, trend)).toBeNull();
  });

  it('returns null when trend confirms aggregate direction', () => {
    // Bad aggregate + declining trend = no caveat needed (trend confirms)
    const trend = computeTrend([2.0, 1.8, 1.5, 1.2, 0.8, 0.5, 0.3]);
    expect(trendCaveat('ROAS', true, trend)).toBeNull();
  });
});
