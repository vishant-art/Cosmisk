/* ------------------------------------------------------------------ */
/*  Main scoring function                                              */
/*  5-dimension algorithmic scorer — zero Claude calls.                */
/* ------------------------------------------------------------------ */

import { getDbAdapter } from '../../db/adapter.js';
import { getPlatformSignals } from '../platform-signals.js';
import { buildWinningDnaProfile, inferDnaTags } from './dna-profile.js';
import {
  scorePatternMatch,
  scoreHookQuality,
  scoreFormatSignal,
  scoreDataConfidence,
  scoreNovelty,
} from './dimensions.js';
import { computePredictedRoas, deriveTopInsight } from './predictions.js';
import type { CreativeScore, CreativeScoreInput } from './types.js';

export async function scoreCreative(input: CreativeScoreInput): Promise<CreativeScore> {
  const db = getDbAdapter();
  const platform = input.platform || 'meta';
  const signals = getPlatformSignals(platform);

  // Gather account context
  const dnaCacheRows = await db.all(
    'SELECT hook, visual, audio FROM dna_cache WHERE account_id IN (SELECT account_id FROM creative_assets WHERE user_id = ? GROUP BY account_id)',
    [input.userId]
  ) as Array<{ hook: string; visual: string; audio: string }>;

  const trackedAssets = await db.all(
    'SELECT format, dna_tags, actual_metrics, predicted_score, status, published_at FROM creative_assets WHERE user_id = ?',
    [input.userId]
  ) as Array<{
    format: string; dna_tags: string | null; actual_metrics: string | null;
    predicted_score: number | null; status: string; published_at: string | null;
  }>;

  const hasMetaAccount = !!input.metaAccountId;
  const assetsWithMetrics = trackedAssets.filter(a => a.actual_metrics);

  // Determine tier
  const tier: 1 | 2 | 3 =
    assetsWithMetrics.length >= 5 ? 3 :
    hasMetaAccount ? 2 : 1;

  // Build winning DNA profile from tracked assets with actual metrics
  const winningDna = buildWinningDnaProfile(dnaCacheRows, assetsWithMetrics);

  // Infer DNA tags from script text if not provided
  const effectiveTags = input.dnaTags || inferDnaTags(input.scriptText, input.hookType);

  // Score each dimension
  const patternMatch = scorePatternMatch(effectiveTags, winningDna, assetsWithMetrics);
  const hookQuality = scoreHookQuality(input.hookType, effectiveTags, signals, trackedAssets);
  const formatSignal = scoreFormatSignal(input.format, signals, trackedAssets);
  const dataConfidence = scoreDataConfidence(tier, trackedAssets, effectiveTags, assetsWithMetrics);
  const novelty = scoreNovelty(effectiveTags, input.format, trackedAssets);

  const total = Math.min(100, Math.max(0,
    patternMatch.score + hookQuality.score + formatSignal.score +
    dataConfidence.score + novelty.score
  ));

  const confidence: 'low' | 'moderate' | 'high' =
    tier === 3 ? 'high' : tier === 2 ? 'moderate' : 'low';

  // Predicted ROAS range (tier 3 only)
  let predictedRoasRange: CreativeScore['predictedRoasRange'];
  if (tier === 3) {
    predictedRoasRange = await computePredictedRoas(input.format, effectiveTags, assetsWithMetrics, input.userId);
  }

  const warnings = [
    ...patternMatch.warnings,
    ...hookQuality.warnings,
    ...formatSignal.warnings,
    ...dataConfidence.warnings,
    ...novelty.warnings,
  ];

  const matchedPatterns = patternMatch.matchedPatterns;
  const topInsight = deriveTopInsight(total, confidence, patternMatch, hookQuality, novelty);

  return {
    total,
    dimensions: {
      patternMatch: { score: patternMatch.score, label: 'Pattern Match', detail: patternMatch.detail },
      hookQuality: { score: hookQuality.score, label: 'Hook Quality', detail: hookQuality.detail },
      formatSignal: { score: formatSignal.score, label: 'Format Signal', detail: formatSignal.detail },
      dataConfidence: { score: dataConfidence.score, label: 'Data Confidence', detail: dataConfidence.detail },
      novelty: { score: novelty.score, label: 'Novelty', detail: novelty.detail },
    },
    confidence,
    predictedRoasRange,
    matchedPatterns,
    warnings,
    topInsight,
  };
}
