/* ------------------------------------------------------------------ */
/*  5-dimension scoring functions                                      */
/* ------------------------------------------------------------------ */

import { getPlatformSignals } from '../platform-signals.js';
import type { CreativeScoreInput, DimensionResult, WinningDna } from './types.js';

/* ------------------------------------------------------------------ */
/*  Dimension 1: Pattern Match (0-20)                                  */
/* ------------------------------------------------------------------ */

export function scorePatternMatch(
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

export function scoreHookQuality(
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

export function scoreFormatSignal(
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

export function scoreDataConfidence(
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

export function scoreNovelty(
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
