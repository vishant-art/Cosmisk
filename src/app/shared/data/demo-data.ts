import { Brand } from '../../core/models/brand.model';
import { Creative } from '../../core/models/creative.model';
import { AiInsight } from '../../core/models/insight.model';

export const DEMO_BRAND: Brand = {
  id: 'brand-001',
  name: 'Nectar Supplements',
  category: 'Health & Wellness',
  monthlySpend: 1840000,
  roas: 3.2,
  alertCount: 2,
  status: 'active',
  activeCampaigns: 8,
  activeCreatives: 47,
};

export const DEMO_AGENCY_BRANDS: Brand[] = [
  { id: 'brand-001', name: 'Nectar Supplements', category: 'Health & Wellness', monthlySpend: 1840000, roas: 3.2, alertCount: 2, status: 'active', activeCampaigns: 8, activeCreatives: 47 },
  { id: 'brand-002', name: 'Urban Drape', category: 'Fashion', monthlySpend: 1280000, roas: 2.8, alertCount: 0, status: 'active', activeCampaigns: 5, activeCreatives: 31 },
  { id: 'brand-003', name: 'Glow Kitchen', category: 'Beauty', monthlySpend: 2410000, roas: 4.1, alertCount: 1, status: 'active', activeCampaigns: 12, activeCreatives: 65 },
  { id: 'brand-004', name: 'BiteBox', category: 'Snacks', monthlySpend: 860000, roas: 1.9, alertCount: 4, status: 'warning', activeCampaigns: 4, activeCreatives: 18 },
  { id: 'brand-005', name: 'Sole Stories', category: 'Footwear', monthlySpend: 1530000, roas: 3.5, alertCount: 0, status: 'active', activeCampaigns: 6, activeCreatives: 28 },
  { id: 'brand-006', name: 'PureHome', category: 'Home Decor', monthlySpend: 2100000, roas: 2.4, alertCount: 3, status: 'active', activeCampaigns: 9, activeCreatives: 42 },
];

export const DEMO_CREATIVES: Creative[] = [
  {
    id: 'cr-001', name: 'Collagen Glow-Up', brandId: 'brand-001', format: 'video', duration: 15,
    thumbnailUrl: 'https://placehold.co/400x400/FEF3C7/92400E?text=Collagen+Glow-Up', status: 'winning',
    dna: { hook: ['Shock Statement'], visual: ['Macro Texture', 'Warm Palette'], audio: ['Hindi VO', 'Upbeat'] },
    metrics: { roas: 4.8, cpa: 340, ctr: 2.1, spend: 320000, impressions: 1520000, clicks: 31920, conversions: 941 },
    trend: { direction: 'up', percentage: 12, period: 'this week' },
    daysActive: 14, createdAt: '2026-01-30', adSetId: 'as-001', campaignId: 'camp-001',
  },
  {
    id: 'cr-002', name: 'Morning Routine with Nectar', brandId: 'brand-001', format: 'video', duration: 30,
    thumbnailUrl: 'https://placehold.co/400x400/DBEAFE/1E40AF?text=Morning+Routine', status: 'stable',
    dna: { hook: ['Personal Story'], visual: ['Lifestyle', 'Warm Palette'], audio: ['Hindi VO', 'Emotional'] },
    metrics: { roas: 3.9, cpa: 410, ctr: 1.8, spend: 280000, impressions: 1100000, clicks: 19800, conversions: 683 },
    trend: { direction: 'flat', percentage: 2, period: 'this week' },
    daysActive: 21, createdAt: '2026-01-23', adSetId: 'as-002', campaignId: 'camp-001',
  },
  {
    id: 'cr-003', name: '₹999 for 30 Days', brandId: 'brand-001', format: 'static',
    thumbnailUrl: 'https://placehold.co/400x400/D1FAE5/065F46?text=₹999+for+30+Days', status: 'winning',
    dna: { hook: ['Price Anchor'], visual: ['Text-Heavy', 'Product Focus'], audio: [] },
    metrics: { roas: 5.2, cpa: 290, ctr: 3.2, spend: 410000, impressions: 1800000, clicks: 57600, conversions: 1414 },
    trend: { direction: 'up', percentage: 8, period: 'this week' },
    daysActive: 28, createdAt: '2026-01-16', adSetId: 'as-003', campaignId: 'camp-002',
  },
  {
    id: 'cr-004', name: 'Before/After 60 Days', brandId: 'brand-001', format: 'carousel',
    thumbnailUrl: 'https://placehold.co/400x400/FEE2E2/EF4444?text=Before+After', status: 'fatiguing',
    dna: { hook: ['Transformation'], visual: ['Before/After', 'UGC Style'], audio: [] },
    metrics: { roas: 2.1, cpa: 580, ctr: 1.2, spend: 140000, impressions: 700000, clicks: 8400, conversions: 241 },
    trend: { direction: 'down', percentage: 18, period: 'this week' },
    daysActive: 35, createdAt: '2026-01-09', adSetId: 'as-004', campaignId: 'camp-003',
  },
  {
    id: 'cr-005', name: "Doctor's Choice", brandId: 'brand-001', format: 'video', duration: 10,
    thumbnailUrl: 'https://placehold.co/400x400/E0E7FF/4338CA?text=Doctors+Choice', status: 'stable',
    dna: { hook: ['Authority'], visual: ['Product Focus', 'Minimal'], audio: ['English VO', 'Upbeat'] },
    metrics: { roas: 3.4, cpa: 420, ctr: 2.4, spend: 210000, impressions: 950000, clicks: 22800, conversions: 500 },
    trend: { direction: 'up', percentage: 5, period: 'this week' },
    daysActive: 10, createdAt: '2026-02-03', adSetId: 'as-005', campaignId: 'camp-004',
  },
  {
    id: 'cr-006', name: 'Unboxing', brandId: 'brand-001', format: 'video', duration: 20,
    thumbnailUrl: 'https://placehold.co/400x400/FEF3C7/92400E?text=Unboxing', status: 'winning',
    dna: { hook: ['Curiosity'], visual: ['UGC Style', 'Warm Palette'], audio: ['Hindi VO', 'ASMR'] },
    metrics: { roas: 4.2, cpa: 370, ctr: 2.8, spend: 190000, impressions: 850000, clicks: 23800, conversions: 514 },
    trend: { direction: 'up', percentage: 18, period: 'this week' },
    daysActive: 7, createdAt: '2026-02-06', adSetId: 'as-006', campaignId: 'camp-005',
  },
  {
    id: 'cr-007', name: 'Summer Sale 40% Off', brandId: 'brand-001', format: 'static',
    thumbnailUrl: 'https://placehold.co/400x400/FEE2E2/EF4444?text=Summer+Sale', status: 'fatiguing',
    dna: { hook: ['Urgency'], visual: ['Text-Heavy', 'Warm Palette'], audio: [] },
    metrics: { roas: 1.8, cpa: 720, ctr: 1.1, spend: 350000, impressions: 1600000, clicks: 17600, conversions: 486 },
    trend: { direction: 'down', percentage: 24, period: 'this week' },
    daysActive: 42, createdAt: '2026-01-02', adSetId: 'as-007', campaignId: 'camp-006',
  },
  {
    id: 'cr-008', name: 'Customer Review Reel', brandId: 'brand-001', format: 'video', duration: 15,
    thumbnailUrl: 'https://placehold.co/400x400/DBEAFE/1E40AF?text=Customer+Review', status: 'stable',
    dna: { hook: ['Social Proof'], visual: ['UGC Style'], audio: ['Hindi VO', 'Upbeat'] },
    metrics: { roas: 3.7, cpa: 390, ctr: 2.0, spend: 230000, impressions: 1050000, clicks: 21000, conversions: 590 },
    trend: { direction: 'up', percentage: 6, period: 'this week' },
    daysActive: 18, createdAt: '2026-01-26', adSetId: 'as-008', campaignId: 'camp-007',
  },
  {
    id: 'cr-009', name: 'Ingredients Deep Dive', brandId: 'brand-001', format: 'carousel',
    thumbnailUrl: 'https://placehold.co/400x400/D1FAE5/065F46?text=Ingredients', status: 'stable',
    dna: { hook: ['Education'], visual: ['Flat Lay', 'Minimal'], audio: [] },
    metrics: { roas: 2.5, cpa: 510, ctr: 1.5, spend: 100000, impressions: 480000, clicks: 7200, conversions: 196 },
    trend: { direction: 'flat', percentage: 1, period: 'this week' },
    daysActive: 25, createdAt: '2026-01-19', adSetId: 'as-009', campaignId: 'camp-008',
  },
  {
    id: 'cr-010', name: 'Diwali Special Pack', brandId: 'brand-001', format: 'video', duration: 20,
    thumbnailUrl: 'https://placehold.co/400x400/FEF3C7/92400E?text=Diwali+Special', status: 'stable',
    dna: { hook: ['Curiosity'], visual: ['Warm Palette', 'Product Focus'], audio: ['Hindi VO', 'Emotional'] },
    metrics: { roas: 3.0, cpa: 450, ctr: 1.9, spend: 180000, impressions: 820000, clicks: 15580, conversions: 400 },
    trend: { direction: 'flat', percentage: 3, period: 'this week' },
    daysActive: 30, createdAt: '2026-01-14', adSetId: 'as-010', campaignId: 'camp-008',
  },
];

export const DEMO_INSIGHTS: AiInsight[] = [
  {
    id: 'ins-001', priority: 'alert',
    title: 'Fatigue Alert',
    description: "'Collagen Glow-Up' CTR dropped 34% in 7 days. Hook DNA: Shock Statement is losing impact.",
    actionLabel: 'View Creative', actionRoute: '/app/creative-cockpit', creativeId: 'cr-001',
    createdAt: '2026-02-13T09:00:00Z',
  },
  {
    id: 'ins-002', priority: 'positive',
    title: 'Rising Star',
    description: "'Unboxing' UGC creative ROAS up 18% this week. Consider scaling budget.",
    actionLabel: 'View Creative', actionRoute: '/app/creative-cockpit', creativeId: 'cr-006',
    createdAt: '2026-02-13T09:00:00Z',
  },
  {
    id: 'ins-003', priority: 'pattern',
    title: 'Pattern Found',
    description: 'Price Anchor hooks generate 2.1x higher ROAS than other hook types across your account.',
    actionLabel: 'Explore Pattern', actionRoute: '/app/brain',
    createdAt: '2026-02-13T09:00:00Z',
  },
];

export const DEMO_DASHBOARD_KPI = {
  spend: { value: 1840000, change: 12.3, sparkline: [1200000, 1350000, 1500000, 1600000, 1720000, 1780000, 1840000] },
  revenue: { value: 5888000, change: 18.7, sparkline: [3800000, 4200000, 4600000, 5000000, 5300000, 5600000, 5888000] },
  roas: { value: 3.2, change: 0.4, sparkline: [2.6, 2.8, 3.0, 3.1, 3.0, 3.1, 3.2] },
  activeCreatives: { value: 47, winning: 12, stable: 28, fatiguing: 7 },
};

export const DEMO_CHART_DATA = [
  { date: 'Feb 7', roas: 2.8, spend: 240000, revenue: 672000 },
  { date: 'Feb 8', roas: 3.0, spend: 260000, revenue: 780000 },
  { date: 'Feb 9', roas: 3.1, spend: 270000, revenue: 837000 },
  { date: 'Feb 10', roas: 2.9, spend: 250000, revenue: 725000 },
  { date: 'Feb 11', roas: 3.3, spend: 280000, revenue: 924000 },
  { date: 'Feb 12', roas: 3.1, spend: 270000, revenue: 837000 },
  { date: 'Feb 13', roas: 3.2, spend: 270000, revenue: 864000 },
];
