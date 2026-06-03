/**
 * Quality Gate — Main quality gate functions (insight/decision checks & filters)
 */

import { logger } from '../../utils/logger.js';
import {
  hasAdequateDepth,
  hasExcessiveVagueWords,
  hasGenericPhrases,
  hasObviousPatternWithoutSynthesis,
  hasSynthesis,
  isSpecific,
} from './checks.js';
import { DEFAULT_CONFIG } from './constants.js';
import { resolveContradictions } from './contradictions.js';
import { checkEvidenceQuality, verifyClaims } from './evidence.js';
import type {
  DecisionInput,
  Evidence,
  InsightInput,
  QualityCheckResult,
  QualityGateConfig,
} from './types.js';

/**
 * Check a single insight for quality
 */
export function checkInsightQuality(
  insight: InsightInput,
  config: Partial<QualityGateConfig> = {},
): QualityCheckResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const reasons: string[] = [];
  let totalScore = 0;
  let checks = 0;

  // 1. Obvious pattern check
  const obvious = hasObviousPatternWithoutSynthesis(insight.text);
  if (obvious.isObvious && !cfg.allowObvious) {
    reasons.push(`Contains obvious pattern without synthesis: ${obvious.pattern}`);
    totalScore += 20;
  } else {
    totalScore += 80;
  }
  checks++;

  // 2. Generic phrases check
  const generic = hasGenericPhrases(insight.text);
  if (generic.hasGeneric) {
    reasons.push(`Contains generic phrases: ${generic.phrases.slice(0, 2).join(', ')}`);
    totalScore += 30;
  } else {
    totalScore += 90;
  }
  checks++;

  // 3. Vague words check
  const vague = hasExcessiveVagueWords(insight.text);
  if (vague.isVague) {
    reasons.push(`Too many vague words: ${vague.words.slice(0, 3).join(', ')}`);
    totalScore += 40;
  } else {
    totalScore += 90;
  }
  checks++;

  // 4. Synthesis check
  const synthesis = hasSynthesis(insight.text, insight.basedOn);
  if (cfg.requireSynthesis && !synthesis.hasSynthesis) {
    reasons.push('Does not synthesize multiple signals');
    totalScore += synthesis.score;
  } else {
    totalScore += synthesis.score || 80;
  }
  checks++;

  // 5. Specificity check
  const specific = isSpecific(insight.text);
  totalScore += specific.score;
  if (!specific.isSpecific) {
    reasons.push('Not specific enough (missing numbers, actions, or targets)');
  }
  checks++;

  // 6. Depth check
  const depth = hasAdequateDepth(insight.text);
  totalScore += depth.score;
  if (!depth.hasDepth) {
    reasons.push('Too brief for strategic insight');
  }
  checks++;

  // 7. Evidence quality check (NEW - production hardening)
  const evidenceCheck = checkEvidenceQuality(insight.evidence);
  totalScore += evidenceCheck.score;
  checks++;

  if (evidenceCheck.quality === 'none') {
    reasons.push('No evidence provided — claims cannot be verified');
  } else if (evidenceCheck.quality === 'weak') {
    reasons.push(`Weak evidence: ${evidenceCheck.issues.slice(0, 2).join('; ')}`);
  }
  evidenceCheck.issues.forEach(issue => {
    if (!reasons.includes(issue)) reasons.push(issue);
  });

  // 8. Claim verification check (NEW - hallucination detection)
  const claimCheck = verifyClaims(insight.text, insight.evidence);
  if (claimCheck.contradicted.length > 0) {
    reasons.push(`Contradicted claims: ${claimCheck.contradicted.slice(0, 2).join('; ')}`);
    totalScore -= 20; // Penalty for contradictions
  }
  if (claimCheck.unverified.length > 2) {
    reasons.push(`Multiple unverified claims (${claimCheck.unverified.length})`);
  }

  // Calculate final score
  const finalScore = Math.max(0, Math.round(totalScore / checks));
  const passes = finalScore >= cfg.minScore && (cfg.allowObvious || !obvious.isObvious);

  // Determine if human review needed
  const requiresHumanReview =
    evidenceCheck.confidence < 0.6 ||
    claimCheck.contradicted.length > 0 ||
    (claimCheck.unverified.length > 0 && evidenceCheck.quality !== 'strong');

  return {
    passes,
    score: finalScore,
    reasons,
    filtered: passes ? undefined : `Score ${finalScore} < min ${cfg.minScore}`,
    confidence: evidenceCheck.confidence,
    confidenceFactors: evidenceCheck.factors,
    evidenceQuality: evidenceCheck.quality,
    requiresHumanReview,
  };
}

/**
 * Check a decision for quality
 */
export function checkDecisionQuality(
  decision: DecisionInput,
  config: Partial<QualityGateConfig> = {},
): QualityCheckResult {
  // Decisions are checked via their reasoning + evidence
  const insightResult = checkInsightQuality(
    {
      text: decision.reasoning,
      basedOn: decision.basedOn,
      evidence: decision.evidence, // Pass evidence through
    },
    config,
  );

  // Additional decision-specific checks
  const additionalReasons: string[] = [];

  // Check if action is specific
  const validActions = ['pause', 'reduce_budget', 'increase_budget', 'new_creative', 'monitor', 'test', 'scale', 'cut'];
  const hasValidAction = validActions.some(a => decision.suggestedAction.toLowerCase().includes(a));
  if (!hasValidAction) {
    additionalReasons.push('Suggested action is not specific');
  }

  // Check if target is named
  if (!decision.targetName || decision.targetName === 'Unknown' || decision.targetName.length < 3) {
    additionalReasons.push('Target is not specifically named');
  }

  // Decision-specific evidence check: must have at least 1 evidence item
  if (!decision.evidence || decision.evidence.length === 0) {
    additionalReasons.push('Decision has no evidence — cannot verify recommendation');
  } else {
    // Check if evidence supports the suggested action
    const evidenceSupportsAction = decision.evidence.some(e => {
      // For pause/cut actions, we expect negative trends
      if (['pause', 'cut', 'reduce_budget'].some(a => decision.suggestedAction.toLowerCase().includes(a))) {
        return (e.changePercent && e.changePercent < -10) ||
               (e.metric.toLowerCase().includes('cpa') && e.changePercent && e.changePercent > 20);
      }
      // For scale actions, we expect positive trends
      if (['scale', 'increase_budget'].some(a => decision.suggestedAction.toLowerCase().includes(a))) {
        return (e.changePercent && e.changePercent > 10) ||
               (e.metric.toLowerCase().includes('roas') && e.currentValue > 2);
      }
      return true;
    });

    if (!evidenceSupportsAction) {
      additionalReasons.push('Evidence does not clearly support the suggested action');
    }
  }

  // Adjust score based on decision-specific checks
  let adjustedScore = insightResult.score;
  if (additionalReasons.length > 0) {
    adjustedScore = Math.max(adjustedScore - (additionalReasons.length * 10), 0);
  }

  // Decisions with contradicted claims should never pass
  const hasContradictions = insightResult.reasons.some(r => r.includes('Contradicted'));

  return {
    passes: insightResult.passes && additionalReasons.length === 0 && !hasContradictions,
    score: adjustedScore,
    reasons: [...insightResult.reasons, ...additionalReasons],
    filtered: insightResult.filtered,
    confidence: insightResult.confidence,
    confidenceFactors: insightResult.confidenceFactors,
    evidenceQuality: insightResult.evidenceQuality,
    requiresHumanReview: insightResult.requiresHumanReview || hasContradictions,
  };
}

/**
 * Filter an array of insights, keeping only those that pass quality gate
 */
export function filterInsights<T extends { reasoning?: string; text?: string; insight?: string; evidence?: Evidence[] }>(
  items: T[],
  config: Partial<QualityGateConfig> = {},
): {
  passed: T[];
  filtered: T[];
  stats: { total: number; passed: number; filtered: number };
  requiresHumanReview: T[];
} {
  const passed: T[] = [];
  const filtered: T[] = [];
  const requiresHumanReview: T[] = [];

  for (const item of items) {
    const text = item.reasoning || item.text || item.insight || '';
    const result = checkInsightQuality({ text, evidence: item.evidence }, config);

    if (result.passes) {
      passed.push(item);
      if (result.requiresHumanReview) {
        requiresHumanReview.push(item);
      }
    } else {
      filtered.push(item);
      logger.debug({
        text: text.slice(0, 100),
        reasons: result.reasons,
        evidenceQuality: result.evidenceQuality,
        confidence: result.confidence,
      }, '[QualityGate] Filtered insight');
    }
  }

  return {
    passed,
    filtered,
    stats: {
      total: items.length,
      passed: passed.length,
      filtered: filtered.length,
    },
    requiresHumanReview,
  };
}

/**
 * Filter decisions, keeping only strategic ones
 * Also detects and resolves contradictions
 */
export function filterDecisions<T extends DecisionInput>(
  decisions: T[],
  config: Partial<QualityGateConfig> = {},
): {
  passed: T[];
  filtered: T[];
  stats: { total: number; passed: number; filtered: number; contradictions: number };
  contradictions?: string[];
  requiresHumanReview: T[];
} {
  // First, detect and resolve contradictions
  const contradictionResult = resolveContradictions(decisions);
  const decisionsToCheck = contradictionResult.resolved as T[];

  const passed: T[] = [];
  const filtered: T[] = [...(contradictionResult.dropped as T[])];
  const requiresHumanReview: T[] = [];

  for (const decision of decisionsToCheck) {
    const result = checkDecisionQuality(decision, config);

    if (result.passes) {
      passed.push(decision);
      if (result.requiresHumanReview) {
        requiresHumanReview.push(decision);
      }
    } else {
      filtered.push(decision);
      logger.debug({
        type: decision.type,
        target: decision.targetName,
        score: result.score,
        reasons: result.reasons,
        evidenceQuality: result.evidenceQuality,
        confidence: result.confidence,
      }, '[QualityGate] Filtered decision');
    }
  }

  if (contradictionResult.conflicts.length > 0) {
    logger.warn({
      conflicts: contradictionResult.conflicts,
      dropped: contradictionResult.dropped.length,
    }, '[QualityGate] Resolved contradictions');
  }

  return {
    passed,
    filtered,
    stats: {
      total: decisions.length,
      passed: passed.length,
      filtered: filtered.length,
      contradictions: contradictionResult.conflicts.length,
    },
    contradictions: contradictionResult.conflicts.length > 0 ? contradictionResult.conflicts : undefined,
    requiresHumanReview,
  };
}
