/**
 * Quality Gate — Cosmisk
 *
 * THE MANDATORY FILTER for all agent outputs.
 * Nothing reaches a client without passing through here.
 *
 * Core principle: "Would an experienced media buyer spending ₹30L+/month
 * already know this?" If yes, filter it out.
 *
 * Every output must:
 * 1. Synthesize 2+ signals (not just report one metric)
 * 2. Pass non-obviousness check
 * 3. Have strategic depth (explain WHY + WHAT TO DO)
 * 4. Be specific and actionable
 */

import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Evidence — The proof behind every recommendation.
 * No recommendation should exist without traceable evidence.
 */
export interface Evidence {
  metric: string;           // e.g., 'CPA', 'CTR', 'ROAS', 'OOS_count'
  currentValue: number;     // Current measured value
  comparisonValue?: number; // Previous value or threshold for comparison
  comparisonType?: 'threshold' | 'previous_period' | 'benchmark' | 'target';
  changePercent?: number;   // Calculated change (e.g., -40%)
  source: string;           // e.g., 'meta_insights_2024-05-09', 'shopify_inventory'
  timestamp: string;        // ISO timestamp of data
  accountId?: string;       // Which ad account
  entityId?: string;        // Campaign/adset/ad ID
  entityName?: string;      // Human-readable name
}

/**
 * Confidence factors that influence recommendation reliability
 */
export interface ConfidenceFactors {
  dataFreshness: number;      // 0-1: How recent is the evidence
  signalStrength: number;     // 0-1: How strong is the change
  corroboratingSignals: number; // 0-1: How many signals agree
  historicalAccuracy?: number;  // 0-1: Past prediction accuracy
}

export interface QualityCheckResult {
  passes: boolean;
  score: number; // 0-100
  reasons: string[];
  filtered?: string; // If filtered, why
  confidence?: number; // 0-1 confidence score
  confidenceFactors?: ConfidenceFactors;
  evidenceQuality?: 'strong' | 'moderate' | 'weak' | 'none';
  requiresHumanReview?: boolean;
}

export interface InsightInput {
  text: string;
  category?: string;
  basedOn?: string[]; // What signals contributed
  confidence?: number;
  evidence?: Evidence[]; // Required for production-grade insights
}

export interface DecisionInput {
  type: string;
  reasoning: string;
  suggestedAction: string;
  targetName: string;
  basedOn?: string[];
  evidence?: Evidence[]; // Required for production-grade decisions
  urgency?: string;
}

export interface QualityGateConfig {
  minScore: number; // 0-100, default 60
  requireSynthesis: boolean; // Must combine 2+ signals
  allowObvious: boolean; // If false, filter obvious insights
  strictMode: boolean; // If true, reject marginal cases
}

const DEFAULT_CONFIG: QualityGateConfig = {
  minScore: 60,
  requireSynthesis: true,
  allowObvious: false,
  strictMode: false,
};

// ============================================================================
// Obvious Pattern Detection
// ============================================================================

/**
 * Patterns that indicate "dashboard-level" observations
 * These are things any media buyer can see in Ads Manager
 */
const OBVIOUS_PATTERNS = [
  // Simple metric statements without WHY
  /^ctr\s+(has\s+)?(dropped|declined|decreased|increased)/i,
  /^cpa\s+(has\s+)?(increased|spiked|risen|dropped)/i,
  /^roas\s+(has\s+)?(dropped|declined|decreased|increased)/i,
  /^spend\s+(has\s+)?(increased|decreased)/i,
  /^frequency\s+(has\s+)?(increased|is\s+high)/i,
  /^impressions\s+(are\s+)?(down|up|declining)/i,
  /^conversions\s+(have\s+)?(dropped|declined)/i,

  // Generic observations
  /performance\s+(is\s+)?(declining|dropping|improving)/i,
  /campaign\s+(is\s+)?(underperforming|performing\s+poorly)/i,
  /below\s+breakeven/i,
  /above\s+target/i,
];

/**
 * Phrases that indicate generic/templated advice
 */
const GENERIC_PHRASES = [
  'consider testing',
  'you should try',
  'you might want to',
  'it might be worth',
  'generally speaking',
  'best practice',
  'typically',
  'we recommend',
  'consider exploring',
  'worth considering',
  'you may want to',
  'potentially',
  'could potentially',
  'it\'s possible that',
  'one option is to',
];

/**
 * Words that indicate vague/non-specific advice
 */
const VAGUE_WORDS = [
  'optimize',
  'leverage',
  'significant',
  'notable',
  'substantial',
  'considerable',
  'various',
  'several',
  'multiple',
  'numerous',
];

/**
 * Synthesis indicators — phrases that show multi-signal reasoning
 */
const SYNTHESIS_INDICATORS = [
  'because',
  'which means',
  'combined with',
  'while',
  'alongside',
  'in conjunction with',
  'at the same time',
  'correlates with',
  'suggests that',
  'indicates that',
  'when combined',
  'taken together',
  'this pattern',
  'historically',
  'based on',
];

// ============================================================================
// Evidence Validation Functions
// ============================================================================

/**
 * Check evidence quality — is the recommendation backed by verifiable data?
 */
function checkEvidenceQuality(evidence?: Evidence[]): {
  quality: 'strong' | 'moderate' | 'weak' | 'none';
  score: number;
  issues: string[];
  confidence: number;
  factors: ConfidenceFactors;
} {
  if (!evidence || evidence.length === 0) {
    return {
      quality: 'none',
      score: 0,
      issues: ['No evidence provided — recommendation cannot be verified'],
      confidence: 0.2,
      factors: { dataFreshness: 0, signalStrength: 0, corroboratingSignals: 0 },
    };
  }

  const issues: string[] = [];
  let totalFreshness = 0;
  let totalStrength = 0;

  for (const e of evidence) {
    // Check data freshness (within 24h = fresh, 7d = stale)
    const ageHours = (Date.now() - new Date(e.timestamp).getTime()) / (1000 * 60 * 60);
    if (ageHours > 168) { // > 7 days
      issues.push(`Stale evidence: ${e.metric} is ${Math.round(ageHours / 24)} days old`);
      totalFreshness += 0.3;
    } else if (ageHours > 24) {
      totalFreshness += 0.7;
    } else {
      totalFreshness += 1.0;
    }

    // Check signal strength (significant change vs noise)
    if (e.changePercent !== undefined) {
      const absChange = Math.abs(e.changePercent);
      if (absChange < 5) {
        issues.push(`Weak signal: ${e.metric} change of ${e.changePercent}% may be noise`);
        totalStrength += 0.3;
      } else if (absChange < 15) {
        totalStrength += 0.6;
      } else if (absChange < 30) {
        totalStrength += 0.8;
      } else {
        totalStrength += 1.0;
      }
    } else {
      totalStrength += 0.5; // Unknown strength
    }

    // Check for required fields
    if (!e.source) {
      issues.push(`Missing source for ${e.metric} evidence`);
    }
    if (!e.timestamp) {
      issues.push(`Missing timestamp for ${e.metric} evidence`);
    }
  }

  const avgFreshness = totalFreshness / evidence.length;
  const avgStrength = totalStrength / evidence.length;
  const corroboratingSignals = Math.min(evidence.length / 3, 1); // 3+ signals = 100%

  // Calculate overall confidence
  const confidence = (avgFreshness * 0.3) + (avgStrength * 0.4) + (corroboratingSignals * 0.3);

  // Determine quality tier
  let quality: 'strong' | 'moderate' | 'weak' | 'none';
  let score: number;

  if (evidence.length >= 2 && confidence >= 0.7 && issues.length === 0) {
    quality = 'strong';
    score = 90 + (confidence * 10);
  } else if (evidence.length >= 1 && confidence >= 0.5) {
    quality = 'moderate';
    score = 60 + (confidence * 30);
  } else if (evidence.length >= 1) {
    quality = 'weak';
    score = 30 + (confidence * 30);
  } else {
    quality = 'none';
    score = 10;
  }

  return {
    quality,
    score,
    issues,
    confidence,
    factors: {
      dataFreshness: avgFreshness,
      signalStrength: avgStrength,
      corroboratingSignals,
    },
  };
}

/**
 * Extract numeric claims from text for verification
 * e.g., "CTR dropped 40%" -> { metric: 'CTR', claim: 'dropped', value: 40, unit: '%' }
 */
export function extractNumericClaims(text: string): Array<{
  metric: string;
  claim: 'dropped' | 'increased' | 'is' | 'was';
  value: number;
  unit: string;
  originalText: string;
}> {
  const claims: Array<{
    metric: string;
    claim: 'dropped' | 'increased' | 'is' | 'was';
    value: number;
    unit: string;
    originalText: string;
  }> = [];

  // Pattern: "METRIC dropped/increased/is X%/X"
  const patterns = [
    /(\w+)\s+(dropped|decreased|declined|fell)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(%|percent|x|times)?/gi,
    /(\w+)\s+(increased|rose|grew|spiked)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*(%|percent|x|times)?/gi,
    /(\w+)\s+(?:is|was)\s+(\d+(?:\.\d+)?)\s*(%|percent|x|₹|\$)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const metric = match[1].toUpperCase();
      const claimWord = match[2]?.toLowerCase() || 'is';
      const value = parseFloat(match[3]);
      const unit = match[4] || '';

      let claim: 'dropped' | 'increased' | 'is' | 'was' = 'is';
      if (['dropped', 'decreased', 'declined', 'fell'].includes(claimWord)) {
        claim = 'dropped';
      } else if (['increased', 'rose', 'grew', 'spiked'].includes(claimWord)) {
        claim = 'increased';
      }

      claims.push({
        metric,
        claim,
        value,
        unit,
        originalText: match[0],
      });
    }
  }

  return claims;
}

/**
 * Verify claims against provided evidence
 * Returns which claims are verified, unverified, or contradicted
 */
export function verifyClaims(
  text: string,
  evidence?: Evidence[],
): {
  verified: string[];
  unverified: string[];
  contradicted: string[];
  verificationScore: number;
} {
  const claims = extractNumericClaims(text);
  const verified: string[] = [];
  const unverified: string[] = [];
  const contradicted: string[] = [];

  if (!evidence || evidence.length === 0) {
    // All claims are unverified without evidence
    return {
      verified: [],
      unverified: claims.map(c => c.originalText),
      contradicted: [],
      verificationScore: claims.length === 0 ? 1.0 : 0.0,
    };
  }

  for (const claim of claims) {
    // Find matching evidence
    const matchingEvidence = evidence.find(e =>
      e.metric.toUpperCase().includes(claim.metric) ||
      claim.metric.includes(e.metric.toUpperCase())
    );

    if (!matchingEvidence) {
      unverified.push(claim.originalText);
      continue;
    }

    // Check if claim matches evidence
    if (claim.claim === 'dropped' || claim.claim === 'increased') {
      // Verify direction and magnitude
      if (matchingEvidence.changePercent !== undefined) {
        const evidenceDirection = matchingEvidence.changePercent < 0 ? 'dropped' : 'increased';
        const evidenceMagnitude = Math.abs(matchingEvidence.changePercent);

        // Allow 20% tolerance in magnitude
        const magnitudeDiff = Math.abs(evidenceMagnitude - claim.value);
        const magnitudeMatch = magnitudeDiff <= claim.value * 0.2 || magnitudeDiff <= 5;

        if (evidenceDirection === claim.claim && magnitudeMatch) {
          verified.push(claim.originalText);
        } else if (evidenceDirection !== claim.claim) {
          contradicted.push(`${claim.originalText} (evidence shows ${matchingEvidence.changePercent}%)`);
        } else {
          unverified.push(`${claim.originalText} (evidence shows ${matchingEvidence.changePercent}%)`);
        }
      } else {
        unverified.push(claim.originalText);
      }
    } else {
      // 'is' or 'was' claim — check value match
      const evidenceValue = matchingEvidence.currentValue;
      const valueDiff = Math.abs(evidenceValue - claim.value);
      const valueMatch = valueDiff <= claim.value * 0.1 || valueDiff <= 1;

      if (valueMatch) {
        verified.push(claim.originalText);
      } else {
        unverified.push(`${claim.originalText} (evidence shows ${evidenceValue})`);
      }
    }
  }

  // Calculate verification score
  const totalClaims = claims.length;
  if (totalClaims === 0) {
    return { verified, unverified, contradicted, verificationScore: 1.0 };
  }

  const verificationScore =
    (verified.length * 1.0 + unverified.length * 0.3 - contradicted.length * 0.5) / totalClaims;

  return {
    verified,
    unverified,
    contradicted,
    verificationScore: Math.max(0, Math.min(1, verificationScore)),
  };
}

// ============================================================================
// Core Quality Check Functions
// ============================================================================

/**
 * Check if text contains obvious patterns without synthesis
 */
function hasObviousPatternWithoutSynthesis(text: string): { isObvious: boolean; pattern?: string } {
  const lowerText = text.toLowerCase();

  // Check for obvious patterns
  for (const pattern of OBVIOUS_PATTERNS) {
    if (pattern.test(text)) {
      // But allow if there's synthesis
      const hasSynthesis = SYNTHESIS_INDICATORS.some(ind => lowerText.includes(ind));
      if (!hasSynthesis) {
        return { isObvious: true, pattern: pattern.source };
      }
    }
  }

  return { isObvious: false };
}

/**
 * Check if text contains generic phrases
 */
function hasGenericPhrases(text: string): { hasGeneric: boolean; phrases: string[] } {
  const lowerText = text.toLowerCase();
  const found: string[] = [];

  for (const phrase of GENERIC_PHRASES) {
    if (lowerText.includes(phrase)) {
      found.push(phrase);
    }
  }

  return { hasGeneric: found.length > 0, phrases: found };
}

/**
 * Check if text uses vague words excessively
 */
function hasExcessiveVagueWords(text: string): { isVague: boolean; words: string[] } {
  const lowerText = text.toLowerCase();
  const found: string[] = [];

  for (const word of VAGUE_WORDS) {
    if (lowerText.includes(word)) {
      found.push(word);
    }
  }

  // More than 2 vague words = too vague
  return { isVague: found.length > 2, words: found };
}

/**
 * Check if text has synthesis (combines multiple signals)
 */
function hasSynthesis(text: string, basedOn?: string[]): { hasSynthesis: boolean; score: number } {
  // If basedOn is provided and has 2+ signals, that's explicit synthesis
  if (basedOn && basedOn.length >= 2) {
    return { hasSynthesis: true, score: 100 };
  }

  // Check for synthesis indicators in text
  const lowerText = text.toLowerCase();
  let indicatorCount = 0;

  for (const indicator of SYNTHESIS_INDICATORS) {
    if (lowerText.includes(indicator)) {
      indicatorCount++;
    }
  }

  // Score based on indicators found
  const score = Math.min(indicatorCount * 30, 100);
  return { hasSynthesis: indicatorCount >= 1, score };
}

/**
 * Check if text is specific (has numbers, names, concrete actions)
 */
function isSpecific(text: string): { isSpecific: boolean; score: number } {
  const checks = {
    hasNumbers: /\d+/.test(text),
    hasPercentages: /%|percent/i.test(text),
    hasCurrency: /₹|\$|rs\.?|inr/i.test(text),
    hasTimeframe: /day|week|month|hour|48\s*h|72\s*h/i.test(text),
    hasConcreteAction: /pause|scale|increase|decrease|test|launch|cut|shift|reallocate/i.test(text),
    hasSpecificTarget: /"[^"]+"/.test(text), // Quoted names
  };

  const trueCount = Object.values(checks).filter(Boolean).length;
  const score = (trueCount / 6) * 100;

  return { isSpecific: trueCount >= 2, score };
}

/**
 * Check text length — too short usually means not strategic
 */
function hasAdequateDepth(text: string): { hasDepth: boolean; score: number } {
  const wordCount = text.split(/\s+/).length;

  if (wordCount < 15) {
    return { hasDepth: false, score: 20 };
  } else if (wordCount < 30) {
    return { hasDepth: true, score: 60 };
  } else if (wordCount < 60) {
    return { hasDepth: true, score: 80 };
  } else {
    return { hasDepth: true, score: 100 };
  }
}

// ============================================================================
// Main Quality Gate Functions
// ============================================================================

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

// ============================================================================
// Contradiction Detection
// ============================================================================

/**
 * Contradictory action pairs — if both exist for same target, it's a conflict
 */
const CONTRADICTORY_ACTIONS: Array<[string[], string[]]> = [
  [['pause', 'cut', 'stop'], ['scale', 'increase_budget', 'boost']],
  [['reduce_budget', 'decrease'], ['increase_budget', 'raise']],
  [['disable', 'turn_off'], ['enable', 'turn_on', 'activate']],
];

/**
 * Detect contradictions between decisions
 * Returns conflicts that should be surfaced instead of contradictory advice
 */
export function detectContradictions(decisions: DecisionInput[]): {
  hasContradictions: boolean;
  conflicts: Array<{
    decision1: DecisionInput;
    decision2: DecisionInput;
    reason: string;
  }>;
  recommendations: string[];
} {
  const conflicts: Array<{
    decision1: DecisionInput;
    decision2: DecisionInput;
    reason: string;
  }> = [];

  // Group decisions by target (normalize target name)
  const byTarget = new Map<string, DecisionInput[]>();
  for (const decision of decisions) {
    const normalizedTarget = decision.targetName.toLowerCase().trim();
    if (!byTarget.has(normalizedTarget)) {
      byTarget.set(normalizedTarget, []);
    }
    byTarget.get(normalizedTarget)!.push(decision);
  }

  // Check for contradictions within each target
  for (const [target, targetDecisions] of byTarget) {
    if (targetDecisions.length < 2) continue;

    for (let i = 0; i < targetDecisions.length; i++) {
      for (let j = i + 1; j < targetDecisions.length; j++) {
        const d1 = targetDecisions[i];
        const d2 = targetDecisions[j];
        const action1 = d1.suggestedAction.toLowerCase();
        const action2 = d2.suggestedAction.toLowerCase();

        // Check if actions are contradictory
        for (const [group1, group2] of CONTRADICTORY_ACTIONS) {
          const d1InGroup1 = group1.some(a => action1.includes(a));
          const d1InGroup2 = group2.some(a => action1.includes(a));
          const d2InGroup1 = group1.some(a => action2.includes(a));
          const d2InGroup2 = group2.some(a => action2.includes(a));

          if ((d1InGroup1 && d2InGroup2) || (d1InGroup2 && d2InGroup1)) {
            conflicts.push({
              decision1: d1,
              decision2: d2,
              reason: `Contradictory actions on "${target}": "${d1.suggestedAction}" vs "${d2.suggestedAction}"`,
            });
          }
        }
      }
    }
  }

  // Generate recommendations for resolving conflicts
  const recommendations: string[] = [];
  for (const conflict of conflicts) {
    // Compare evidence quality to recommend which to follow
    const ev1Quality = checkEvidenceQuality(conflict.decision1.evidence);
    const ev2Quality = checkEvidenceQuality(conflict.decision2.evidence);

    if (ev1Quality.confidence > ev2Quality.confidence + 0.2) {
      recommendations.push(
        `Conflict on "${conflict.decision1.targetName}": Prefer "${conflict.decision1.suggestedAction}" ` +
        `(confidence ${(ev1Quality.confidence * 100).toFixed(0)}% vs ${(ev2Quality.confidence * 100).toFixed(0)}%)`
      );
    } else if (ev2Quality.confidence > ev1Quality.confidence + 0.2) {
      recommendations.push(
        `Conflict on "${conflict.decision2.targetName}": Prefer "${conflict.decision2.suggestedAction}" ` +
        `(confidence ${(ev2Quality.confidence * 100).toFixed(0)}% vs ${(ev1Quality.confidence * 100).toFixed(0)}%)`
      );
    } else {
      recommendations.push(
        `Conflict on "${conflict.decision1.targetName}": Manual review needed — ` +
        `"${conflict.decision1.suggestedAction}" vs "${conflict.decision2.suggestedAction}" ` +
        `(similar confidence levels)`
      );
    }
  }

  return {
    hasContradictions: conflicts.length > 0,
    conflicts,
    recommendations,
  };
}

/**
 * Resolve contradictions by keeping the higher-confidence decision
 */
export function resolveContradictions(decisions: DecisionInput[]): {
  resolved: DecisionInput[];
  dropped: DecisionInput[];
  conflicts: string[];
} {
  const detection = detectContradictions(decisions);

  if (!detection.hasContradictions) {
    return { resolved: decisions, dropped: [], conflicts: [] };
  }

  const dropped: DecisionInput[] = [];
  const toRemove = new Set<DecisionInput>();

  for (const conflict of detection.conflicts) {
    const ev1 = checkEvidenceQuality(conflict.decision1.evidence);
    const ev2 = checkEvidenceQuality(conflict.decision2.evidence);

    // Keep higher confidence, drop lower
    if (ev1.confidence >= ev2.confidence) {
      toRemove.add(conflict.decision2);
      dropped.push(conflict.decision2);
    } else {
      toRemove.add(conflict.decision1);
      dropped.push(conflict.decision1);
    }
  }

  const resolved = decisions.filter(d => !toRemove.has(d));

  return {
    resolved,
    dropped,
    conflicts: detection.recommendations,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick check: would an experienced buyer already know this?
 */
export function isObvious(text: string): boolean {
  const result = checkInsightQuality({ text }, { allowObvious: false });
  return !result.passes;
}

/**
 * Get a quality score for text (0-100)
 */
export function getQualityScore(text: string): number {
  const result = checkInsightQuality({ text });
  return result.score;
}

/**
 * Enhance text to make it pass quality gate (returns suggestions)
 */
export function getSuggestions(text: string): string[] {
  const result = checkInsightQuality({ text });
  const suggestions: string[] = [];

  if (result.reasons.includes('Does not synthesize multiple signals')) {
    suggestions.push('Add "because" or "which means" to connect to a second signal');
  }

  if (result.reasons.some(r => r.includes('obvious pattern'))) {
    suggestions.push('Add WHY this is happening, not just WHAT happened');
  }

  if (result.reasons.some(r => r.includes('generic phrases'))) {
    suggestions.push('Replace "consider testing" with specific action like "Test X in the next 48 hours"');
  }

  if (result.reasons.some(r => r.includes('Not specific'))) {
    suggestions.push('Add specific numbers, percentages, or campaign names');
  }

  if (result.reasons.some(r => r.includes('Too brief'))) {
    suggestions.push('Expand to explain the strategic reasoning (WHY this matters)');
  }

  return suggestions;
}

// ============================================================================
// Logging
// ============================================================================

logger.info('[QualityGate] Module loaded — all agent outputs will be filtered');
