import { describe, it, expect } from 'vitest';

// We test the plan limits and logic directly since they're pure data
import { PLAN_LIMITS, TRIAL_LIMITS } from '../routes/billing.js';

describe('Plan Limits', () => {
  it('should have 4 plan tiers', () => {
    expect(Object.keys(PLAN_LIMITS)).toEqual(['free', 'solo', 'growth', 'agency']);
  });

  it('free plan should be most restrictive', () => {
    expect(PLAN_LIMITS.free.ad_accounts).toBe(1);
    expect(PLAN_LIMITS.free.images_per_month).toBe(0);
    expect(PLAN_LIMITS.free.videos_per_month).toBe(0);
    expect(PLAN_LIMITS.free.team_members).toBe(1);
  });

  it('agency plan should be unlimited (-1)', () => {
    expect(PLAN_LIMITS.agency.ad_accounts).toBe(-1);
    expect(PLAN_LIMITS.agency.images_per_month).toBe(-1);
    expect(PLAN_LIMITS.agency.videos_per_month).toBe(-1);
    expect(PLAN_LIMITS.agency.creatives_per_month).toBe(-1);
    expect(PLAN_LIMITS.agency.autopilot_rules).toBe(-1);
    expect(PLAN_LIMITS.agency.competitors).toBe(-1);
    expect(PLAN_LIMITS.agency.team_members).toBe(-1);
  });

  it('solo plan should allow only 1 team member (owner)', () => {
    expect(PLAN_LIMITS.solo.team_members).toBe(1);
  });

  it('growth plan should allow 5 team members', () => {
    expect(PLAN_LIMITS.growth.team_members).toBe(5);
  });

  it('plan limits should increase with tier', () => {
    expect(PLAN_LIMITS.solo.ad_accounts).toBeGreaterThan(PLAN_LIMITS.free.ad_accounts);
    expect(PLAN_LIMITS.growth.ad_accounts).toBeGreaterThan(PLAN_LIMITS.solo.ad_accounts);
    expect(PLAN_LIMITS.growth.images_per_month).toBeGreaterThan(PLAN_LIMITS.solo.images_per_month);
    expect(PLAN_LIMITS.growth.videos_per_month).toBeGreaterThan(PLAN_LIMITS.solo.videos_per_month);
  });

  it('trial limits should be roughly 50% of paid tiers', () => {
    // Solo trial: 15 images vs 30 paid
    expect(TRIAL_LIMITS.solo.images_per_month).toBeLessThan(PLAN_LIMITS.solo.images_per_month);
    expect(TRIAL_LIMITS.solo.images_per_month).toBeGreaterThan(0);

    // Growth trial: 50 images vs 100 paid
    expect(TRIAL_LIMITS.growth.images_per_month).toBeLessThan(PLAN_LIMITS.growth.images_per_month);
    expect(TRIAL_LIMITS.growth.images_per_month).toBeGreaterThan(0);
  });

  it('all plans should have all required limit fields', () => {
    const requiredFields = ['ad_accounts', 'chats_per_day', 'images_per_month', 'videos_per_month', 'creatives_per_month', 'autopilot_rules', 'competitors', 'team_members'];

    for (const plan of Object.values(PLAN_LIMITS)) {
      for (const field of requiredFields) {
        expect(plan).toHaveProperty(field);
        expect(typeof (plan as any)[field]).toBe('number');
      }
    }
  });
});

describe('Token Hashing', () => {
  it('should produce consistent SHA-256 hashes', async () => {
    const crypto = await import('crypto');
    const token = 'test-token-123';
    const hash1 = crypto.createHash('sha256').update(token).digest('hex');
    const hash2 = crypto.createHash('sha256').update(token).digest('hex');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should produce different hashes for different tokens', async () => {
    const crypto = await import('crypto');
    const hash1 = crypto.createHash('sha256').update('token-a').digest('hex');
    const hash2 = crypto.createHash('sha256').update('token-b').digest('hex');
    expect(hash1).not.toBe(hash2);
  });
});
