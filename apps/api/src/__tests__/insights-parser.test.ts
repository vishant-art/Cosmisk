import { describe, it, expect } from 'vitest';
import {
  parseInsightMetrics,
  parseChartData,
  parseCampaignBreakdown,
  parseAudienceBreakdown,
  computeKpiChange,
} from '../services/insights-parser.js';

describe('parseInsightMetrics', () => {
  it('parses a full Meta insight row correctly', () => {
    const m = parseInsightMetrics({
      spend: '1500.00',
      impressions: '50000',
      clicks: '2000',
      ctr: '4.0',
      cpc: '0.75',
      actions: [
        { action_type: 'purchase', value: '30' },
        { action_type: 'link_click', value: '2000' },
      ],
      action_values: [
        { action_type: 'purchase', value: '6000.00' },
      ],
      purchase_roas: [
        { action_type: 'purchase', value: '4.0' },
      ],
    });

    expect(m.spend).toBe(1500);
    expect(m.impressions).toBe(50000);
    expect(m.clicks).toBe(2000);
    expect(m.ctr).toBe(4.0);
    expect(m.cpc).toBe(0.75);
    expect(m.conversions).toBe(30);
    expect(m.revenue).toBe(6000);
    expect(m.roas).toBe(4.0);
    expect(m.cpa).toBe(50); // 1500/30
    expect(m.aov).toBe(200); // 6000/30
  });

  it('calculates ROAS from revenue/spend when purchase_roas is missing', () => {
    const m = parseInsightMetrics({
      spend: '1000',
      actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '10' }],
      action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '3500' }],
    });

    expect(m.roas).toBe(3.5); // 3500/1000
    expect(m.conversions).toBe(10);
    expect(m.revenue).toBe(3500);
  });

  it('handles zero spend gracefully', () => {
    const m = parseInsightMetrics({ spend: '0' });
    expect(m.roas).toBe(0);
    expect(m.cpa).toBe(0);
    expect(m.aov).toBe(0);
  });

  it('handles empty/missing fields', () => {
    const m = parseInsightMetrics({});
    expect(m.spend).toBe(0);
    expect(m.impressions).toBe(0);
    expect(m.clicks).toBe(0);
    expect(m.conversions).toBe(0);
    expect(m.revenue).toBe(0);
    expect(m.roas).toBe(0);
    expect(m.cpa).toBe(0);
    expect(m.aov).toBe(0);
  });

  it('handles conversions with zero spend (free traffic)', () => {
    const m = parseInsightMetrics({
      spend: '0',
      actions: [{ action_type: 'purchase', value: '5' }],
      action_values: [{ action_type: 'purchase', value: '500' }],
    });
    expect(m.conversions).toBe(5);
    expect(m.revenue).toBe(500);
    expect(m.cpa).toBe(0); // no spend = no CPA
    expect(m.roas).toBe(0); // 0 spend = 0 ROAS (avoid infinity)
  });

  it('picks first matching purchase action type', () => {
    const m = parseInsightMetrics({
      spend: '100',
      actions: [
        { action_type: 'landing_page_view', value: '50' },
        { action_type: 'purchase', value: '3' },
      ],
      action_values: [
        { action_type: 'landing_page_view', value: '0' },
        { action_type: 'purchase', value: '450' },
      ],
    });
    expect(m.conversions).toBe(3);
    expect(m.revenue).toBe(450);
  });
});

describe('parseChartData', () => {
  it('maps rows to chart-friendly format with rounded values', () => {
    const result = parseChartData([
      { spend: '123.456', impressions: '5000', clicks: '200', ctr: '4.0', cpc: '0.617',
        date_start: '2026-03-01',
        actions: [{ action_type: 'purchase', value: '5' }],
        action_values: [{ action_type: 'purchase', value: '600.789' }],
        purchase_roas: [{ action_type: 'purchase', value: '4.867' }],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-03-01');
    expect(result[0].roas).toBe(4.87); // rounded to 2 decimals
    expect(result[0].spend).toBe(123.46);
    expect(result[0].cpa).toBe(24.69); // 123.456/5 rounded
  });

  it('handles empty array', () => {
    expect(parseChartData([])).toEqual([]);
  });
});

describe('parseCampaignBreakdown', () => {
  it('extracts campaign name and computes metrics', () => {
    const result = parseCampaignBreakdown([
      { spend: '500', impressions: '10000', clicks: '400', ctr: '4.0', campaign_name: 'Summer Sale',
        actions: [{ action_type: 'purchase', value: '10' }],
        action_values: [{ action_type: 'purchase', value: '2000' }],
      },
      { spend: '200', campaign_name: 'Brand Awareness' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('Summer Sale');
    expect(result[0].spend).toBe(500);
    expect(result[0].conversions).toBe(10);
    expect(result[0].cpa).toBe(50);
    expect(result[1].label).toBe('Brand Awareness');
    expect(result[1].conversions).toBe(0);
  });

  it('uses "Unknown" for missing campaign names', () => {
    const result = parseCampaignBreakdown([{ spend: '100' }]);
    expect(result[0].label).toBe('Unknown');
  });
});

describe('parseAudienceBreakdown', () => {
  it('combines age and gender into label', () => {
    const result = parseAudienceBreakdown([
      { spend: '300', age: '25-34', gender: 'male', impressions: '5000', clicks: '200' },
      { spend: '200', age: '18-24', gender: 'female', impressions: '3000', clicks: '150' },
    ]);
    expect(result[0].label).toBe('25-34 male');
    expect(result[1].label).toBe('18-24 female');
  });

  it('handles missing age/gender', () => {
    const result = parseAudienceBreakdown([{ spend: '100' }]);
    expect(result[0].label).toBe('Unknown');
  });
});

describe('computeKpiChange', () => {
  it('computes percentage change correctly', () => {
    expect(computeKpiChange(120, 100)).toBe(20);
    expect(computeKpiChange(80, 100)).toBe(-20);
  });

  it('handles zero previous (avoids division by zero)', () => {
    expect(computeKpiChange(50, 0)).toBe(100);
    expect(computeKpiChange(0, 0)).toBe(0);
  });

  it('handles identical values', () => {
    expect(computeKpiChange(100, 100)).toBe(0);
  });

  it('rounds to 1 decimal', () => {
    expect(computeKpiChange(133, 100)).toBe(33);
    expect(computeKpiChange(133.33, 100)).toBe(33.3);
  });
});
