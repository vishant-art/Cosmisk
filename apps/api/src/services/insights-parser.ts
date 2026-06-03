interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsightRow {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  purchase_roas?: Array<{ action_type: string; value: string }>;
  date_start?: string;
  date_stop?: string;
  campaign_name?: string;
  age?: string;
  gender?: string;
}

const PURCHASE_TYPES = ['purchase', 'offsite_conversion.fb_pixel_purchase'];

function findActionValue(actions: MetaAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  for (const type of types) {
    const found = actions.find(a => a.action_type === type);
    if (found) return parseFloat(found.value) || 0;
  }
  return 0;
}

export function parseInsightMetrics(row: MetaInsightRow) {
  const spend = parseFloat(row.spend || '0');
  const impressions = parseInt(row.impressions || '0', 10);
  const clicks = parseInt(row.clicks || '0', 10);
  const ctr = parseFloat(row.ctr || '0');
  const cpc = parseFloat(row.cpc || '0');

  const conversions = findActionValue(row.actions, PURCHASE_TYPES);
  const revenue = findActionValue(row.action_values, PURCHASE_TYPES);

  let roas = 0;
  if (row.purchase_roas?.length) {
    roas = parseFloat(row.purchase_roas[0].value) || 0;
  } else if (spend > 0) {
    roas = revenue / spend;
  }

  const cpa = conversions > 0 ? spend / conversions : 0;
  const aov = conversions > 0 ? revenue / conversions : 0;

  return { spend, impressions, clicks, ctr, cpc, conversions, revenue, roas, cpa, aov };
}

export function parseChartData(rows: MetaInsightRow[]) {
  return rows.map(row => {
    const m = parseInsightMetrics(row);
    return {
      date: row.date_start || '',
      roas: round(m.roas, 2),
      spend: round(m.spend, 2),
      revenue: round(m.revenue, 2),
      ctr: round(m.ctr, 2),
      cpa: round(m.cpa, 2),
    };
  });
}

export function parseCampaignBreakdown(rows: MetaInsightRow[]) {
  return rows.map(row => {
    const m = parseInsightMetrics(row);
    return {
      label: row.campaign_name || 'Unknown',
      spend: round(m.spend, 2),
      roas: round(m.roas, 2),
      cpa: round(m.cpa, 2),
      ctr: round(m.ctr, 2),
      impressions: m.impressions,
      conversions: m.conversions,
      trend: 0,
    };
  });
}

export function parseAudienceBreakdown(rows: MetaInsightRow[]) {
  return rows.map(row => {
    const m = parseInsightMetrics(row);
    return {
      label: `${row.age || 'Unknown'} ${row.gender || ''}`.trim(),
      spend: round(m.spend, 2),
      roas: round(m.roas, 2),
      cpa: round(m.cpa, 2),
      ctr: round(m.ctr, 2),
      impressions: m.impressions,
      conversions: m.conversions,
      trend: 0,
    };
  });
}

export function computeKpiChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return round(((current - previous) / previous) * 100, 1);
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
