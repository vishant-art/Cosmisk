/* ------------------------------------------------------------------ */
/*  Local query-result interfaces (only fields actually accessed)      */
/*  Shared leaf module — imported by the route plugin and helpers.     */
/* ------------------------------------------------------------------ */

/** Progress stats for a sprint's jobs */
export interface SprintProgressRow {
  total: number;
  completed: number;
  failed: number;
  in_progress: number;
  pending: number;
}

/** Cost aggregation by provider */
export interface CostByProviderRow {
  api_provider: string;
  total_cents: number;
  operations: number;
}

/** Cost aggregation by sprint */
export interface CostBySprintRow {
  sprint_id: string;
  total_cents: number;
  operations: number;
}

/** Single sum of cost_cents */
export interface CostTotalRow {
  total_cents: number | null;
}

/** Monthly / all-time usage aggregation */
export interface UsageAggRow {
  generations: number;
  cost_cents: number;
}

/** Format performance aggregation */
export interface FormatPerformanceRow {
  format: string;
  total_assets: number;
  tracked_assets: number;
  avg_predicted_score: number | null;
}

/** Row containing only actual_metrics JSON string */
export interface ActualMetricsRow {
  actual_metrics: string;
}

/** Sprint trend data for analytics */
export interface SprintTrendRow {
  id: string;
  name: string;
  status: string;
  total_creatives: number;
  completed_creatives: number;
  estimated_cost_cents: number;
  actual_cost_cents: number;
  created_at: string;
}

/** Asset with predicted score and metrics for prediction accuracy */
export interface PredictionRow {
  predicted_score: number | null;
  actual_metrics: string;
}

/** Top DNA row with tags, metrics, and score */
export interface TopDnaRow {
  dna_tags: string;
  actual_metrics: string;
  predicted_score: number | null;
}

/** Shape of a Meta API error response body */
export interface MetaErrorBody {
  error?: { message?: string };
}

/** A single analyzed ad from the account snapshot */
export interface AnalyzedAd {
  id: string;
  name: string;
  spend: number;
  roas: number;
  ctr: number;
  cpa: number;
  impressions: number;
  conversions: number;
  format: string;
  thumbnail_url: string;
  video_id: string | null;
  days_active: number;
}
