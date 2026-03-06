/* ------------------------------------------------------------------ */
/*  Plan-Stage Scoring Engine                                          */
/*  Scores plan items BEFORE script generation — zero Claude calls.    */
/*  Uses platform signals + account data to predict win probability.   */
/*  Items below threshold are auto-removed, saving token costs.        */
/* ------------------------------------------------------------------ */

import {
  PlatformSignalConfig,
  getPlatformSignals,
} from './platform-signals.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PlanItem {
  format: string;
  count: number;
  rationale: string;
  estimated_cost_cents: number;
  source_ads: { name: string; roas: number }[];
}

interface ScoredPlanItem extends PlanItem {
  winProbability: number;       // 0-100
  scoreBreakdown: {
    formatSignal: number;       // 0-25: platform format multiplier
    dataBackingSignal: number;  // 0-25: how well-backed by account data
    diversitySignal: number;    // 0-25: uniqueness within sprint
    complianceSignal: number;   // 0-25: platform best-practice compliance
  };
  warnings: string[];
}

interface AccountSnapshot {
  topAds: {
    id: string; name: string; spend: number; roas: number; ctr: number;
    cpa: number; impressions: number; conversions: number; format: string;
    thumbnail_url: string; days_active: number;
  }[];
  benchmarks: {
    avgRoas: number; avgCtr: number; avgCpa: number;
    avgSpend: number; totalSpend: number;
  };
  formatBreakdown: Record<string, { count: number; avgRoas: number; totalSpend: number }>;
  fatigueSignals: string[];
}

interface ActiveAd {
  format: string;
  hook_type?: string;
  days_active: number;
  dna_tags?: { hook: string[]; visual: string[]; audio: string[] };
}

interface ScoringResult {
  scored: ScoredPlanItem[];
  removed: ScoredPlanItem[];
  summary: {
    totalBefore: number;
    totalAfter: number;
    removedCount: number;
    avgWinProbability: number;
    savedTokenEstimate: number;  // rough estimate of tokens NOT spent
  };
}

/* ------------------------------------------------------------------ */
/*  Main scoring function                                              */
/* ------------------------------------------------------------------ */

export function scorePlanItems(
  items: PlanItem[],
  snapshot: AccountSnapshot,
  platform: string = 'meta',
  activeAds: ActiveAd[] = [],
  threshold: number = 70,
): ScoringResult {
  const signals = getPlatformSignals(platform);

  // Build sprint-level context for diversity scoring
  const formatCounts = new Map<string, number>();
  for (const item of items) {
    formatCounts.set(item.format, (formatCounts.get(item.format) || 0) + item.count);
  }
  const totalCreatives = items.reduce((s, i) => s + i.count, 0);
  const uniqueFormats = formatCounts.size;

  // Score each item
  const scored: ScoredPlanItem[] = items.map((item, idx) => {
    const formatScore = scoreFormat(item, signals, snapshot);
    const dataScore = scoreDataBacking(item, snapshot);
    const diversityScore = scoreDiversity(item, items, idx, signals, activeAds, formatCounts, uniqueFormats);
    const complianceScore = scoreCompliance(item, signals, snapshot);

    const winProbability = Math.round(
      formatScore.score + dataScore.score + diversityScore.score + complianceScore.score
    );

    return {
      ...item,
      winProbability: Math.min(100, Math.max(0, winProbability)),
      scoreBreakdown: {
        formatSignal: Math.round(formatScore.score),
        dataBackingSignal: Math.round(dataScore.score),
        diversitySignal: Math.round(diversityScore.score),
        complianceSignal: Math.round(complianceScore.score),
      },
      warnings: [
        ...formatScore.warnings,
        ...dataScore.warnings,
        ...diversityScore.warnings,
        ...complianceScore.warnings,
      ],
    };
  });

  // Split by threshold
  const passing = scored.filter(s => s.winProbability >= threshold);
  const removed = scored.filter(s => s.winProbability < threshold);

  // Estimate tokens saved (rough: ~1500 tokens per script generation)
  const removedCreatives = removed.reduce((s, i) => s + i.count, 0);
  const savedTokenEstimate = removedCreatives * 1500;

  const avgWin = passing.length > 0
    ? Math.round(passing.reduce((s, i) => s + i.winProbability, 0) / passing.length)
    : 0;

  return {
    scored: passing,
    removed,
    summary: {
      totalBefore: items.length,
      totalAfter: passing.length,
      removedCount: removed.length,
      avgWinProbability: avgWin,
      savedTokenEstimate,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Signal 1: Format (0-25 pts)                                        */
/*  How well does the platform algorithm reward this format?            */
/* ------------------------------------------------------------------ */

function scoreFormat(
  item: PlanItem,
  signals: PlatformSignalConfig,
  snapshot: AccountSnapshot,
): { score: number; warnings: string[] } {
  const warnings: string[] = [];

  // Base: platform format multiplier (1.0 = neutral = 15pts, 1.4 = max = 25pts)
  const multiplier = signals.formatMultipliers[item.format] ?? 1.0;
  // Scale: 0.5 → 5pts, 1.0 → 15pts, 1.3 → 22pts, 1.4 → 25pts
  const baseScore = Math.min(25, Math.max(0, (multiplier - 0.3) * (25 / 1.1)));

  // Bonus: format has proven account data
  const formatData = snapshot.formatBreakdown[item.format];
  let dataBonus = 0;
  if (formatData && formatData.avgRoas > snapshot.benchmarks.avgRoas) {
    dataBonus = 3; // format beats account average
  }

  // Penalty: format explicitly penalized on platform
  if (multiplier < 0.8) {
    warnings.push(`${item.format} has low platform preference (${multiplier}x multiplier)`);
  }

  return { score: Math.min(25, baseScore + dataBonus), warnings };
}

/* ------------------------------------------------------------------ */
/*  Signal 2: Data Backing (0-25 pts)                                  */
/*  Is this plan item grounded in real performance data?                */
/* ------------------------------------------------------------------ */

function scoreDataBacking(
  item: PlanItem,
  snapshot: AccountSnapshot,
): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  let score = 0;

  // Has source ads referenced? (0-10 pts)
  const sourceAdCount = item.source_ads?.length || 0;
  if (sourceAdCount >= 3) score += 10;
  else if (sourceAdCount >= 1) score += 6;
  else {
    score += 2; // Some formats don't need source ads (experimental)
    warnings.push(`${item.format}: no source ad data — experimental pick`);
  }

  // Source ads are actually good performers? (0-10 pts)
  if (sourceAdCount > 0) {
    const avgSourceRoas = item.source_ads.reduce((s, a) => s + a.roas, 0) / sourceAdCount;
    if (avgSourceRoas > snapshot.benchmarks.avgRoas * 1.5) {
      score += 10; // Source ads are well above average
    } else if (avgSourceRoas > snapshot.benchmarks.avgRoas) {
      score += 7; // Above average
    } else {
      score += 3; // Below average — risky basis
      warnings.push(`Source ads for ${item.format} are below account avg ROAS`);
    }
  }

  // Account has format-specific data? (0-5 pts)
  const formatData = snapshot.formatBreakdown[item.format];
  if (formatData && formatData.count >= 3) {
    score += 5; // Strong format history
  } else if (formatData && formatData.count >= 1) {
    score += 3; // Some history
  } else {
    score += 1; // No history — gap fill
  }

  return { score: Math.min(25, score), warnings };
}

/* ------------------------------------------------------------------ */
/*  Signal 3: Diversity (0-25 pts)                                     */
/*  How much does this item add to the sprint's creative diversity?     */
/* ------------------------------------------------------------------ */

function scoreDiversity(
  item: PlanItem,
  allItems: PlanItem[],
  itemIndex: number,
  signals: PlatformSignalConfig,
  activeAds: ActiveAd[],
  formatCounts: Map<string, number>,
  uniqueFormats: number,
): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  let score = 0;

  // Format diversity within sprint (0-10 pts)
  const formatShare = (formatCounts.get(item.format) || 0) /
    allItems.reduce((s, i) => s + i.count, 0);

  if (formatShare <= 0.2) {
    score += 10; // Good diversity — this format is <=20% of sprint
  } else if (formatShare <= 0.4) {
    score += 7;
  } else {
    score += 3;
    warnings.push(`${item.format} is ${Math.round(formatShare * 100)}% of sprint — concentration risk`);
  }

  // Not duplicating active ads (0-10 pts)
  const activeOfSameFormat = activeAds.filter(a => a.format === item.format);
  if (activeOfSameFormat.length === 0) {
    score += 10; // Fresh format, not competing with actives
  } else {
    // Check fatigue
    const avgDaysActive = activeOfSameFormat.reduce((s, a) => s + a.days_active, 0) / activeOfSameFormat.length;
    if (avgDaysActive > signals.quality.fatigueWindowDays * 0.7) {
      score += 8; // Active ads are fatiguing — replacement needed
    } else {
      score += 4; // Active ads still fresh — less urgent
      warnings.push(`${activeOfSameFormat.length} active ${item.format} ads still performing`);
    }
  }

  // Sprint meets minimum diversity requirements (0-5 pts)
  if (uniqueFormats >= signals.diversity.minUniqueFormats) {
    score += 5;
  } else {
    score += 2;
    warnings.push(`Sprint has ${uniqueFormats} formats — platform wants ${signals.diversity.minUniqueFormats}+`);
  }

  return { score: Math.min(25, score), warnings };
}

/* ------------------------------------------------------------------ */
/*  Signal 4: Platform Compliance (0-25 pts)                           */
/*  Does this item align with platform best practices?                 */
/* ------------------------------------------------------------------ */

function scoreCompliance(
  item: PlanItem,
  signals: PlatformSignalConfig,
  snapshot: AccountSnapshot,
): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  let score = 0;

  // Volume compliance (0-8 pts)
  if (item.count >= 2 && item.count <= 10) {
    score += 8; // Sweet spot — enough to test, not wasteful
  } else if (item.count === 1) {
    score += 5; // Single creative — harder to A/B test
    warnings.push(`Only 1 ${item.format} — consider 2+ for A/B testing`);
  } else if (item.count > 15) {
    score += 4; // Diminishing returns
    warnings.push(`${item.count} ${item.format} creatives may hit diminishing returns`);
  } else {
    score += 6;
  }

  // Format-narrative alignment (0-9 pts)
  // Certain formats naturally support platform-rewarded narratives
  const formatNarrativeMap: Record<string, string[]> = {
    ugc_talking_head: ['problem-solution', 'transformation-story', 'social-proof-stack'],
    podcast_clip: ['education-value', 'social-proof-stack'],
    skit: ['problem-solution', 'transformation-story', 'storytelling'],
    product_demo: ['benefit-feature-proof', 'how-to-guide'],
    testimonial_mashup: ['social-proof-stack', 'transformation-story'],
    before_after: ['transformation-story', 'problem-solution'],
    static_ad: ['aspiration-gap', 'comparison'],
    carousel: ['education-value', 'how-to-guide', 'benefit-feature-proof'],
    remake_winner: [], // inherits from original
    localization: [],  // inherits from original
  };

  const supportedNarratives = formatNarrativeMap[item.format] || [];
  const rewardedNarratives = signals.narrative.rewardedStructures;
  const overlap = supportedNarratives.filter(n => rewardedNarratives.includes(n));

  if (overlap.length >= 2) {
    score += 9; // Strong narrative alignment
  } else if (overlap.length === 1) {
    score += 6;
  } else if (item.format === 'remake_winner' || item.format === 'localization') {
    score += 7; // Exempt — these inherit narrative from source
  } else {
    score += 3;
    warnings.push(`${item.format} doesn't align well with ${signals.name}'s rewarded narratives`);
  }

  // Audio/visual signal alignment (0-8 pts)
  const isUGCFormat = ['ugc_talking_head', 'podcast_clip', 'testimonial_mashup'].includes(item.format);
  const ugcBonus = signals.audioVisual.ugcStyleBonus;

  if (isUGCFormat && ugcBonus >= 0.15) {
    score += 8; // UGC format on UGC-loving platform
  } else if (isUGCFormat && ugcBonus >= 0.05) {
    score += 5; // UGC format, moderate platform preference
  } else if (!isUGCFormat) {
    // Non-UGC formats — check if platform penalizes polish
    const isPolished = ['product_demo', 'static_ad', 'carousel'].includes(item.format);
    if (isPolished && signals.audioVisual.nativeStyleBonus >= 0.15) {
      score += 3; // Polished format on native-preferring platform
      warnings.push(`${signals.name} prefers native-looking content — ${item.format} may feel too polished`);
    } else {
      score += 6; // Neutral
    }
  } else {
    score += 4;
  }

  return { score: Math.min(25, score), warnings };
}

/* ------------------------------------------------------------------ */
/*  Utility: Adjust plan item counts based on scores                   */
/*  High-scoring items get count boost, low-scoring get reduced        */
/* ------------------------------------------------------------------ */

export function optimizeCounts(
  scored: ScoredPlanItem[],
  targetTotal: number,
  budgetCents: number,
): ScoredPlanItem[] {
  if (scored.length === 0) return scored;

  // Weight by win probability
  const totalWeight = scored.reduce((s, i) => s + i.winProbability, 0);
  if (totalWeight === 0) return scored;

  // Redistribute counts proportional to win probability
  const optimized = scored.map(item => {
    const weight = item.winProbability / totalWeight;
    const idealCount = Math.round(targetTotal * weight);
    const newCount = Math.max(1, Math.min(idealCount, item.count * 2)); // Don't more than double

    const unitCost = item.count > 0 ? item.estimated_cost_cents / item.count : 0;
    return {
      ...item,
      count: newCount,
      estimated_cost_cents: newCount * unitCost,
    };
  });

  // Enforce budget
  let totalCost = optimized.reduce((s, i) => s + i.estimated_cost_cents, 0);
  if (totalCost > budgetCents) {
    // Scale down proportionally
    const scale = budgetCents / totalCost;
    for (const item of optimized) {
      item.count = Math.max(1, Math.round(item.count * scale));
      const unitCost = item.estimated_cost_cents / (item.count || 1);
      item.estimated_cost_cents = item.count * unitCost;
    }
  }

  return optimized;
}
