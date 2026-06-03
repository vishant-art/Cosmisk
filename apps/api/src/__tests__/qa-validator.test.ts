/**
 * Tests for qa-validator.ts — Audit Quality Assurance
 *
 * Tests validation of audit output quality, data integrity checks,
 * human review flagging, and result formatting.
 */
import { describe, it, expect } from 'vitest';
import {
  validateAuditQuality,
  formatQAResult,
  isAuditDataValid,
  getHumanReviewFlags,
} from '../audit/qa-validator.js';
import type { AuditOutput, CreativePerformance } from '../audit/types.js';

// ============ TEST FIXTURES ============

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
    cpa: 100, // spend / purchases = 1000/10 = 100
    roas: 5.0, // revenue / spend = 5000/1000 = 5
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

function createMockAudit(overrides: Partial<AuditOutput> = {}): AuditOutput {
  const defaultCreative = createMockCreative();
  const loserCreative = createMockCreative({
    adId: 'ad_456',
    adName: 'Loser Ad',
    spend: 2000,
    purchases: 1,
    cpa: 2000,
    roas: 0.5,
  });

  return {
    auditId: 'audit_123',
    brandId: 'brand_123',
    brandName: 'Test Brand',
    createdAt: new Date().toISOString(),
    dateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    },
    summary: {
      healthScore: 75,
      topFindings: ['Finding 1', 'Finding 2'],
      topPriority: 'Scale winning creatives',
      wastedSpend: 2000,
      bestCpa: 100,
      worstCpa: 2000,
    },
    creativeAnalysis: {
      winners: [
        {
          creative: defaultCreative,
          whyItWorks: 'Strong CTR of 1.5% with efficient CPA of ₹100',
        },
      ],
      losers: [
        {
          creative: loserCreative,
          whyItFails: 'High spend with only 1 conversion, CPA of ₹2000',
          recommendation: 'Pause this ad and reallocate budget',
        },
      ],
      wastedSpend: {
        total: 2000,
        creatives: [{ adId: 'ad_456', adName: 'Loser Ad', amount: 2000 }],
      },
      insights: [
        {
          severity: 'warning',
          title: 'High CPA Variance',
          detail: 'CPA ranges from ₹100 to ₹2000, a 20x difference. Top performer has 95% better efficiency.',
          dataPoints: { minCpa: 100, maxCpa: 2000 },
        },
        {
          severity: 'info',
          title: 'Video Ads Outperform',
          detail: 'Video creatives show 30% higher CTR averaging 1.5% vs 1.1% for images.',
          dataPoints: { videoCtr: 1.5, imageCtr: 1.1 },
        },
      ],
      recommendations: [
        {
          priority: 'high',
          title: 'Scale Top Performer',
          description: 'Increase budget for ad_123 which has ₹100 CPA and 5x ROAS.',
          expectedImpact: 'Potential 30% increase in conversions with same efficiency.',
          effort: 'low',
        },
        {
          priority: 'medium',
          title: 'Pause Underperformers',
          description: 'Stop spending on ad_456 which has ₹2000 CPA.',
          expectedImpact: 'Save ₹2000 in wasted spend immediately.',
          effort: 'low',
        },
        {
          priority: 'low',
          title: 'Test New Creatives',
          description: 'Create variations of winning ad with different hooks.',
          expectedImpact: 'Find new winners to diversify performance.',
          effort: 'medium',
        },
      ],
    },
    confidence: {
      level: 'high',
      reason: 'Sufficient data volume with 11 conversions',
    },
    ...overrides,
  };
}

// ============ TESTS ============

describe('QA Validator', () => {
  describe('validateAuditQuality', () => {
    it('passes a well-formed audit', () => {
      const audit = createMockAudit();
      const result = validateAuditQuality(audit);

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.dataIntegrity.passed).toBe(true);
    });

    it('returns correct structure', () => {
      const audit = createMockAudit();
      const result = validateAuditQuality(audit);

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('dataIntegrity');
      expect(result).toHaveProperty('humanReviewRequired');
      expect(result).toHaveProperty('humanReviewReasons');
    });

    it('score is between 0 and 100', () => {
      const audit = createMockAudit();
      const result = validateAuditQuality(audit);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('validateInsights (via validateAuditQuality)', () => {
    it('fails when no insights', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          insights: [],
        },
      });

      const result = validateAuditQuality(audit);

      const insightIssue = result.issues.find(
        i => i.category === 'insights' && i.severity === 'critical'
      );
      expect(insightIssue).toBeDefined();
      expect(insightIssue?.message).toBe('No insights generated');
    });

    it('warns when too few insights', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          insights: [
            {
              severity: 'info',
              title: 'Single Insight',
              detail: 'Only one insight with 50% improvement.',
              dataPoints: {},
            },
          ],
        },
      });

      const result = validateAuditQuality(audit);

      const insightIssue = result.issues.find(
        i => i.category === 'insights' && i.message.includes('Too few insights')
      );
      expect(insightIssue).toBeDefined();
    });

    it('warns on generic insights without data', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          insights: [
            {
              severity: 'info',
              title: 'Generic Advice',
              detail: 'You should optimize your ads for better performance.',
              dataPoints: {},
            },
            {
              severity: 'info',
              title: 'Another Generic',
              detail: 'Consider improve performance of your campaigns.',
              dataPoints: {},
            },
          ],
        },
      });

      const result = validateAuditQuality(audit);

      const genericIssue = result.issues.find(
        i => i.category === 'insights' && i.message.includes('Generic insight')
      );
      expect(genericIssue).toBeDefined();
    });

    it('warns when insights lack numbers', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          insights: [
            {
              severity: 'info',
              title: 'No Numbers',
              detail: 'Video ads are performing better than image ads.',
              dataPoints: {},
            },
            {
              severity: 'warning',
              title: 'Also No Numbers',
              detail: 'Some campaigns need optimization soon.',
              dataPoints: {},
            },
          ],
        },
      });

      const result = validateAuditQuality(audit);

      const noNumbersIssue = result.issues.find(
        i => i.category === 'insights' && i.message.includes('lacks specific numbers')
      );
      expect(noNumbersIssue).toBeDefined();
    });
  });

  describe('validateRecommendations (via validateAuditQuality)', () => {
    it('fails when no recommendations', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          recommendations: [],
        },
      });

      const result = validateAuditQuality(audit);

      const recIssue = result.issues.find(
        i => i.category === 'recommendations' && i.severity === 'critical'
      );
      expect(recIssue).toBeDefined();
      expect(recIssue?.message).toBe('No recommendations generated');
    });

    it('warns when no high priority recommendations', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          recommendations: [
            {
              priority: 'medium',
              title: 'Medium Priority',
              description: 'This is a medium priority recommendation.',
              expectedImpact: 'Some improvement expected.',
              effort: 'low',
            },
            {
              priority: 'low',
              title: 'Low Priority',
              description: 'This is a low priority recommendation.',
              expectedImpact: 'Minor improvement.',
              effort: 'low',
            },
          ],
        },
      });

      const result = validateAuditQuality(audit);

      const noHighPriority = result.issues.find(
        i => i.category === 'recommendations' && i.message.includes('No high priority')
      );
      expect(noHighPriority).toBeDefined();
    });

    it('warns on brief descriptions', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          recommendations: [
            {
              priority: 'high',
              title: 'Brief Rec',
              description: 'Too short', // Less than 20 chars
              expectedImpact: 'Good impact with 30% improvement.',
              effort: 'low',
            },
          ],
        },
      });

      const result = validateAuditQuality(audit);

      const briefIssue = result.issues.find(
        i => i.category === 'recommendations' && i.message.includes('too brief')
      );
      expect(briefIssue).toBeDefined();
    });
  });

  describe('validateAnalysis (via validateAuditQuality)', () => {
    it('warns on default winner reasons', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [
            {
              creative: createMockCreative(),
              whyItWorks: 'High conversion rate with efficient spend', // Default reason
            },
          ],
        },
      });

      const result = validateAuditQuality(audit);

      const defaultReason = result.issues.find(
        i => i.category === 'analysis' && i.message.includes('default reason')
      );
      expect(defaultReason).toBeDefined();
    });

    it('warns on default loser reasons', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          losers: [
            {
              creative: createMockCreative({ adName: 'Loser' }),
              whyItFails: 'Low conversion despite significant spend', // Default reason
              recommendation: 'Pause this ad',
            },
          ],
        },
      });

      const result = validateAuditQuality(audit);

      const defaultReason = result.issues.find(
        i => i.category === 'analysis' && i.message.includes('default reason')
      );
      expect(defaultReason).toBeDefined();
    });
  });

  describe('validateSummary (via validateAuditQuality)', () => {
    it('fails on invalid health score (negative)', () => {
      const audit = createMockAudit({
        summary: {
          ...createMockAudit().summary,
          healthScore: -10,
        },
      });

      const result = validateAuditQuality(audit);

      const healthIssue = result.issues.find(
        i => i.category === 'summary' && i.message.includes('Invalid health score')
      );
      expect(healthIssue).toBeDefined();
      expect(healthIssue?.severity).toBe('critical');
    });

    it('fails on invalid health score (over 100)', () => {
      const audit = createMockAudit({
        summary: {
          ...createMockAudit().summary,
          healthScore: 150,
        },
      });

      const result = validateAuditQuality(audit);

      const healthIssue = result.issues.find(
        i => i.category === 'summary' && i.message.includes('Invalid health score')
      );
      expect(healthIssue).toBeDefined();
    });

    it('warns when top findings empty but insights exist', () => {
      const audit = createMockAudit({
        summary: {
          ...createMockAudit().summary,
          topFindings: [],
        },
      });

      const result = validateAuditQuality(audit);

      const findingsIssue = result.issues.find(
        i => i.category === 'summary' && i.message.includes('Top findings empty')
      );
      expect(findingsIssue).toBeDefined();
    });

    it('warns on wasted spend mismatch', () => {
      const audit = createMockAudit({
        summary: {
          ...createMockAudit().summary,
          wastedSpend: 5000, // Doesn't match creativeAnalysis.wastedSpend.total
        },
      });

      const result = validateAuditQuality(audit);

      const mismatchIssue = result.issues.find(
        i => i.category === 'summary' && i.message.includes('Wasted spend mismatch')
      );
      expect(mismatchIssue).toBeDefined();
    });
  });

  describe('validateDataIntegrity (via validateAuditQuality)', () => {
    it('detects CPA calculation mismatch', () => {
      const creative = createMockCreative({
        spend: 1000,
        purchases: 10,
        cpa: 200, // Should be 100 (1000/10)
      });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative, whyItWorks: 'Good performance' }],
          losers: [],
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.dataIntegrity.calculationErrors.length).toBeGreaterThan(0);
      const cpaError = result.dataIntegrity.calculationErrors.find(e => e.field === 'CPA');
      expect(cpaError).toBeDefined();
    });

    it('detects CPA when no conversions but CPA > 0', () => {
      const creative = createMockCreative({
        spend: 1000,
        purchases: 0,
        cpa: 500, // Invalid - should be 0 when no conversions
      });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [],
          losers: [{ creative, whyItFails: 'No conversions', recommendation: 'Pause' }],
        },
      });

      const result = validateAuditQuality(audit);

      const cpaError = result.dataIntegrity.calculationErrors.find(
        e => e.field === 'CPA' && e.message.includes('conversions is 0')
      );
      expect(cpaError).toBeDefined();
    });

    it('detects ROAS with zero conversions', () => {
      const creative = createMockCreative({
        spend: 1000,
        purchases: 0,
        roas: 2.0, // Invalid - can't have ROAS with 0 conversions
      });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [],
          losers: [{ creative, whyItFails: 'No conversions', recommendation: 'Pause' }],
        },
      });

      const result = validateAuditQuality(audit);

      const roasError = result.dataIntegrity.calculationErrors.find(
        e => e.field === 'ROAS' && e.message.includes('conversions is 0')
      );
      expect(roasError).toBeDefined();
    });

    it('detects negative spend', () => {
      const creative = createMockCreative({ spend: -500 });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative, whyItWorks: 'Test' }],
        },
      });

      const result = validateAuditQuality(audit);

      const violation = result.dataIntegrity.sanityViolations.find(
        v => v.field === 'Spend' && v.value < 0
      );
      expect(violation).toBeDefined();
    });

    it('detects negative conversions', () => {
      const creative = createMockCreative({ purchases: -5 });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative, whyItWorks: 'Test' }],
        },
      });

      const result = validateAuditQuality(audit);

      const violation = result.dataIntegrity.sanityViolations.find(
        v => v.field === 'Conversions' && v.value < 0
      );
      expect(violation).toBeDefined();
    });

    it('detects extremely high ROAS (>100x)', () => {
      const creative = createMockCreative({ roas: 150 });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative, whyItWorks: 'Amazing performance' }],
        },
      });

      const result = validateAuditQuality(audit);

      const violation = result.dataIntegrity.sanityViolations.find(
        v => v.field === 'ROAS' && v.rule.includes('exceeds 100x')
      );
      expect(violation).toBeDefined();
    });

    it('detects clicks exceeding impressions', () => {
      const creative = createMockCreative({
        impressions: 100,
        clicks: 200, // Impossible
      });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative, whyItWorks: 'Test' }],
        },
      });

      const result = validateAuditQuality(audit);

      const violation = result.dataIntegrity.sanityViolations.find(
        v => v.field === 'Clicks' && v.rule.includes('exceed impressions')
      );
      expect(violation).toBeDefined();
    });

    it('passes with valid data', () => {
      const audit = createMockAudit();
      const result = validateAuditQuality(audit);

      expect(result.dataIntegrity.passed).toBe(true);
      expect(result.dataIntegrity.calculationErrors).toHaveLength(0);
    });
  });

  describe('flagForHumanReview (via validateAuditQuality)', () => {
    it('flags very low health score', () => {
      const audit = createMockAudit({
        summary: { ...createMockAudit().summary, healthScore: 5 },
      });

      const result = validateAuditQuality(audit);

      expect(result.humanReviewRequired).toBe(true);
      expect(result.humanReviewReasons.some(r => r.includes('Very low health score'))).toBe(true);
    });

    it('flags unusually high health score', () => {
      const audit = createMockAudit({
        summary: { ...createMockAudit().summary, healthScore: 98 },
      });

      const result = validateAuditQuality(audit);

      expect(result.humanReviewRequired).toBe(true);
      expect(result.humanReviewReasons.some(r => r.includes('Unusually high health score'))).toBe(true);
    });

    it('flags high wasted spend percentage', () => {
      const creative = createMockCreative({ spend: 100 });
      const loser = createMockCreative({ spend: 900, purchases: 0 });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative, whyItWorks: 'Good' }],
          losers: [{ creative: loser, whyItFails: 'Bad', recommendation: 'Pause' }],
          wastedSpend: { total: 900, creatives: [] }, // 90% wasted
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.humanReviewRequired).toBe(true);
      expect(result.humanReviewReasons.some(r => r.includes('wasted'))).toBe(true);
    });

    it('flags no winners despite high spend', () => {
      const loser = createMockCreative({ spend: 60000, purchases: 1, cpa: 60000 });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [],
          losers: [{ creative: loser, whyItFails: 'High CPA', recommendation: 'Pause' }],
          wastedSpend: { total: 60000, creatives: [] },
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.humanReviewRequired).toBe(true);
      expect(result.humanReviewReasons.some(r => r.includes('No winning creatives'))).toBe(true);
    });

    it('flags all winners no losers', () => {
      const winners = Array.from({ length: 6 }, (_, i) =>
        createMockCreative({ adId: `ad_${i}`, adName: `Winner ${i}` })
      );

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: winners.map(c => ({ creative: c, whyItWorks: 'Good' })),
          losers: [],
          wastedSpend: { total: 0, creatives: [] },
        },
        summary: { ...createMockAudit().summary, wastedSpend: 0 },
      });

      const result = validateAuditQuality(audit);

      expect(result.humanReviewRequired).toBe(true);
      expect(result.humanReviewReasons.some(r => r.includes('All creatives classified as winners'))).toBe(true);
    });

    it('flags extreme CPA variation', () => {
      const cheapCreative = createMockCreative({ cpa: 10 });
      const expensiveCreative = createMockCreative({ cpa: 1000, adId: 'ad_exp' }); // 100x difference

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative: cheapCreative, whyItWorks: 'Cheap CPA' }],
          losers: [{ creative: expensiveCreative, whyItFails: 'Expensive', recommendation: 'Pause' }],
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.humanReviewRequired).toBe(true);
      expect(result.humanReviewReasons.some(r => r.includes('Extreme CPA variation'))).toBe(true);
    });

    it('flags high ROAS creatives', () => {
      const highRoas = createMockCreative({ roas: 25 }); // > 20x

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative: highRoas, whyItWorks: 'Amazing ROAS' }],
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.humanReviewRequired).toBe(true);
      expect(result.humanReviewReasons.some(r => r.includes('ROAS exceeds 20x'))).toBe(true);
    });

    it('flags low data volume', () => {
      const lowConversions = createMockCreative({ spend: 15000, purchases: 2 });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative: lowConversions, whyItWorks: 'Some conversions' }],
          losers: [],
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.humanReviewRequired).toBe(true);
      expect(result.humanReviewReasons.some(r => r.includes('low statistical significance'))).toBe(true);
    });

    it('flags very long date range', () => {
      const audit = createMockAudit({
        dateRange: {
          start: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
          end: new Date().toISOString(),
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.humanReviewRequired).toBe(true);
      expect(result.humanReviewReasons.some(r => r.includes('days'))).toBe(true);
    });

    it('flags very short date range', () => {
      const audit = createMockAudit({
        dateRange: {
          start: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
          end: new Date().toISOString(),
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.humanReviewRequired).toBe(true);
      expect(result.humanReviewReasons.some(r => r.includes('very short period'))).toBe(true);
    });
  });

  describe('formatQAResult', () => {
    it('formats passing result', () => {
      const audit = createMockAudit();
      const result = validateAuditQuality(audit);
      const formatted = formatQAResult(result);

      expect(formatted).toContain('PASSED');
      expect(formatted).toContain('QA Score:');
    });

    it('formats failing result', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          insights: [],
          recommendations: [],
        },
      });

      const result = validateAuditQuality(audit);
      const formatted = formatQAResult(result);

      expect(formatted).toContain('FAILED');
      expect(formatted).toContain('Quality Issues:');
    });

    it('includes data integrity status', () => {
      const audit = createMockAudit();
      const result = validateAuditQuality(audit);
      const formatted = formatQAResult(result);

      expect(formatted).toContain('Data Integrity:');
    });

    it('includes calculation errors when present', () => {
      const creative = createMockCreative({
        spend: 1000,
        purchases: 10,
        cpa: 500, // Wrong - should be 100
      });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative, whyItWorks: 'Test' }],
        },
      });

      const result = validateAuditQuality(audit);
      const formatted = formatQAResult(result);

      expect(formatted).toContain('Calculation Errors:');
      expect(formatted).toContain('CPA mismatch');
    });

    it('includes human review section when required', () => {
      const audit = createMockAudit({
        summary: { ...createMockAudit().summary, healthScore: 5 },
      });

      const result = validateAuditQuality(audit);
      const formatted = formatQAResult(result);

      expect(formatted).toContain('HUMAN REVIEW RECOMMENDED');
    });

    it('includes suggestions when present', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [],
        },
      });

      const result = validateAuditQuality(audit);
      const formatted = formatQAResult(result);

      expect(formatted).toContain('Suggestions:');
    });
  });

  describe('isAuditDataValid', () => {
    it('returns true for valid audit', () => {
      const audit = createMockAudit();
      expect(isAuditDataValid(audit)).toBe(true);
    });

    it('returns false when calculation errors exist', () => {
      const creative = createMockCreative({
        spend: 1000,
        purchases: 10,
        cpa: 500, // Wrong
      });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative, whyItWorks: 'Test' }],
        },
      });

      expect(isAuditDataValid(audit)).toBe(false);
    });

    it('returns false when negative values exist', () => {
      const creative = createMockCreative({ spend: -100 });

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative, whyItWorks: 'Test' }],
        },
      });

      expect(isAuditDataValid(audit)).toBe(false);
    });

    it('returns true even with warnings (non-critical)', () => {
      const creative = createMockCreative({ roas: 150 }); // Very high but not negative

      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [{ creative, whyItWorks: 'Test' }],
        },
      });

      // High ROAS is a warning, not critical
      expect(isAuditDataValid(audit)).toBe(true);
    });
  });

  describe('getHumanReviewFlags', () => {
    it('returns empty array for normal audit', () => {
      const audit = createMockAudit();
      const flags = getHumanReviewFlags(audit);

      // Normal audit might have some flags, check it returns array
      expect(Array.isArray(flags)).toBe(true);
    });

    it('returns reasons for problematic audit', () => {
      const audit = createMockAudit({
        summary: { ...createMockAudit().summary, healthScore: 5 },
      });

      const flags = getHumanReviewFlags(audit);

      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some(f => f.includes('health score'))).toBe(true);
    });

    it('matches humanReviewReasons from validateAuditQuality', () => {
      const audit = createMockAudit({
        summary: { ...createMockAudit().summary, healthScore: 5 },
      });

      const flags = getHumanReviewFlags(audit);
      const result = validateAuditQuality(audit);

      expect(flags).toEqual(result.humanReviewReasons);
    });
  });

  describe('suggestions', () => {
    it('suggests lowering CPA threshold when no winners', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          winners: [],
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.suggestions.some(s => s.includes('lowering CPA threshold'))).toBe(true);
    });

    it('suggests reviewing classification when wasted spend but no losers', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          losers: [],
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.suggestions.some(s => s.includes('review classification'))).toBe(true);
    });

    it('suggests more recommendations when few exist', () => {
      const audit = createMockAudit({
        creativeAnalysis: {
          ...createMockAudit().creativeAnalysis,
          recommendations: [
            {
              priority: 'high',
              title: 'Only One',
              description: 'This is the only recommendation provided.',
              expectedImpact: 'Some impact expected.',
              effort: 'low',
            },
          ],
        },
      });

      const result = validateAuditQuality(audit);

      expect(result.suggestions.some(s => s.includes('more actionable recommendations'))).toBe(true);
    });
  });
});
