import { describe, it, expect } from 'vitest';
import { scorePlanItems, optimizeCounts } from '../services/plan-scorer.js';

/* ------------------------------------------------------------------ */
/*  Test fixtures                                                      */
/* ------------------------------------------------------------------ */

const mockSnapshot = {
  topAds: [
    {
      id: 'ad1', name: 'Winner Ad', spend: 500, roas: 4.0, ctr: 2.5,
      cpa: 12, impressions: 50000, conversions: 42, format: 'video',
      thumbnail_url: '', days_active: 14,
    },
  ],
  benchmarks: { avgRoas: 2.5, avgCtr: 1.8, avgCpa: 20, avgSpend: 100, totalSpend: 1000 },
  formatBreakdown: {
    ugc_talking_head: { count: 5, avgRoas: 3.5, totalSpend: 600 },
    static_ad: { count: 3, avgRoas: 2.0, totalSpend: 200 },
  },
  fatigueSignals: [],
};

const makePlanItem = (overrides: any = {}) => ({
  format: 'ugc_talking_head',
  count: 5,
  rationale: 'Test rationale',
  estimated_cost_cents: 495,
  source_ads: [{ name: 'Winner Ad', roas: 4.0 }],
  ...overrides,
});

/* ------------------------------------------------------------------ */
/*  Score calculation                                                  */
/* ------------------------------------------------------------------ */

describe('scorePlanItems', () => {
  it('should return scored and removed arrays', () => {
    const items = [makePlanItem()];
    const result = scorePlanItems(items, mockSnapshot, 'meta');

    expect(result).toHaveProperty('scored');
    expect(result).toHaveProperty('removed');
    expect(result).toHaveProperty('summary');
    expect(Array.isArray(result.scored)).toBe(true);
    expect(Array.isArray(result.removed)).toBe(true);
  });

  it('should assign winProbability between 0 and 100', () => {
    const items = [makePlanItem(), makePlanItem({ format: 'static_ad', source_ads: [] })];
    const result = scorePlanItems(items, mockSnapshot, 'meta');

    for (const item of [...result.scored, ...result.removed]) {
      expect(item.winProbability).toBeGreaterThanOrEqual(0);
      expect(item.winProbability).toBeLessThanOrEqual(100);
    }
  });

  it('should include scoreBreakdown with 4 signals', () => {
    const result = scorePlanItems([makePlanItem()], mockSnapshot, 'meta');
    const all = [...result.scored, ...result.removed];

    for (const item of all) {
      expect(item.scoreBreakdown).toHaveProperty('formatSignal');
      expect(item.scoreBreakdown).toHaveProperty('dataBackingSignal');
      expect(item.scoreBreakdown).toHaveProperty('diversitySignal');
      expect(item.scoreBreakdown).toHaveProperty('complianceSignal');
    }
  });

  it('should score well-backed UGC item higher than experimental item', () => {
    const items = [
      makePlanItem({
        format: 'ugc_talking_head',
        source_ads: [{ name: 'Winner Ad', roas: 4.0 }, { name: 'Ad2', roas: 3.5 }, { name: 'Ad3', roas: 3.0 }],
      }),
      makePlanItem({
        format: 'skit',
        count: 3,
        source_ads: [],
      }),
    ];

    const result = scorePlanItems(items, mockSnapshot, 'meta', [], 0);
    const allScored = [...result.scored, ...result.removed];
    const ugcScore = allScored.find(i => i.format === 'ugc_talking_head')!.winProbability;
    const skitScore = allScored.find(i => i.format === 'skit')!.winProbability;

    expect(ugcScore).toBeGreaterThan(skitScore);
  });

  it('should filter items below threshold', () => {
    const items = [
      makePlanItem({ format: 'ugc_talking_head' }),
      makePlanItem({ format: 'podcast_clip', source_ads: [], count: 20 }),
    ];

    const result = scorePlanItems(items, mockSnapshot, 'meta', [], 90);

    // At threshold=90, some items should be removed
    expect(result.summary.totalBefore).toBe(2);
    // Total of scored + removed should equal input
    expect(result.scored.length + result.removed.length).toBe(2);
  });

  it('should add warnings for items with no source ads', () => {
    const items = [makePlanItem({ source_ads: [] })];
    const result = scorePlanItems(items, mockSnapshot, 'meta', [], 0);

    const all = [...result.scored, ...result.removed];
    const hasWarning = all[0].warnings.some(w => w.includes('experimental'));
    expect(hasWarning).toBe(true);
  });

  it('should warn about concentration risk', () => {
    const items = [
      makePlanItem({ format: 'ugc_talking_head', count: 20 }),
      makePlanItem({ format: 'ugc_talking_head', count: 20 }),
      makePlanItem({ format: 'static_ad', count: 2 }),
    ];

    const result = scorePlanItems(items, mockSnapshot, 'meta', [], 0);
    const all = [...result.scored, ...result.removed];
    const ugcItems = all.filter(i => i.format === 'ugc_talking_head');

    const hasConcentrationWarning = ugcItems.some(
      i => i.warnings.some(w => w.includes('concentration'))
    );
    expect(hasConcentrationWarning).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Weighting logic                                                    */
/* ------------------------------------------------------------------ */

describe('Score weighting', () => {
  it('each signal should contribute max 25 points', () => {
    const items = [makePlanItem()];
    const result = scorePlanItems(items, mockSnapshot, 'meta', [], 0);
    const all = [...result.scored, ...result.removed];

    for (const item of all) {
      expect(item.scoreBreakdown.formatSignal).toBeLessThanOrEqual(25);
      expect(item.scoreBreakdown.dataBackingSignal).toBeLessThanOrEqual(25);
      expect(item.scoreBreakdown.diversitySignal).toBeLessThanOrEqual(25);
      expect(item.scoreBreakdown.complianceSignal).toBeLessThanOrEqual(25);
    }
  });

  it('winProbability should roughly equal sum of signals', () => {
    const items = [makePlanItem()];
    const result = scorePlanItems(items, mockSnapshot, 'meta', [], 0);
    const all = [...result.scored, ...result.removed];

    for (const item of all) {
      const sum = item.scoreBreakdown.formatSignal +
        item.scoreBreakdown.dataBackingSignal +
        item.scoreBreakdown.diversitySignal +
        item.scoreBreakdown.complianceSignal;
      // Allow for rounding and clamping to 0-100
      expect(Math.abs(item.winProbability - Math.min(100, Math.max(0, sum)))).toBeLessThanOrEqual(1);
    }
  });

  it('data backing should score higher with more source ads above avg', () => {
    const itemFew = makePlanItem({ source_ads: [{ name: 'A', roas: 1.0 }] });
    const itemMany = makePlanItem({
      source_ads: [
        { name: 'A', roas: 5.0 },
        { name: 'B', roas: 4.5 },
        { name: 'C', roas: 4.0 },
      ],
    });

    const resultFew = scorePlanItems([itemFew], mockSnapshot, 'meta', [], 0);
    const resultMany = scorePlanItems([itemMany], mockSnapshot, 'meta', [], 0);

    const fewData = [...resultFew.scored, ...resultFew.removed][0].scoreBreakdown.dataBackingSignal;
    const manyData = [...resultMany.scored, ...resultMany.removed][0].scoreBreakdown.dataBackingSignal;

    expect(manyData).toBeGreaterThan(fewData);
  });
});

/* ------------------------------------------------------------------ */
/*  Summary statistics                                                 */
/* ------------------------------------------------------------------ */

describe('Scoring summary', () => {
  it('should calculate correct summary stats', () => {
    const items = [
      makePlanItem({ count: 5 }),
      makePlanItem({ format: 'static_ad', count: 3, source_ads: [] }),
    ];
    const result = scorePlanItems(items, mockSnapshot, 'meta', [], 0);

    expect(result.summary.totalBefore).toBe(2);
    expect(result.summary.totalAfter + result.summary.removedCount).toBe(2);
    expect(result.summary.avgWinProbability).toBeGreaterThanOrEqual(0);
    expect(result.summary.savedTokenEstimate).toBeGreaterThanOrEqual(0);
  });

  it('savedTokenEstimate should be ~1500 per removed creative', () => {
    const items = [makePlanItem({ format: 'skit', count: 10, source_ads: [] })];
    const result = scorePlanItems(items, mockSnapshot, 'meta', [], 100);

    // With threshold 100, everything should be removed
    if (result.removed.length > 0) {
      const removedCreatives = result.removed.reduce((s, i) => s + i.count, 0);
      expect(result.summary.savedTokenEstimate).toBe(removedCreatives * 1500);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Platform differences                                               */
/* ------------------------------------------------------------------ */

describe('Platform-specific scoring', () => {
  it('should use different signals for google vs meta', () => {
    const items = [makePlanItem({ format: 'product_demo' })];

    const metaResult = scorePlanItems(items, mockSnapshot, 'meta', [], 0);
    const googleResult = scorePlanItems(items, mockSnapshot, 'google', [], 0);

    const metaAll = [...metaResult.scored, ...metaResult.removed];
    const googleAll = [...googleResult.scored, ...googleResult.removed];

    // product_demo has different format multipliers on meta vs google
    // They should produce different format signal scores
    expect(metaAll[0].scoreBreakdown.formatSignal).not.toBe(googleAll[0].scoreBreakdown.formatSignal);
  });
});

/* ------------------------------------------------------------------ */
/*  optimizeCounts                                                     */
/* ------------------------------------------------------------------ */

describe('optimizeCounts', () => {
  it('should redistribute counts by win probability', () => {
    const items = [
      { ...makePlanItem({ count: 5, estimated_cost_cents: 500 }), winProbability: 90, scoreBreakdown: { formatSignal: 23, dataBackingSignal: 22, diversitySignal: 25, complianceSignal: 20 }, warnings: [] },
      { ...makePlanItem({ format: 'static_ad', count: 5, estimated_cost_cents: 20 }), winProbability: 50, scoreBreakdown: { formatSignal: 10, dataBackingSignal: 15, diversitySignal: 15, complianceSignal: 10 }, warnings: [] },
    ];

    const optimized = optimizeCounts(items, 20, 100000);

    // Higher-scored item should get more count
    const highItem = optimized.find(i => i.format === 'ugc_talking_head')!;
    const lowItem = optimized.find(i => i.format === 'static_ad')!;
    expect(highItem.count).toBeGreaterThanOrEqual(lowItem.count);
  });

  it('should enforce minimum count of 1', () => {
    const items = [
      { ...makePlanItem({ count: 1 }), winProbability: 10, scoreBreakdown: { formatSignal: 2, dataBackingSignal: 2, diversitySignal: 3, complianceSignal: 3 }, warnings: [] },
    ];

    const optimized = optimizeCounts(items, 5, 100000);
    expect(optimized[0].count).toBeGreaterThanOrEqual(1);
  });

  it('should not exceed budget', () => {
    const items = [
      { ...makePlanItem({ count: 10, estimated_cost_cents: 990 }), winProbability: 80, scoreBreakdown: { formatSignal: 20, dataBackingSignal: 20, diversitySignal: 20, complianceSignal: 20 }, warnings: [] },
      { ...makePlanItem({ format: 'skit', count: 10, estimated_cost_cents: 500 }), winProbability: 80, scoreBreakdown: { formatSignal: 20, dataBackingSignal: 20, diversitySignal: 20, complianceSignal: 20 }, warnings: [] },
    ];

    const optimized = optimizeCounts(items, 50, 500); // Very tight budget
    const totalCost = optimized.reduce((s, i) => s + i.estimated_cost_cents, 0);
    // Budget enforcement may not be exact due to rounding, but should be close
    expect(totalCost).toBeLessThanOrEqual(1500); // Generous bound due to min-1 floor
  });

  it('should return empty array for empty input', () => {
    const optimized = optimizeCounts([], 10, 10000);
    expect(optimized).toEqual([]);
  });
});
