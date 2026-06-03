/**
 * AI route — generic helpers (token lookup, insight fields, date mapping,
 * campaign filtering).
 */

import { getDbAdapter } from '../../db/adapter.js';
import { decryptToken } from '../../services/token-crypto.js';
import type { MetaTokenRow } from '../../types/index.js';

export async function getUserMetaToken(userId: string): Promise<string | null> {
  const row = await getDbAdapter().get<MetaTokenRow>('SELECT * FROM meta_tokens WHERE user_id = ?', [userId]);
  if (!row) return null;
  return decryptToken(row.encrypted_access_token);
}

export const INSIGHT_FIELDS = 'spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas';

/** Map natural-language date ranges to Meta API date_preset values */
export function mapDateRange(dateRange: string): string | null {
  const lower = dateRange.toLowerCase().trim();
  const map: Record<string, string> = {
    'today': 'today',
    'yesterday': 'yesterday',
    'last 3 days': 'last_3d',
    'last 3d': 'last_3d',
    'past 3 days': 'last_3d',
    'last 7 days': 'last_7d',
    'last week': 'last_7d',
    'past week': 'last_7d',
    'this week': 'last_7d',
    'last 14 days': 'last_14d',
    'last 2 weeks': 'last_14d',
    'past 2 weeks': 'last_14d',
    'last 30 days': 'last_30d',
    'last month': 'last_30d',
    'past month': 'last_30d',
    'this month': 'this_month',
    'last 90 days': 'last_90d',
    'last 3 months': 'last_90d',
    'last quarter': 'last_quarter',
    'this year': 'this_year',
    'last year': 'last_year',
  };
  return map[lower] || null;
}

/** Filter campaigns by name (case-insensitive partial match) */
export function filterCampaignsByName<T extends { label?: string; name?: string; campaign_name?: string }>(
  items: T[],
  campaignFilter: string,
): T[] {
  const lower = campaignFilter.toLowerCase();
  return items.filter(item => {
    const name = (item.label || item.name || item.campaign_name || '').toLowerCase();
    return name.includes(lower);
  });
}
