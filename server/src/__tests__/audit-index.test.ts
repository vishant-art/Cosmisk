/**
 * Tests for Audit System - Main Entry Point (audit/index.ts)
 *
 * Focus: calculateAuditComparison, getAuditHistory, getPreviousAudit
 * Note: runAudit is complex with many external dependencies (database, APIs, crypto)
 *       and requires integration tests rather than unit tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Database before imports
const mockDbPrepare = vi.fn();

vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      prepare = mockDbPrepare;
    },
  };
});

// Mock external API modules (to prevent import errors)
vi.mock('../audit/meta-ingestion.js', () => ({
  fetchMetaSnapshot: vi.fn(),
}));

vi.mock('../audit/google-ads-ingestion.js', () => ({
  fetchGoogleAdsSnapshot: vi.fn(),
}));

vi.mock('../audit/shopify-ingestion.js', () => ({
  fetchShopifySnapshot: vi.fn(),
}));

vi.mock('../audit/website-analysis.js', () => ({
  analyzeWebsite: vi.fn(),
}));

vi.mock('../audit/audit-agent.js', () => ({
  runCreativeAudit: vi.fn(),
}));

vi.mock('../audit/qa-validator.js', () => ({
  validateAuditQuality: vi.fn(),
  formatQAResult: vi.fn(),
}));

vi.mock('../audit/output.js', () => ({
  generateMarkdown: vi.fn(),
  generateJSON: vi.fn(),
  generateSummary: vi.fn(),
}));

// Import after mocks
import { getAuditHistory, getPreviousAudit, calculateAuditComparison } from '../audit/index.js';
import type { AuditOutput, CreativePerformance } from '../audit/types.js';

// Helper to create mock creative
function createMockCreative(overrides: Partial<CreativePerformance> = {}): CreativePerformance {
  return {
    adId: 'ad_123',
    adName: 'Test Ad',
    creativeType: 'image',
    spend: 1000,
    impressions: 10000,
    clicks: 100,
    purchases: 10,
    revenue: 5000,
    ctr: 1.0,
    cpc: 10,
    cpa: 100,
    roas: 5.0,
    landingPageViews: 80,
    addToCarts: 30,
    checkouts: 15,
    clickToLpvRate: 80,
    lpvToAtcRate: 37.5,
    atcToPurchaseRate: 33.3,
    primaryText: 'Test primary text',
    headline: 'Test headline',
    ...overrides,
  };
}

// Helper to create mock audit output
function createMockAuditOutput(overrides: Partial<AuditOutput> = {}): AuditOutput {
  const base: AuditOutput = {
    auditId: 'audit_123',
    brandId: 'brand_123',
    brandName: 'Test Brand',
    createdAt: '2024-01-15T10:00:00Z',
    dateRange: { start: '2024-01-01', end: '2024-01-15' },
    summary: {
      healthScore: 75,
      topFindings: ['Finding 1', 'Finding 2'],
      topPriority: 'Scale winning creatives',
      wastedSpend: 5000,
      bestCpa: 100,
      worstCpa: 2000,
    },
    creativeAnalysis: {
      winners: [
        {
          creative: createMockCreative({ adId: 'winner_1', cpa: 80 }),
          whyItWorks: 'Strong hook and clear CTA',
        },
      ],
      losers: [
        {
          creative: createMockCreative({ adId: 'loser_1', cpa: 2000, purchases: 1 }),
          whyItFails: 'Weak hook, no urgency',
          recommendation: 'Pause and test new creative',
        },
      ],
      wastedSpend: {
        total: 5000,
        creatives: [{ adId: 'loser_1', adName: 'Bad Ad', amount: 5000 }],
      },
      insights: [
        {
          severity: 'warning',
          title: 'High CPA on video ads',
          detail: 'Video ads have 2x higher CPA than images',
          dataPoints: { videoCpa: 800, imageCpa: 400 },
        },
      ],
      recommendations: [
        {
          priority: 'high',
          title: 'Scale winning image ads',
          description: 'Increase budget on top 3 image ads',
          expectedImpact: '20% more purchases',
          effort: 'low',
        },
      ],
    },
    confidence: {
      level: 'high',
      reason: 'Sufficient data volume',
    },
  };

  // Deep merge overrides
  return {
    ...base,
    ...overrides,
    summary: { ...base.summary, ...(overrides.summary || {}) },
    creativeAnalysis: {
      ...base.creativeAnalysis,
      ...(overrides.creativeAnalysis || {}),
    },
  };
}

describe('calculateAuditComparison', () => {
  describe('health score changes', () => {
    it('detects significant health score improvement', () => {
      const current = createMockAuditOutput({
        summary: { healthScore: 85, topFindings: [], topPriority: '', wastedSpend: 1000, bestCpa: 50, worstCpa: 500 },
      });
      const previous = createMockAuditOutput({
        summary: { healthScore: 70, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 200, worstCpa: 1000 },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.healthScore).toBe(15);
      expect(comparison.improvements).toContain('Health score improved by 15 points');
    });

    it('detects significant health score decline', () => {
      const current = createMockAuditOutput({
        summary: { healthScore: 55, topFindings: [], topPriority: '', wastedSpend: 10000, bestCpa: 500, worstCpa: 2000 },
      });
      const previous = createMockAuditOutput({
        summary: { healthScore: 80, topFindings: [], topPriority: '', wastedSpend: 3000, bestCpa: 100, worstCpa: 500 },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.healthScore).toBe(-25);
      expect(comparison.regressions).toContain('Health score dropped by 25 points');
    });

    it('does not flag minor health score changes', () => {
      const current = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 100, worstCpa: 1000 },
      });
      const previous = createMockAuditOutput({
        summary: { healthScore: 73, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 100, worstCpa: 1000 },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.healthScore).toBe(2);
      expect(comparison.improvements.find((i) => i.includes('Health score'))).toBeUndefined();
      expect(comparison.regressions.find((r) => r.includes('Health score'))).toBeUndefined();
    });
  });

  describe('wasted spend changes', () => {
    it('detects reduced wasted spend as improvement', () => {
      const current = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 3000, bestCpa: 100, worstCpa: 1000 },
      });
      const previous = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 8000, bestCpa: 100, worstCpa: 1000 },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.wastedSpend).toBe(-5000);
      expect(comparison.improvements.find((i) => i.includes('Reduced wasted spend'))).toBeDefined();
    });

    it('detects increased wasted spend as regression', () => {
      const current = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 10000, bestCpa: 100, worstCpa: 1000 },
      });
      const previous = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 100, worstCpa: 1000 },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.wastedSpend).toBe(5000);
      expect(comparison.regressions.find((r) => r.includes('Wasted spend increased'))).toBeDefined();
    });

    it('does not flag minor wasted spend changes', () => {
      const current = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 5500, bestCpa: 100, worstCpa: 1000 },
      });
      const previous = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 100, worstCpa: 1000 },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.wastedSpend).toBe(500);
      expect(comparison.improvements.find((i) => i.includes('wasted spend'))).toBeUndefined();
      expect(comparison.regressions.find((r) => r.includes('wasted spend'))).toBeUndefined();
    });
  });

  describe('CPA changes', () => {
    it('detects improved best CPA', () => {
      const current = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 200, worstCpa: 1000 },
      });
      const previous = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 400, worstCpa: 1000 },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.bestCpa).toBe(-200);
      expect(comparison.improvements.find((i) => i.includes('Best CPA improved'))).toBeDefined();
    });

    it('detects worsened best CPA', () => {
      const current = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 500, worstCpa: 1000 },
      });
      const previous = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 300, worstCpa: 1000 },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.bestCpa).toBe(200);
      expect(comparison.regressions.find((r) => r.includes('Best CPA worsened'))).toBeDefined();
    });
  });

  describe('winner/loser count changes', () => {
    it('detects more winning creatives', () => {
      const currentWinners = [
        { creative: createMockCreative({ adId: 'w1' }), whyItWorks: 'Good' },
        { creative: createMockCreative({ adId: 'w2' }), whyItWorks: 'Good' },
        { creative: createMockCreative({ adId: 'w3' }), whyItWorks: 'Good' },
      ];
      const previousWinners = [{ creative: createMockCreative({ adId: 'w1' }), whyItWorks: 'Good' }];

      const current = createMockAuditOutput();
      current.creativeAnalysis.winners = currentWinners;
      const previous = createMockAuditOutput();
      previous.creativeAnalysis.winners = previousWinners;

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.winnerCount).toBe(2);
      expect(comparison.improvements.find((i) => i.includes('more winning creatives'))).toBeDefined();
    });

    it('detects fewer underperforming creatives as improvement', () => {
      const currentLosers = [
        { creative: createMockCreative({ adId: 'l1' }), whyItFails: 'Bad', recommendation: 'Pause' },
      ];
      const previousLosers = [
        { creative: createMockCreative({ adId: 'l1' }), whyItFails: 'Bad', recommendation: 'Pause' },
        { creative: createMockCreative({ adId: 'l2' }), whyItFails: 'Bad', recommendation: 'Pause' },
        { creative: createMockCreative({ adId: 'l3' }), whyItFails: 'Bad', recommendation: 'Pause' },
        { creative: createMockCreative({ adId: 'l4' }), whyItFails: 'Bad', recommendation: 'Pause' },
      ];

      const current = createMockAuditOutput();
      current.creativeAnalysis.losers = currentLosers;
      const previous = createMockAuditOutput();
      previous.creativeAnalysis.losers = previousLosers;

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.loserCount).toBe(-3);
      expect(comparison.improvements.find((i) => i.includes('fewer underperforming creatives'))).toBeDefined();
    });

    it('detects more underperforming creatives as regression', () => {
      const currentLosers = [
        { creative: createMockCreative({ adId: 'l1' }), whyItFails: 'Bad', recommendation: 'Pause' },
        { creative: createMockCreative({ adId: 'l2' }), whyItFails: 'Bad', recommendation: 'Pause' },
        { creative: createMockCreative({ adId: 'l3' }), whyItFails: 'Bad', recommendation: 'Pause' },
        { creative: createMockCreative({ adId: 'l4' }), whyItFails: 'Bad', recommendation: 'Pause' },
      ];
      const previousLosers = [
        { creative: createMockCreative({ adId: 'l1' }), whyItFails: 'Bad', recommendation: 'Pause' },
      ];

      const current = createMockAuditOutput();
      current.creativeAnalysis.losers = currentLosers;
      const previous = createMockAuditOutput();
      previous.creativeAnalysis.losers = previousLosers;

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.loserCount).toBe(3);
      expect(comparison.regressions.find((r) => r.includes('more underperforming creatives'))).toBeDefined();
    });
  });

  describe('overall trend determination', () => {
    it('returns improving when multiple positive signals', () => {
      const current = createMockAuditOutput({
        summary: {
          healthScore: 90,
          topFindings: [],
          topPriority: 'Scale',
          wastedSpend: 1000,
          bestCpa: 100,
          worstCpa: 500,
        },
      });
      const previous = createMockAuditOutput({
        summary: {
          healthScore: 70,
          topFindings: [],
          topPriority: 'Fix',
          wastedSpend: 5000,
          bestCpa: 300,
          worstCpa: 1000,
        },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.overallTrend).toBe('improving');
    });

    it('returns declining when multiple negative signals', () => {
      const current = createMockAuditOutput({
        summary: {
          healthScore: 50,
          topFindings: [],
          topPriority: 'Emergency',
          wastedSpend: 15000,
          bestCpa: 800,
          worstCpa: 3000,
        },
      });
      const previous = createMockAuditOutput({
        summary: {
          healthScore: 80,
          topFindings: [],
          topPriority: 'Scale',
          wastedSpend: 5000,
          bestCpa: 300,
          worstCpa: 1000,
        },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.overallTrend).toBe('declining');
    });

    it('returns stable when mixed or minor signals', () => {
      const current = createMockAuditOutput({
        summary: {
          healthScore: 77,
          topFindings: [],
          topPriority: 'Maintain',
          wastedSpend: 5200,
          bestCpa: 320,
          worstCpa: 1000,
        },
      });
      const previous = createMockAuditOutput({
        summary: {
          healthScore: 75,
          topFindings: [],
          topPriority: 'Maintain',
          wastedSpend: 5000,
          bestCpa: 350,
          worstCpa: 1000,
        },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.overallTrend).toBe('stable');
    });
  });

  describe('comparison metadata', () => {
    it('includes previous audit details', () => {
      const previous = createMockAuditOutput({
        auditId: 'prev_audit_456',
        createdAt: '2024-01-01T10:00:00Z',
        dateRange: { start: '2023-12-15', end: '2024-01-01' },
      });
      const current = createMockAuditOutput();

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.previousAuditId).toBe('prev_audit_456');
      expect(comparison.previousAuditDate).toBe('2024-01-01T10:00:00Z');
      expect(comparison.previousDateRange).toEqual({ start: '2023-12-15', end: '2024-01-01' });
    });

    it('calculates all deltas correctly', () => {
      const current = createMockAuditOutput({
        summary: {
          healthScore: 80,
          topFindings: [],
          topPriority: '',
          wastedSpend: 3000,
          bestCpa: 150,
          worstCpa: 800,
        },
      });
      const previous = createMockAuditOutput({
        summary: {
          healthScore: 70,
          topFindings: [],
          topPriority: '',
          wastedSpend: 5000,
          bestCpa: 200,
          worstCpa: 1000,
        },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.healthScore).toBe(10);
      expect(comparison.deltas.wastedSpend).toBe(-2000);
      expect(comparison.deltas.bestCpa).toBe(-50);
      expect(comparison.deltas.worstCpa).toBe(-200);
    });
  });

  describe('edge cases', () => {
    it('handles zero previous CPA gracefully', () => {
      const current = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 200, worstCpa: 1000 },
      });
      const previous = createMockAuditOutput({
        summary: { healthScore: 75, topFindings: [], topPriority: '', wastedSpend: 5000, bestCpa: 0, worstCpa: 1000 },
      });

      // Should not throw
      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.deltas.bestCpa).toBe(200);
      // Should not include percentage improvement when previous was 0
      expect(comparison.improvements.find((i) => i.includes('Best CPA improved'))).toBeUndefined();
    });

    it('handles identical audits', () => {
      const audit = createMockAuditOutput();

      const comparison = calculateAuditComparison(audit, audit);

      expect(comparison.deltas.healthScore).toBe(0);
      expect(comparison.deltas.wastedSpend).toBe(0);
      expect(comparison.deltas.bestCpa).toBe(0);
      expect(comparison.improvements).toHaveLength(0);
      expect(comparison.regressions).toHaveLength(0);
      expect(comparison.overallTrend).toBe('stable');
    });

    it('handles extreme improvements', () => {
      const current = createMockAuditOutput({
        summary: {
          healthScore: 100,
          topFindings: [],
          topPriority: 'Maintain',
          wastedSpend: 0,
          bestCpa: 50,
          worstCpa: 100,
        },
      });
      current.creativeAnalysis.winners = Array(10)
        .fill(null)
        .map((_, i) => ({
          creative: createMockCreative({ adId: `winner_${i}` }),
          whyItWorks: 'Great',
        }));
      current.creativeAnalysis.losers = [];

      const previous = createMockAuditOutput({
        summary: {
          healthScore: 20,
          topFindings: [],
          topPriority: 'Fix everything',
          wastedSpend: 50000,
          bestCpa: 2000,
          worstCpa: 10000,
        },
      });
      previous.creativeAnalysis.winners = [];
      previous.creativeAnalysis.losers = Array(10)
        .fill(null)
        .map((_, i) => ({
          creative: createMockCreative({ adId: `loser_${i}` }),
          whyItFails: 'Bad',
          recommendation: 'Pause',
        }));

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.overallTrend).toBe('improving');
      expect(comparison.improvements.length).toBeGreaterThan(0);
      expect(comparison.deltas.healthScore).toBe(80);
    });

    it('handles extreme regressions', () => {
      const current = createMockAuditOutput({
        summary: {
          healthScore: 10,
          topFindings: [],
          topPriority: 'Emergency',
          wastedSpend: 100000,
          bestCpa: 5000,
          worstCpa: 20000,
        },
      });
      const previous = createMockAuditOutput({
        summary: {
          healthScore: 95,
          topFindings: [],
          topPriority: 'Scale',
          wastedSpend: 1000,
          bestCpa: 100,
          worstCpa: 500,
        },
      });

      const comparison = calculateAuditComparison(current, previous);

      expect(comparison.overallTrend).toBe('declining');
      expect(comparison.regressions.length).toBeGreaterThan(0);
      expect(comparison.deltas.healthScore).toBe(-85);
    });
  });
});

describe('getAuditHistory', () => {
  beforeEach(() => {
    mockDbPrepare.mockReset();
  });

  it('returns audit history for a brand', () => {
    const mockHistory = [
      { id: 'audit_1', brand_name: 'Test', health_score: 80, created_at: '2024-01-15' },
      { id: 'audit_2', brand_name: 'Test', health_score: 75, created_at: '2024-01-01' },
    ];
    mockDbPrepare.mockReturnValue({ all: vi.fn().mockReturnValue(mockHistory) });

    const history = getAuditHistory('brand_123', 10);

    expect(history).toEqual(mockHistory);
    expect(mockDbPrepare).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
    expect(mockDbPrepare).toHaveBeenCalledWith(expect.stringContaining('brand_id = ?'));
  });

  it('returns empty array when no history', () => {
    mockDbPrepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) });

    const history = getAuditHistory('brand_123', 10);

    expect(history).toEqual([]);
  });

  it('queries with correct SQL structure', () => {
    mockDbPrepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) });

    getAuditHistory('brand_123', 5);

    expect(mockDbPrepare).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at DESC'));
    expect(mockDbPrepare).toHaveBeenCalledWith(expect.stringContaining('LIMIT'));
  });
});

describe('getPreviousAudit', () => {
  beforeEach(() => {
    mockDbPrepare.mockReset();
  });

  it('returns null when no previous audit exists', () => {
    mockDbPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) });

    const result = getPreviousAudit('brand_123');

    expect(result).toBeNull();
  });

  it('returns parsed audit output when exists', () => {
    const mockAudit = createMockAuditOutput();
    mockDbPrepare.mockReturnValue({
      get: vi.fn().mockReturnValue({ full_output: JSON.stringify(mockAudit) }),
    });

    const result = getPreviousAudit('brand_123');

    expect(result).toEqual(mockAudit);
    expect(result?.auditId).toBe('audit_123');
  });

  it('returns null on JSON parse error', () => {
    mockDbPrepare.mockReturnValue({
      get: vi.fn().mockReturnValue({ full_output: 'invalid json {{{' }),
    });

    const result = getPreviousAudit('brand_123');

    expect(result).toBeNull();
  });

  it('queries with correct SQL structure', () => {
    mockDbPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined) });

    getPreviousAudit('brand_123');

    expect(mockDbPrepare).toHaveBeenCalledWith(expect.stringContaining('SELECT full_output'));
    expect(mockDbPrepare).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at DESC'));
    expect(mockDbPrepare).toHaveBeenCalledWith(expect.stringContaining('LIMIT 1'));
  });
});
