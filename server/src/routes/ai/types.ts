/**
 * AI route — shared types (leaf module; no sibling imports → no cycles).
 */

/** Shape of a Meta Insights API response with a data array of raw insight rows */
export interface MetaInsightsResponse {
  data?: MetaInsightRow[];
}

/** A single row from Meta Insights — field names vary by query, so indexed access is used */
export interface MetaInsightRow {
  [field: string]: string | number | Record<string, unknown>[] | undefined;
  ad_name?: string;
  campaign_name?: string;
  date_start?: string;
}

export interface ChartItem { label: string; value: number }
export interface AiChart { type: string; data: ChartItem[] }
export interface AiTable { headers: string[]; rows: string[][] }
export interface AiResponse { content: string; chart?: AiChart; table?: AiTable }

export type Intent =
  | 'roas'
  | 'spend'
  | 'audience'
  | 'creative'
  | 'cpa'
  | 'forecast'
  | 'script'
  | 'help'
  | 'overview'
  | 'comparison';
