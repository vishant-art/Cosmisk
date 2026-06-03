/* ------------------------------------------------------------------ */
/*  Predicted ROAS, calibration, top insight, accuracy + feedback loop */
/* ------------------------------------------------------------------ */

import { getDbAdapter } from '../../db/adapter.js';
import type { CreativeScoreInput, DimensionResult } from './types.js';

/* ------------------------------------------------------------------ */
/*  Predicted ROAS range (Tier 3 only)                                */
/* ------------------------------------------------------------------ */

export async function computePredictedRoas(
  format: string,
  tags: CreativeScoreInput['dnaTags'],
  assetsWithMetrics: Array<{ dna_tags: string | null; actual_metrics: string | null }>,
  userId: string,
): Promise<{ p25: number; p50: number; p75: number } | undefined> {
  // Find similar assets by format + hook overlap
  const inputHooks = new Set(tags?.hook || []);
  const comparableRoas: number[] = [];

  for (const asset of assetsWithMetrics) {
    if (!asset.actual_metrics || !asset.dna_tags) continue;
    try {
      const metrics = JSON.parse(asset.actual_metrics);
      const parsed = JSON.parse(asset.dna_tags);
      const assetHooks = new Set(parsed.hook || []);
      const overlap = [...inputHooks].filter(h => assetHooks.has(h));

      if (overlap.length > 0 && metrics.roas > 0) {
        comparableRoas.push(metrics.roas);
      }
    } catch { /* skip */ }
  }

  if (comparableRoas.length < 5) return undefined;

  comparableRoas.sort((a, b) => a - b);

  // Apply calibration factor
  const calibration = await getCalibrationFactor(userId);

  const percentile = (arr: number[], p: number) => {
    const idx = Math.floor(arr.length * p);
    return arr[Math.min(idx, arr.length - 1)];
  };

  return {
    p25: Math.round(percentile(comparableRoas, 0.25) * calibration * 100) / 100,
    p50: Math.round(percentile(comparableRoas, 0.50) * calibration * 100) / 100,
    p75: Math.round(percentile(comparableRoas, 0.75) * calibration * 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/*  Calibration factor — adjusts predictions from past accuracy        */
/* ------------------------------------------------------------------ */

export async function getCalibrationFactor(userId: string): Promise<number> {
  try {
    const db = getDbAdapter();
    const rows = await db.all(
      'SELECT predicted_roas_mid, actual_roas FROM score_predictions WHERE user_id = ? AND actual_roas IS NOT NULL AND predicted_roas_mid IS NOT NULL ORDER BY resolved_at DESC LIMIT 50',
      [userId]
    ) as Array<{ predicted_roas_mid: number; actual_roas: number }>;

    if (rows.length < 5) return 1.0; // not enough data

    const ratios = rows.map(r => r.actual_roas / r.predicted_roas_mid).filter(r => isFinite(r) && r > 0);
    if (ratios.length < 5) return 1.0;

    // Median ratio = calibration factor (if we consistently over-predict, factor < 1)
    ratios.sort((a, b) => a - b);
    return ratios[Math.floor(ratios.length / 2)];
  } catch {
    return 1.0;
  }
}

/* ------------------------------------------------------------------ */
/*  Top insight generation                                             */
/* ------------------------------------------------------------------ */

export function deriveTopInsight(
  total: number,
  confidence: string,
  patternMatch: DimensionResult,
  hookQuality: Omit<DimensionResult, 'matchedPatterns'>,
  novelty: Omit<DimensionResult, 'matchedPatterns'>,
): string {
  if (total >= 80) {
    if (patternMatch.score >= 16) return 'This creative closely matches your proven winning DNA.';
    if (novelty.score >= 16) return 'Fresh creative with strong platform signals — high test value.';
    return 'Strong all-around scores — this creative is well-positioned to perform.';
  }
  if (total >= 60) {
    if (patternMatch.score < 8) return 'Consider incorporating more of your proven hook and visual patterns.';
    if (hookQuality.score < 8) return 'The hook could be stronger for this platform.';
    return 'Solid creative with room for optimization in a few areas.';
  }
  if (confidence === 'low') {
    return 'Limited data for scoring. Connect Meta and track more ads to improve predictions.';
  }
  if (novelty.score < 6) return 'This creative is too similar to active ads — try a different angle.';
  return 'Below average predicted performance. Consider revising the hook or format.';
}

/* ------------------------------------------------------------------ */
/*  Accuracy stats — for the /accuracy endpoint                        */
/* ------------------------------------------------------------------ */

export async function getAccuracyStats(userId: string): Promise<{
  totalPredictions: number;
  resolvedPredictions: number;
  meanAbsoluteError: number | null;
  accuracyByFormat: Record<string, { count: number; meanError: number }>;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
}> {
  const db = getDbAdapter();

  const total = (await db.get('SELECT COUNT(*) as c FROM score_predictions WHERE user_id = ?', [userId]) as { c: number }).c;
  const resolved = await db.all(
    'SELECT * FROM score_predictions WHERE user_id = ? AND actual_roas IS NOT NULL',
    [userId]
  ) as Array<{
    format: string; accuracy_error: number; predicted_score: number;
    actual_roas: number; created_at: string; resolved_at: string;
  }>;

  if (resolved.length === 0) {
    return {
      totalPredictions: total,
      resolvedPredictions: 0,
      meanAbsoluteError: null,
      accuracyByFormat: {},
      trend: 'insufficient_data',
    };
  }

  const meanAbsoluteError = resolved.reduce((s, r) => s + (r.accuracy_error || 0), 0) / resolved.length;

  // Group by format
  const byFormat: Record<string, { errors: number[]; count: number }> = {};
  for (const r of resolved) {
    if (!byFormat[r.format]) byFormat[r.format] = { errors: [], count: 0 };
    byFormat[r.format].errors.push(r.accuracy_error || 0);
    byFormat[r.format].count++;
  }

  const accuracyByFormat: Record<string, { count: number; meanError: number }> = {};
  for (const [fmt, data] of Object.entries(byFormat)) {
    accuracyByFormat[fmt] = {
      count: data.count,
      meanError: data.errors.reduce((s, e) => s + e, 0) / data.errors.length,
    };
  }

  // Trend: compare first half vs second half error
  let trend: 'improving' | 'stable' | 'declining' | 'insufficient_data' = 'insufficient_data';
  if (resolved.length >= 10) {
    const sorted = [...resolved].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const mid = Math.floor(sorted.length / 2);
    const firstHalfErr = sorted.slice(0, mid).reduce((s, r) => s + (r.accuracy_error || 0), 0) / mid;
    const secondHalfErr = sorted.slice(mid).reduce((s, r) => s + (r.accuracy_error || 0), 0) / (sorted.length - mid);

    if (secondHalfErr < firstHalfErr * 0.85) trend = 'improving';
    else if (secondHalfErr > firstHalfErr * 1.15) trend = 'declining';
    else trend = 'stable';
  }

  return {
    totalPredictions: total,
    resolvedPredictions: resolved.length,
    meanAbsoluteError: Math.round(meanAbsoluteError * 1000) / 1000,
    accuracyByFormat,
    trend,
  };
}

/* ------------------------------------------------------------------ */
/*  Feedback loop: resolve predictions with actual data                */
/* ------------------------------------------------------------------ */

export async function resolveScorePredictions(): Promise<{ resolved: number }> {
  const db = getDbAdapter();

  // Find unresolved predictions linked to assets with actual metrics
  const unresolved = await db.all(`
    SELECT sp.id, sp.predicted_score, sp.predicted_roas_mid, ca.actual_metrics
    FROM score_predictions sp
    JOIN creative_assets ca ON ca.user_id = sp.user_id
    WHERE sp.resolved_at IS NULL
      AND ca.actual_metrics IS NOT NULL
      AND ca.format = sp.format
      AND ca.created_at >= sp.created_at
    ORDER BY sp.created_at ASC
    LIMIT 100
  `) as Array<{
    id: string; predicted_score: number; predicted_roas_mid: number | null;
    actual_metrics: string;
  }>;

  let resolved = 0;
  const updateSql = `
    UPDATE score_predictions
    SET actual_roas = ?, actual_ctr = ?, accuracy_error = ?, resolved_at = datetime('now')
    WHERE id = ?
  `;

  for (const row of unresolved) {
    try {
      const metrics = JSON.parse(row.actual_metrics);
      if (!metrics.roas) continue;

      const actualRoas = metrics.roas;
      const actualCtr = metrics.ctr || null;

      // Error: if we predicted ROAS, compare; otherwise use score-based estimate
      let error: number;
      if (row.predicted_roas_mid && row.predicted_roas_mid > 0) {
        error = Math.abs(row.predicted_roas_mid - actualRoas) / actualRoas;
      } else {
        // Normalize score to rough ROAS estimate for error calc
        const estimatedRoas = (row.predicted_score / 100) * 5; // 100 score ~ 5x ROAS heuristic
        error = Math.abs(estimatedRoas - actualRoas) / Math.max(actualRoas, 0.01);
      }

      await db.run(updateSql, [actualRoas, actualCtr, Math.round(error * 1000) / 1000, row.id]);
      resolved++;
    } catch { /* skip malformed */ }
  }

  return { resolved };
}
