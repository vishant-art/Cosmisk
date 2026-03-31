/* ------------------------------------------------------------------ */
/*  Creative Performance Scorer                                        */
/*  5-dimension algorithmic scorer — zero Claude calls.                */
/*  "Every ad you make, makes your next ad better."                    */
/* ------------------------------------------------------------------ */

import { getDb } from '../db/index.js';
import { CREATIVE_PATTERNS } from './creative-patterns.js';
import { getPlatformSignals } from './platform-signals.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CreativeScoreInput {
  userId: string;
  format: string;            // scripts | static | carousel | video
  hookType?: string;         // e.g. "Pattern Interrupt", "Curiosity Gap"
  dnaTags?: {
    hook?: string[];
    visual?: string[];
    audio?: string[];
    editing?: string[];
    text_overlay?: string[];
    color_mood?: string[];
    cta?: string[];
  };
  scriptText?: string;       // raw script content for pattern extraction
  platform?: string;         // default 'meta'
  metaAccountId?: string;
}

export interface ScoreDimension {
  score: number;             // 0-20
  label: string;
  detail: string;
}

export interface CreativeScore {
  total: number;             // 0-100
  dimensions: {
    patternMatch: ScoreDimension;
    hookQuality: ScoreDimension;
    formatSignal: ScoreDimension;
    dataConfidence: ScoreDimension;
    novelty: ScoreDimension;
  };
  confidence: 'low' | 'moderate' | 'high';
  predictedRoasRange?: { p25: number; p50: number; p75: number };
  matchedPatterns: string[];
  warnings: string[];
  topInsight: string;
}

/* ------------------------------------------------------------------ */
/*  Main scoring function                                              */
/* ------------------------------------------------------------------ */

export async function scoreCreative(input: CreativeScoreInput): Promise<CreativeScore> {
  const db = getDb();
  const platform = input.platform || 'meta';
  const signals = getPlatformSignals(platform);

  // Gather account context
  const dnaCacheRows = db.prepare(
    'SELECT hook, visual, audio FROM dna_cache WHERE account_id IN (SELECT account_id FROM creative_assets WHERE user_id = ? GROUP BY account_id)'
  ).all(input.userId) as Array<{ hook: string; visual: string; audio: string }>;

  const trackedAssets = db.prepare(
    'SELECT format, dna_tags, actual_metrics, predicted_score, status, published_at FROM creative_assets WHERE user_id = ?'
  ).all(input.userId) as Array<{
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
    predictedRoasRange = computePredictedRoas(input.format, effectiveTags, assetsWithMetrics, input.userId);
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

/* ------------------------------------------------------------------ */
/*  Helpers: DNA profile building                                      */
/* ------------------------------------------------------------------ */

interface WinningDna {
  hooks: Map<string, number>;   // pattern -> weighted count
  visuals: Map<string, number>;
  audio: Map<string, number>;
}

function buildWinningDnaProfile(
  dnaCacheRows: Array<{ hook: string; visual: string; audio: string }>,
  assetsWithMetrics: Array<{ dna_tags: string | null; actual_metrics: string | null }>,
): WinningDna {
  const hooks = new Map<string, number>();
  const visuals = new Map<string, number>();
  const audio = new Map<string, number>();

  // Weight DNA tags by ROAS of tracked assets
  for (const asset of assetsWithMetrics) {
    if (!asset.dna_tags) continue;
    try {
      const tags = JSON.parse(asset.dna_tags);
      const metrics = asset.actual_metrics ? JSON.parse(asset.actual_metrics) : {};
      const weight = metrics.roas ? Math.min(metrics.roas, 10) : 1; // cap weight at 10x

      for (const h of (tags.hook || [])) {
        hooks.set(h, (hooks.get(h) || 0) + weight);
      }
      for (const v of (tags.visual || [])) {
        visuals.set(v, (visuals.get(v) || 0) + weight);
      }
      for (const a of (tags.audio || [])) {
        audio.set(a, (audio.get(a) || 0) + weight);
      }
    } catch { /* skip malformed */ }
  }

  // Also include DNA cache entries (lower weight — no ROAS data)
  for (const row of dnaCacheRows) {
    try {
      for (const h of JSON.parse(row.hook)) hooks.set(h, (hooks.get(h) || 0) + 0.5);
      for (const v of JSON.parse(row.visual)) visuals.set(v, (visuals.get(v) || 0) + 0.5);
      for (const a of JSON.parse(row.audio)) audio.set(a, (audio.get(a) || 0) + 0.5);
    } catch { /* skip */ }
  }

  return { hooks, visuals, audio };
}

/* ------------------------------------------------------------------ */
/*  Infer DNA tags from script text                                    */
/* ------------------------------------------------------------------ */

function inferDnaTags(
  scriptText?: string,
  hookType?: string,
): CreativeScoreInput['dnaTags'] {
  const tags: CreativeScoreInput['dnaTags'] = {
    hook: [], visual: [], audio: [], editing: [],
    text_overlay: [], color_mood: [], cta: [],
  };

  if (!scriptText && !hookType) return tags;

  const text = (scriptText || '').toLowerCase();

  // Infer hooks
  if (hookType) {
    tags.hook = [hookType];
  } else {
    // Simple keyword matching against CREATIVE_PATTERNS.hook
    for (const pattern of CREATIVE_PATTERNS.hook) {
      const keywords = pattern.toLowerCase().split(/[\s/]+/);
      if (keywords.some(kw => kw.length > 3 && text.includes(kw))) {
        tags.hook!.push(pattern);
      }
    }
    if (tags.hook!.length === 0) tags.hook = ['Direct Interrogation']; // default
  }

  // Infer visual style from script directions
  if (text.includes('ugc') || text.includes('handheld') || text.includes('selfie')) {
    tags.visual!.push('UGC Handheld');
  }
  if (text.includes('talking head') || text.includes('face to camera')) {
    tags.visual!.push('Talking Head');
  }
  if (text.includes('product') && (text.includes('close') || text.includes('shot'))) {
    tags.visual!.push('Product Close-up');
  }
  if (text.includes('lifestyle') || text.includes('b-roll')) {
    tags.visual!.push('Lifestyle B-roll');
  }

  // Infer CTA style
  if (text.includes('shop now') || text.includes('buy now')) {
    tags.cta!.push('Shop Now Overlay');
  }
  if (text.includes('link') || text.includes('bio')) {
    tags.cta!.push('Link in Bio');
  }
  if (text.includes('limited') || text.includes('hurry') || text.includes('last chance')) {
    tags.cta!.push('Urgency Timer/Countdown');
  }

  return tags;
}

/* ------------------------------------------------------------------ */
/*  Dimension 1: Pattern Match (0-20)                                  */
/* ------------------------------------------------------------------ */

interface DimensionResult {
  score: number;
  detail: string;
  warnings: string[];
  matchedPatterns: string[];
}

function scorePatternMatch(
  tags: CreativeScoreInput['dnaTags'],
  winningDna: WinningDna,
  assetsWithMetrics: Array<{ dna_tags: string | null; actual_metrics: string | null }>,
): DimensionResult {
  const warnings: string[] = [];
  const matchedPatterns: string[] = [];

  if (winningDna.hooks.size === 0 && winningDna.visuals.size === 0) {
    return {
      score: 10, // neutral — no data to compare against
      detail: 'No historical DNA data yet. Score based on taxonomy defaults.',
      warnings: ['Connect Meta and run ads to improve pattern matching accuracy.'],
      matchedPatterns: [],
    };
  }

  // Weighted Jaccard similarity for each category
  const hookSim = weightedJaccard(tags?.hook || [], winningDna.hooks);
  const visualSim = weightedJaccard(tags?.visual || [], winningDna.visuals);
  const audioSim = weightedJaccard(tags?.audio || [], winningDna.audio);

  // Hooks matter most (50%), visual (35%), audio (15%)
  const similarity = hookSim * 0.5 + visualSim * 0.35 + audioSim * 0.15;

  // Track matched patterns
  for (const h of (tags?.hook || [])) {
    if (winningDna.hooks.has(h)) matchedPatterns.push(`Hook: ${h}`);
  }
  for (const v of (tags?.visual || [])) {
    if (winningDna.visuals.has(v)) matchedPatterns.push(`Visual: ${v}`);
  }

  const score = Math.round(similarity * 20);

  let detail: string;
  if (similarity >= 0.7) {
    detail = `Strong match with your winning DNA profile (${Math.round(similarity * 100)}% similarity).`;
  } else if (similarity >= 0.4) {
    detail = `Moderate match with winning patterns (${Math.round(similarity * 100)}%).`;
  } else {
    detail = `Low similarity to proven patterns (${Math.round(similarity * 100)}%).`;
    if (assetsWithMetrics.length > 3) {
      warnings.push('This creative diverges significantly from your proven DNA patterns.');
    }
  }

  return { score: Math.min(20, Math.max(0, score)), detail, warnings, matchedPatterns };
}

function weightedJaccard(inputTags: string[], profileMap: Map<string, number>): number {
  if (inputTags.length === 0 && profileMap.size === 0) return 0.5; // neutral
  if (inputTags.length === 0 || profileMap.size === 0) return 0.2;

  let intersectionWeight = 0;
  let unionWeight = 0;

  const allTags = new Set([...inputTags, ...profileMap.keys()]);
  for (const tag of allTags) {
    const inInput = inputTags.includes(tag) ? 1 : 0;
    const profileWeight = profileMap.get(tag) || 0;
    intersectionWeight += Math.min(inInput, profileWeight > 0 ? 1 : 0) * profileWeight;
    unionWeight += Math.max(inInput, profileWeight > 0 ? 1 : 0) * Math.max(profileWeight, 1);
  }

  return unionWeight > 0 ? intersectionWeight / unionWeight : 0.2;
}

/* ------------------------------------------------------------------ */
/*  Dimension 2: Hook Quality (0-20)                                   */
/* ------------------------------------------------------------------ */

function scoreHookQuality(
  hookType: string | undefined,
  tags: CreativeScoreInput['dnaTags'],
  signals: ReturnType<typeof getPlatformSignals>,
  trackedAssets: Array<{ format: string; dna_tags: string | null }>,
): Omit<DimensionResult, 'matchedPatterns'> & { matchedPatterns: never[] } {
  const warnings: string[] = [];
  const hooks = tags?.hook || (hookType ? [hookType] : []);

  if (hooks.length === 0) {
    return { score: 8, detail: 'No hook type detected. Using default score.', warnings: ['Add a clear hook to improve scoring.'], matchedPatterns: [] as never[] };
  }

  let score = 0;

  // Platform alignment (0-10)
  const rewarded = signals.hook.rewardedHookTypes;
  const penalized = signals.hook.penalizedHookTypes;

  let platformAligned = false;
  for (const h of hooks) {
    if (rewarded.some(r => h.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(h.toLowerCase()))) {
      score += 10;
      platformAligned = true;
      break;
    }
  }
  if (!platformAligned) {
    for (const h of hooks) {
      if (penalized.some(p => h.toLowerCase().includes(p.toLowerCase()))) {
        score += 3;
        warnings.push(`"${h}" hook type is penalized on ${signals.name}.`);
      }
    }
    if (score === 0) score += 6; // neutral
  }

  // Account history alignment (0-10)
  const hookHistory = new Map<string, number>();
  for (const asset of trackedAssets) {
    if (!asset.dna_tags) continue;
    try {
      const parsed = JSON.parse(asset.dna_tags);
      for (const h of (parsed.hook || [])) {
        hookHistory.set(h, (hookHistory.get(h) || 0) + 1);
      }
    } catch { /* skip */ }
  }

  if (hookHistory.size === 0) {
    score += 5; // neutral — no history
  } else {
    const matchesHistory = hooks.some(h => hookHistory.has(h));
    if (matchesHistory) {
      score += 8;
    } else {
      score += 4; // novel hook — not necessarily bad
    }
  }

  const detail = platformAligned
    ? `Hook aligns with ${signals.name}'s rewarded hook types.`
    : `Hook type is neutral for ${signals.name} algorithm.`;

  return { score: Math.min(20, score), detail, warnings, matchedPatterns: [] as never[] };
}

/* ------------------------------------------------------------------ */
/*  Dimension 3: Format Signal (0-20)                                  */
/*  Reuses plan-scorer logic for platform format multipliers           */
/* ------------------------------------------------------------------ */

function scoreFormatSignal(
  format: string,
  signals: ReturnType<typeof getPlatformSignals>,
  trackedAssets: Array<{ format: string; actual_metrics: string | null }>,
): Omit<DimensionResult, 'matchedPatterns'> & { matchedPatterns: never[] } {
  const warnings: string[] = [];

  // Map studio formats to platform format names
  const formatMap: Record<string, string> = {
    scripts: 'ugc_talking_head',
    static: 'static_ad',
    carousel: 'carousel',
    video: 'ugc_talking_head',
  };
  const platformFormat = formatMap[format] || format;

  // Platform multiplier (same logic as plan-scorer.ts scoreFormat)
  const multiplier = signals.formatMultipliers[platformFormat] ?? 1.0;
  // Scale: 0.5 -> 2pts, 1.0 -> 12pts, 1.3 -> 17pts, 1.4 -> 20pts
  const platformScore = Math.min(12, Math.max(0, (multiplier - 0.3) * (12 / 1.1)));

  // Account format performance (0-8)
  let accountScore = 4; // default neutral
  const formatAssets = trackedAssets.filter(a => a.format === platformFormat && a.actual_metrics);
  if (formatAssets.length >= 2) {
    const roasValues = formatAssets.map(a => {
      try { return JSON.parse(a.actual_metrics!).roas || 0; } catch { return 0; }
    }).filter(r => r > 0);

    if (roasValues.length >= 2) {
      const avgRoas = roasValues.reduce((s, r) => s + r, 0) / roasValues.length;
      if (avgRoas >= 3) accountScore = 8;
      else if (avgRoas >= 1.5) accountScore = 6;
      else accountScore = 3;
    }
  }

  if (multiplier < 0.8) {
    warnings.push(`${format} has low platform preference on ${signals.name}.`);
  }

  const detail = `${signals.name} gives ${platformFormat} a ${multiplier}x multiplier.`;

  return {
    score: Math.min(20, Math.round(platformScore + accountScore)),
    detail,
    warnings,
    matchedPatterns: [] as never[],
  };
}

/* ------------------------------------------------------------------ */
/*  Dimension 4: Data Confidence (0-20)                                */
/* ------------------------------------------------------------------ */

function scoreDataConfidence(
  tier: 1 | 2 | 3,
  trackedAssets: Array<{ format: string; dna_tags: string | null }>,
  tags: CreativeScoreInput['dnaTags'],
  assetsWithMetrics: Array<{ dna_tags: string | null; actual_metrics: string | null }>,
): Omit<DimensionResult, 'matchedPatterns'> & { matchedPatterns: never[] } {
  const warnings: string[] = [];

  // Tier base (0-8)
  const tierBase = tier === 3 ? 8 : tier === 2 ? 5 : 2;

  // Asset count backing (0-6)
  const totalTracked = trackedAssets.length;
  const assetScore = totalTracked >= 20 ? 6 : totalTracked >= 10 ? 5 : totalTracked >= 3 ? 3 : 1;

  // Pattern evidence (0-6): how many tracked assets share patterns with this creative
  let patternEvidence = 0;
  const inputHooks = new Set(tags?.hook || []);
  for (const asset of assetsWithMetrics) {
    if (!asset.dna_tags) continue;
    try {
      const parsed = JSON.parse(asset.dna_tags);
      const assetHooks = new Set(parsed.hook || []);
      const overlap = [...inputHooks].filter(h => assetHooks.has(h));
      if (overlap.length > 0) patternEvidence++;
    } catch { /* skip */ }
  }
  const evidenceScore = patternEvidence >= 5 ? 6 : patternEvidence >= 2 ? 4 : patternEvidence >= 1 ? 2 : 0;

  if (tier === 1) {
    warnings.push('Connect Meta to improve prediction accuracy.');
  }

  const tierLabel = tier === 3 ? 'High' : tier === 2 ? 'Moderate' : 'Low';
  const detail = `${tierLabel} confidence: ${totalTracked} tracked assets, ${assetsWithMetrics.length} with outcomes, ${patternEvidence} pattern matches.`;

  return {
    score: Math.min(20, tierBase + assetScore + evidenceScore),
    detail,
    warnings,
    matchedPatterns: [] as never[],
  };
}

/* ------------------------------------------------------------------ */
/*  Dimension 5: Novelty (0-20)                                        */
/* ------------------------------------------------------------------ */

function scoreNovelty(
  tags: CreativeScoreInput['dnaTags'],
  format: string,
  trackedAssets: Array<{ format: string; dna_tags: string | null; status: string; published_at: string | null }>,
): Omit<DimensionResult, 'matchedPatterns'> & { matchedPatterns: never[] } {
  const warnings: string[] = [];

  // Check active/published creatives for duplication
  const activeAssets = trackedAssets.filter(a =>
    a.status === 'published' || a.status === 'active'
  );

  if (activeAssets.length === 0) {
    return {
      score: 15, // fresh slate — slightly above neutral
      detail: 'No active creatives to compare against — high novelty by default.',
      warnings: [],
      matchedPatterns: [] as never[],
    };
  }

  // Calculate overlap with each active asset
  const inputSet = new Set([
    ...(tags?.hook || []),
    ...(tags?.visual || []),
    ...(tags?.cta || []),
  ]);

  let maxOverlapPct = 0;
  let duplicateCount = 0;

  for (const asset of activeAssets) {
    if (!asset.dna_tags) continue;
    try {
      const parsed = JSON.parse(asset.dna_tags);
      const assetSet = new Set([
        ...(parsed.hook || []),
        ...(parsed.visual || []),
        ...(parsed.cta || []),
      ]);

      const intersection = [...inputSet].filter(t => assetSet.has(t));
      const union = new Set([...inputSet, ...assetSet]);
      const overlapPct = union.size > 0 ? intersection.length / union.size : 0;

      if (overlapPct > maxOverlapPct) maxOverlapPct = overlapPct;
      if (overlapPct > 0.7) duplicateCount++;
    } catch { /* skip */ }
  }

  // Same format penalty
  const sameFormatActive = activeAssets.filter(a => a.format === format).length;
  const formatPenalty = sameFormatActive >= 3 ? 4 : sameFormatActive >= 1 ? 2 : 0;

  // Score: low overlap = high novelty
  let score: number;
  if (maxOverlapPct <= 0.2) {
    score = 18; // very novel
  } else if (maxOverlapPct <= 0.4) {
    score = 14;
  } else if (maxOverlapPct <= 0.6) {
    score = 10;
  } else {
    score = 6;
    warnings.push(`This creative overlaps ${Math.round(maxOverlapPct * 100)}% with an active ad.`);
  }

  score = Math.max(0, score - formatPenalty);

  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} active ad(s) have very similar DNA.`);
  }

  const detail = maxOverlapPct > 0
    ? `Max ${Math.round(maxOverlapPct * 100)}% overlap with active creatives. ${sameFormatActive} active ads in same format.`
    : 'Unique creative DNA compared to active ads.';

  return { score: Math.min(20, score), detail, warnings, matchedPatterns: [] as never[] };
}

/* ------------------------------------------------------------------ */
/*  Predicted ROAS range (Tier 3 only)                                 */
/* ------------------------------------------------------------------ */

function computePredictedRoas(
  format: string,
  tags: CreativeScoreInput['dnaTags'],
  assetsWithMetrics: Array<{ dna_tags: string | null; actual_metrics: string | null }>,
  userId: string,
): { p25: number; p50: number; p75: number } | undefined {
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
  const calibration = getCalibrationFactor(userId);

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

function getCalibrationFactor(userId: string): number {
  try {
    const db = getDb();
    const rows = db.prepare(
      'SELECT predicted_roas_mid, actual_roas FROM score_predictions WHERE user_id = ? AND actual_roas IS NOT NULL AND predicted_roas_mid IS NOT NULL ORDER BY resolved_at DESC LIMIT 50'
    ).all(userId) as Array<{ predicted_roas_mid: number; actual_roas: number }>;

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

function deriveTopInsight(
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

export function getAccuracyStats(userId: string): {
  totalPredictions: number;
  resolvedPredictions: number;
  meanAbsoluteError: number | null;
  accuracyByFormat: Record<string, { count: number; meanError: number }>;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
} {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) as c FROM score_predictions WHERE user_id = ?').get(userId) as { c: number }).c;
  const resolved = db.prepare(
    'SELECT * FROM score_predictions WHERE user_id = ? AND actual_roas IS NOT NULL'
  ).all(userId) as Array<{
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

export function resolveScorePredictions(): { resolved: number } {
  const db = getDb();

  // Find unresolved predictions linked to assets with actual metrics
  const unresolved = db.prepare(`
    SELECT sp.id, sp.predicted_score, sp.predicted_roas_mid, ca.actual_metrics
    FROM score_predictions sp
    JOIN creative_assets ca ON ca.user_id = sp.user_id
    WHERE sp.resolved_at IS NULL
      AND ca.actual_metrics IS NOT NULL
      AND ca.format = sp.format
      AND ca.created_at >= sp.created_at
    ORDER BY sp.created_at ASC
    LIMIT 100
  `).all() as Array<{
    id: string; predicted_score: number; predicted_roas_mid: number | null;
    actual_metrics: string;
  }>;

  let resolved = 0;
  const updateStmt = db.prepare(`
    UPDATE score_predictions
    SET actual_roas = ?, actual_ctr = ?, accuracy_error = ?, resolved_at = datetime('now')
    WHERE id = ?
  `);

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

      updateStmt.run(actualRoas, actualCtr, Math.round(error * 1000) / 1000, row.id);
      resolved++;
    } catch { /* skip malformed */ }
  }

  return { resolved };
}
