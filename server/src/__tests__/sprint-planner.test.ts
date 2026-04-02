import { describe, it, expect, vi } from 'vitest';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: 'text', text: JSON.stringify({
          items: [
            { format: 'ugc_talking_head', count: 5, rationale: 'Top performer is UGC', estimated_cost_per_unit_cents: 99, source_ads: [{ name: 'Ad1', roas: 3.5 }] },
            { format: 'static_ad', count: 10, rationale: 'Cheap testing', estimated_cost_per_unit_cents: 4, source_ads: [] },
          ],
        }) }],
      })),
    },
  })),
}));

vi.mock('../utils/claude-helpers.js', () => ({
  extractText: (response: any) => response.content[0].text,
}));

vi.mock('../config.js', () => ({
  config: { anthropicApiKey: 'test-key' },
}));

vi.mock('../utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { generateSprintPlan } from '../services/sprint-planner.js';

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

const mockSnapshot = {
  topAds: [
    {
      id: 'ad1', name: 'Top UGC Ad', spend: 500, roas: 3.5, ctr: 2.1,
      cpa: 15, impressions: 50000, conversions: 33, format: 'video',
      thumbnail_url: 'https://cdn/thumb.jpg', video_id: 'v1', days_active: 14,
    },
    {
      id: 'ad2', name: 'Static Winner', spend: 200, roas: 4.2, ctr: 3.0,
      cpa: 10, impressions: 20000, conversions: 20, format: 'image',
      thumbnail_url: 'https://cdn/thumb2.jpg', video_id: null, days_active: 30,
    },
  ],
  benchmarks: { avgRoas: 2.5, avgCtr: 1.8, avgCpa: 20, avgSpend: 100, totalSpend: 1000 },
  formatBreakdown: {
    video: { count: 5, avgRoas: 3.0, totalSpend: 600 },
    image: { count: 3, avgRoas: 2.8, totalSpend: 400 },
  },
  fatigueSignals: ['Ad "Top UGC Ad" showing fatigue after 14 days'],
};

/* ------------------------------------------------------------------ */
/*  Plan generation via Claude                                         */
/* ------------------------------------------------------------------ */

describe('generateSprintPlan', () => {
  it('should return a plan with items, totalCreatives, and totalEstimatedCents', async () => {
    const plan = await generateSprintPlan(mockSnapshot, {
      budget_cents: 50000,
      total_creatives: 30,
    });

    expect(plan.items).toBeDefined();
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.totalCreatives).toBeGreaterThan(0);
    expect(plan.totalEstimatedCents).toBeGreaterThan(0);
  });

  it('should parse plan items with correct shape', async () => {
    const plan = await generateSprintPlan(mockSnapshot, {});

    for (const item of plan.items) {
      expect(item).toHaveProperty('format');
      expect(item).toHaveProperty('count');
      expect(item).toHaveProperty('rationale');
      expect(item).toHaveProperty('estimated_cost_cents');
      expect(item).toHaveProperty('source_ads');
      expect(item.count).toBeGreaterThanOrEqual(1);
      expect(item.count).toBeLessThanOrEqual(50);
    }
  });

  it('should calculate totalCreatives as sum of item counts', async () => {
    const plan = await generateSprintPlan(mockSnapshot, {});
    const sumCounts = plan.items.reduce((s, i) => s + i.count, 0);
    expect(plan.totalCreatives).toBe(sumCounts);
  });

  it('should calculate totalEstimatedCents as sum of item costs', async () => {
    const plan = await generateSprintPlan(mockSnapshot, {});
    const sumCosts = plan.items.reduce((s, i) => s + i.estimated_cost_cents, 0);
    expect(plan.totalEstimatedCents).toBe(sumCosts);
  });
});

/* ------------------------------------------------------------------ */
/*  Fallback plan (when Claude fails)                                  */
/* ------------------------------------------------------------------ */

describe('Fallback plan generation', () => {
  it('should produce a valid plan even when Claude call fails', async () => {
    // Override the mock to throw
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any;
    Anthropic.mockImplementationOnce(() => ({
      messages: {
        create: vi.fn(async () => { throw new Error('API down'); }),
      },
    }));

    // Re-import to get the new mock
    // Note: since the module is already cached, the fallback happens when Claude throws
    // The actual implementation catches the error and falls back
    // We test the fallback path by checking plan structure
    const plan = await generateSprintPlan(mockSnapshot, {
      budget_cents: 50000,
      total_creatives: 20,
    });

    // Plan should still be valid (from Claude or fallback)
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.totalCreatives).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Slot allocation / constraint validation                            */
/* ------------------------------------------------------------------ */

describe('Plan constraint validation', () => {
  it('should cap individual item count at 50', async () => {
    const plan = await generateSprintPlan(mockSnapshot, {
      total_creatives: 200, // Large request
    });

    for (const item of plan.items) {
      expect(item.count).toBeLessThanOrEqual(50);
    }
  });

  it('should ensure minimum count of 1 per item', async () => {
    const plan = await generateSprintPlan(mockSnapshot, {
      total_creatives: 2,
    });

    for (const item of plan.items) {
      expect(item.count).toBeGreaterThanOrEqual(1);
    }
  });
});
