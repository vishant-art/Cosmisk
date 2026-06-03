/**
 * Elite Quality Gate
 *
 * The UNIFIED gate through which ALL agent outputs must pass.
 *
 * Integrates:
 * 1. Thinking Quality Evaluation (was the reasoning elite?)
 * 2. Output Quality Evaluation (is the content valuable?)
 * 3. Mediocrity Detection (is this dashboard-level?)
 * 4. Commoditization Check (can competitors replicate?)
 * 5. Spend-tier thresholds (higher spend = higher standards)
 *
 * For ₹50L+/month accounts: 90+ required, no exceptions
 * For ₹10L+/month accounts: 80+ required
 * For ₹3L+/month accounts: 70+ required
 *
 * "Better to ship nothing than ship mediocrity."
 */

import {
  evaluateThinkingQuality,
  type ThinkingTrace,
  type ThinkingQualityEvaluation,
  type ThinkingDimensionScore,
} from './thinking-quality-evaluator.js';

import {
  detectMediocrity,
  checkCommoditization,
  type MediocrityEvaluation,
  type CommoditizationCheck,
} from './mediocrity-detector.js';

import {
  evaluateExplainableQuality,
  type IntelligenceInput,
  type ExplainableQualityReport,
} from '../quality-governance/explainable-quality-engine.js';

import {
  checkSignalSufficiency,
  type SignalSufficiencyCheck,
} from '../quality-governance/quality-scorer.js';

// ============================================================================
// Types
// ============================================================================

export type SpendTier = 'enterprise' | 'scale' | 'growth' | 'starter';

export interface EliteQualityThresholds {
  thinkingQuality: number;
  outputQuality: number;
  mediocrityTolerance: 'none' | 'minor' | 'any';
  commoditizationAllowed: boolean;
}

export interface EliteQualityInput {
  // Client context
  clientId: string;
  monthlySpend: number;
  reportType: string;

  // The output being evaluated
  content: string;
  recommendations: string[];

  // The thinking trace (how the agent reasoned)
  thinkingTrace: ThinkingTrace;

  // Signal evidence used
  signalEvidence: IntelligenceInput['signalEvidence'];
  crossSourceSynthesis: boolean;
  synthesisAttempts?: string[];
  economicImpactEstimate?: number;
}

export interface EliteQualityVerdict {
  // Final decision
  ship: boolean;
  verdict: 'SHIP_ELITE' | 'SHIP_ADEQUATE' | 'HOLD_FOR_REVIEW' | 'REJECT_MEDIOCRE' | 'REJECT_SHALLOW' | 'REJECT_COMMODITIZED' | 'REJECT_NO_DATA';

  // Scores
  thinkingScore: number;
  outputScore: number;
  combinedScore: number;

  // Thresholds
  spendTier: SpendTier;
  thresholds: EliteQualityThresholds;
  meetsThreshold: boolean;

  // Detailed evaluations
  thinkingEvaluation: ThinkingQualityEvaluation;
  outputEvaluation: ExplainableQualityReport;
  mediocrityEvaluation: MediocrityEvaluation;
  commoditizationCheck: CommoditizationCheck;

  // Rejection details (if not shipping)
  rejection?: {
    primaryReason: string;
    category: 'thinking' | 'output' | 'mediocrity' | 'commoditization' | 'threshold';
    details: string[];
    howToImprove: string[];
  };

  // Human-readable summary
  summary: string;
}

// ============================================================================
// Spend Tier Determination
// ============================================================================

export function getSpendTier(monthlySpend: number): SpendTier {
  if (monthlySpend >= 5000000) return 'enterprise'; // ₹50L+
  if (monthlySpend >= 1000000) return 'scale';      // ₹10L+
  if (monthlySpend >= 300000) return 'growth';      // ₹3L+
  return 'starter';
}

export function getQualityThresholds(tier: SpendTier): EliteQualityThresholds {
  switch (tier) {
    case 'enterprise':
      return {
        thinkingQuality: 85,
        outputQuality: 85,
        mediocrityTolerance: 'none',
        commoditizationAllowed: false,
      };
    case 'scale':
      return {
        thinkingQuality: 75,
        outputQuality: 75,
        mediocrityTolerance: 'none',
        commoditizationAllowed: false,
      };
    case 'growth':
      return {
        thinkingQuality: 65,
        outputQuality: 65,
        mediocrityTolerance: 'minor',
        commoditizationAllowed: false,
      };
    case 'starter':
      return {
        thinkingQuality: 55,
        outputQuality: 55,
        mediocrityTolerance: 'minor',
        commoditizationAllowed: true, // Starter tier can tolerate some commoditized insights
      };
  }
}

// ============================================================================
// Empty placeholder evaluations for the "no data" rejection path.
// These are fully-typed zero-value objects (no behaviour change vs. the prior
// untyped literals) — only the fields read downstream carry meaningful values.
// ============================================================================

function emptyThinkingEvaluation(): ThinkingQualityEvaluation {
  const emptyDimension: ThinkingDimensionScore = {
    dimension: '',
    score: 0,
    weight: 0,
    weightedContribution: 0,
    evidence: [],
    benchmark: '',
  };
  return {
    hypothesisDepth: emptyDimension,
    evidenceSearch: emptyDimension,
    causalReasoning: emptyDimension,
    assumptionExposure: emptyDimension,
    contradictionHandling: emptyDimension,
    secondOrderThinking: emptyDimension,
    strategicOriginality: emptyDimension,
    hiddenLeverageSearch: emptyDimension,
    behavioralInterpretation: emptyDimension,
    allDimensions: [],
    overallThinkingScore: 0,
    verdict: 'NO_REASONING',
    improvementRequired: ['Cannot evaluate - no data available'],
    humanReadableExplanation: '',
  };
}

function emptyOutputEvaluation(finalExplanation: string): ExplainableQualityReport {
  return {
    overallScore: 0,
    verdict: 'REJECT',
    dimensions: [],
    synthesisAnalysis: {
      signalSourcesUsed: [],
      signalSourcesMissed: [],
      crossSignalCorrelations: 0,
      causalChainsIdentified: 0,
      secondOrderImplications: 0,
      hiddenPatternSearchAttempts: [],
      synthesisDepthScore: 0,
      verdict: 'SURFACE',
    },
    multiSignalConfirmation: {
      convergentSignals: [],
      conflictingSignals: [],
      unexaminedSignals: [],
      confirmationStrength: 0,
    },
    confidenceBreakdown: {
      signalAgreement: 0,
      statisticalSupport: 0,
      temporalConsistency: 0,
      behavioralConsistency: 0,
      overallConfidence: 0,
    },
    hiddenLeverageSearch: {
      areasSearched: [],
      areasNotSearched: [],
      potentialHiddenPatterns: [],
      recommendedDeepDives: [],
    },
    founderGradeAssessment: {
      wouldImpressFounder: false,
      reasoning: '',
      whatWouldMakeItBetter: [],
    },
    finalExplanation,
  };
}

function emptyMediocrityEvaluation(): MediocrityEvaluation {
  return {
    isMediocre: false,
    matches: [],
    severityCounts: { fatal: 0, major: 0, minor: 0 },
    overallSeverity: 'none',
    humanReadable: '',
    wouldSeniorMBKnow: false,
    couldDashboardShow: false,
  };
}

function emptyCommoditizationCheck(): CommoditizationCheck {
  return {
    canGoogleAnalyticsShowThis: false,
    canTripleWhaleShowThis: false,
    canNorthbeamShowThis: false,
    canMetaAdsManagerShowThis: false,
    canSeniorMBIdentifyIn5Min: false,
    canHumanAnalystFindManually: false,
    isCommoditized: false,
    reasoning: [],
  };
}

// ============================================================================
// Main Evaluation Function
// ============================================================================

export function evaluateEliteQuality(input: EliteQualityInput): EliteQualityVerdict {
  const spendTier = getSpendTier(input.monthlySpend);
  const thresholds = getQualityThresholds(spendTier);

  // ============================================================================
  // Step 0: SIGNAL SUFFICIENCY CHECK (NEW - runs FIRST)
  // Prevents shipping "no data" reports
  // ============================================================================
  const signalCheck = checkSignalSufficiency({
    type: input.reportType,
    content: input.content,
    recommendations: input.recommendations,
    dataPointsUsed: input.signalEvidence?.length || 0,
    crossSourceSynthesis: input.crossSourceSynthesis,
    economicImpactEstimate: input.economicImpactEstimate,
  });

  if (!signalCheck.hasSufficientSignal) {
    // Immediate rejection - no data = no ship, no exceptions
    return {
      ship: false,
      verdict: 'REJECT_NO_DATA',
      thinkingScore: 0,
      outputScore: 0,
      combinedScore: 0,
      spendTier,
      thresholds,
      meetsThreshold: false,
      thinkingEvaluation: emptyThinkingEvaluation(),
      outputEvaluation: emptyOutputEvaluation(signalCheck.reason),
      mediocrityEvaluation: emptyMediocrityEvaluation(),
      commoditizationCheck: emptyCommoditizationCheck(),
      rejection: {
        primaryReason: signalCheck.reason,
        category: 'threshold',
        details: [
          `Content length: ${signalCheck.details.contentLength} chars`,
          `Data points: ${signalCheck.details.dataPointCount}`,
          `Is "no data" message: ${signalCheck.details.isNoDataMessage}`,
        ],
        howToImprove: [
          'Ensure data sources are connected and returning data',
          'Verify API credentials and permissions',
          'Check that the account has activity in the date range',
        ],
      },
      summary: `❌ REJECTED (NO DATA)\n${signalCheck.reason}\nThis report should NOT be shipped to the client.`,
    };
  }

  // ============================================================================
  // Step 1: Evaluate Thinking Quality
  // ============================================================================
  const thinkingEvaluation = evaluateThinkingQuality(input.thinkingTrace, input.content);
  const thinkingScore = thinkingEvaluation.overallThinkingScore;

  // ============================================================================
  // Step 2: Evaluate Output Quality
  // ============================================================================
  const outputInput: IntelligenceInput = {
    clientId: input.clientId,
    reportType: input.reportType,
    content: input.content,
    recommendations: input.recommendations,
    signalEvidence: input.signalEvidence,
    crossSourceSynthesis: input.crossSourceSynthesis,
    synthesisAttempts: input.synthesisAttempts,
    economicImpactEstimate: input.economicImpactEstimate,
  };
  const outputEvaluation = evaluateExplainableQuality(outputInput);
  const outputScore = outputEvaluation.overallScore;

  // ============================================================================
  // Step 3: Detect Mediocrity
  // ============================================================================
  const mediocrityEvaluation = detectMediocrity(input.content);

  // ============================================================================
  // Step 4: Check Commoditization
  // ============================================================================
  const commoditizationCheck = checkCommoditization(input.content);

  // ============================================================================
  // Step 5: Calculate Combined Score
  // ============================================================================
  // Thinking quality is weighted more heavily - good output from shallow thinking is still weak
  const combinedScore = Math.round(thinkingScore * 0.6 + outputScore * 0.4);

  // ============================================================================
  // Step 6: Determine Verdict
  // ============================================================================

  let ship = true;
  let verdict: EliteQualityVerdict['verdict'] = 'SHIP_ELITE';
  let rejection: EliteQualityVerdict['rejection'] | undefined;

  // Gate 1: Mediocrity check (fatal mediocrity = instant reject)
  if (mediocrityEvaluation.overallSeverity === 'fatal') {
    ship = false;
    verdict = 'REJECT_MEDIOCRE';
    rejection = {
      primaryReason: 'Fatal mediocrity detected - this is dashboard-level intelligence',
      category: 'mediocrity',
      details: mediocrityEvaluation.matches.map(m => `"${m.matched}" - ${m.description}`),
      howToImprove: [
        'Remove dashboard metrics (ROAS, CTR, CPA observations)',
        'Replace generic recommendations with specific, non-obvious actions',
        'Find what dashboards DON\'T show',
      ],
    };
  }

  // Gate 2: Mediocrity tolerance check
  else if (
    thresholds.mediocrityTolerance === 'none' &&
    mediocrityEvaluation.overallSeverity !== 'none'
  ) {
    ship = false;
    verdict = 'REJECT_MEDIOCRE';
    rejection = {
      primaryReason: `${spendTier} tier requires zero mediocrity - ${mediocrityEvaluation.severityCounts.major} major, ${mediocrityEvaluation.severityCounts.minor} minor patterns found`,
      category: 'mediocrity',
      details: mediocrityEvaluation.matches.map(m => `"${m.matched}" - ${m.description}`),
      howToImprove: [
        'Remove all generic language and recommendations',
        'Every insight must be non-obvious to a senior media buyer',
      ],
    };
  }

  // Gate 3: Commoditization check
  else if (!thresholds.commoditizationAllowed && commoditizationCheck.isCommoditized) {
    ship = false;
    verdict = 'REJECT_COMMODITIZED';
    rejection = {
      primaryReason: 'Intelligence is commoditized - any dashboard tool can show this',
      category: 'commoditization',
      details: commoditizationCheck.reasoning,
      howToImprove: [
        'Find insights that require cross-system synthesis',
        'Discover hidden leverage no tool surfaces',
        'Provide behavioral interpretation, not just metrics',
      ],
    };
  }

  // Gate 4: Thinking quality threshold
  else if (thinkingScore < thresholds.thinkingQuality) {
    ship = false;
    verdict = 'REJECT_SHALLOW';
    rejection = {
      primaryReason: `Thinking quality ${thinkingScore} below ${thresholds.thinkingQuality} threshold for ${spendTier} tier`,
      category: 'thinking',
      details: thinkingEvaluation.improvementRequired,
      howToImprove: thinkingEvaluation.allDimensions
        .filter(d => d.score < 60)
        .map(d => d.howToImprove || `Improve ${d.dimension}`)
        .filter(Boolean) as string[],
    };
  }

  // Gate 5: Output quality threshold
  else if (outputScore < thresholds.outputQuality) {
    ship = false;
    verdict = 'HOLD_FOR_REVIEW';
    rejection = {
      primaryReason: `Output quality ${outputScore} below ${thresholds.outputQuality} threshold for ${spendTier} tier`,
      category: 'output',
      details: outputEvaluation.dimensions
        .filter(d => d.score < 60)
        .map(d => `${d.name}: ${d.score}/100 - ${d.reasoning}`),
      howToImprove: [
        'Increase synthesis depth - use more signal sources',
        'Add economic impact quantification',
        'Provide specific, actionable recommendations',
      ],
    };
  }

  // Passed all gates - determine ship quality
  else {
    ship = true;
    if (combinedScore >= 90) {
      verdict = 'SHIP_ELITE';
    } else if (combinedScore >= 75) {
      verdict = 'SHIP_ADEQUATE';
    } else {
      verdict = 'HOLD_FOR_REVIEW'; // Passed thresholds but borderline
    }
  }

  // ============================================================================
  // Step 7: Generate Summary
  // ============================================================================

  let summary: string;
  if (ship) {
    summary = `✅ APPROVED (${combinedScore}/100, ${verdict})\n` +
      `Thinking: ${thinkingScore}/100 (${thinkingEvaluation.verdict})\n` +
      `Output: ${outputScore}/100 (${outputEvaluation.verdict})\n` +
      `Tier: ${spendTier} (threshold: ${thresholds.thinkingQuality}+)`;
  } else {
    summary = `❌ REJECTED (${combinedScore}/100, ${verdict})\n` +
      `Reason: ${rejection?.primaryReason}\n` +
      `Thinking: ${thinkingScore}/100 (need ${thresholds.thinkingQuality}+)\n` +
      `Output: ${outputScore}/100 (need ${thresholds.outputQuality}+)\n` +
      `Fix: ${rejection?.howToImprove[0] || 'Improve quality'}`;
  }

  return {
    ship,
    verdict,
    thinkingScore,
    outputScore,
    combinedScore,
    spendTier,
    thresholds,
    meetsThreshold: ship,
    thinkingEvaluation,
    outputEvaluation,
    mediocrityEvaluation,
    commoditizationCheck,
    rejection,
    summary,
  };
}

// ============================================================================
// Quick Check (for fast filtering)
// ============================================================================

export function quickQualityCheck(
  content: string,
  monthlySpend: number
): { passes: boolean; reason?: string } {
  const spendTier = getSpendTier(monthlySpend);
  const thresholds = getQualityThresholds(spendTier);

  // Quick mediocrity check
  const mediocrity = detectMediocrity(content);
  if (mediocrity.overallSeverity === 'fatal') {
    return { passes: false, reason: 'Fatal mediocrity: ' + mediocrity.matches[0]?.matched };
  }

  if (thresholds.mediocrityTolerance === 'none' && mediocrity.overallSeverity !== 'none') {
    return { passes: false, reason: 'Mediocrity not tolerated for ' + spendTier + ' tier' };
  }

  // Quick commoditization check
  if (!thresholds.commoditizationAllowed) {
    const commoditization = checkCommoditization(content);
    if (commoditization.isCommoditized) {
      return { passes: false, reason: 'Commoditized intelligence' };
    }
  }

  return { passes: true };
}

// ============================================================================
// Generate Rejection Report
// ============================================================================

export function generateRejectionReport(verdict: EliteQualityVerdict): string {
  if (verdict.ship) {
    return 'No rejection - output approved for shipping.';
  }

  const { rejection, thinkingEvaluation, outputEvaluation, mediocrityEvaluation, spendTier, thresholds } = verdict;

  let report = `
## Quality Gate Rejection Report

**Client Tier:** ${spendTier} (₹${verdict.spendTier === 'enterprise' ? '50L+' : verdict.spendTier === 'scale' ? '10-50L' : verdict.spendTier === 'growth' ? '3-10L' : '<3L'}/month)
**Quality Threshold:** ${thresholds.thinkingQuality}+ thinking, ${thresholds.outputQuality}+ output

### Verdict: ${verdict.verdict}

**Primary Reason:** ${rejection?.primaryReason}

### Scores
- **Thinking Quality:** ${verdict.thinkingScore}/100 (need ${thresholds.thinkingQuality}+)
- **Output Quality:** ${verdict.outputScore}/100 (need ${thresholds.outputQuality}+)
- **Combined:** ${verdict.combinedScore}/100

### Thinking Quality Breakdown
${thinkingEvaluation.allDimensions.map(d => `- **${d.dimension}:** ${d.score}/100${d.failedBecause ? ` ⚠️ ${d.failedBecause}` : ''}`).join('\n')}

### Mediocrity Analysis
- **Severity:** ${mediocrityEvaluation.overallSeverity}
- **Fatal patterns:** ${mediocrityEvaluation.severityCounts.fatal}
- **Major patterns:** ${mediocrityEvaluation.severityCounts.major}
- **Minor patterns:** ${mediocrityEvaluation.severityCounts.minor}
${mediocrityEvaluation.matches.length > 0 ? '\n**Patterns Found:**\n' + mediocrityEvaluation.matches.map(m => `- "${m.matched}" (${m.severity}): ${m.description}`).join('\n') : ''}

### How to Improve
${rejection?.howToImprove.map((h, i) => `${i + 1}. ${h}`).join('\n')}

### What Would Pass
For a ${spendTier} tier account, the output must:
- Score ${thresholds.thinkingQuality}+ on thinking quality (hypothesis testing, evidence search, causal reasoning)
- Score ${thresholds.outputQuality}+ on output quality (synthesis depth, economic impact, actionability)
- Have ${thresholds.mediocrityTolerance === 'none' ? 'ZERO' : 'minimal'} mediocrity patterns
- ${thresholds.commoditizationAllowed ? 'May include some commoditized insights' : 'NOT be replicable by any dashboard tool'}

---
*Better to ship nothing than ship mediocrity.*
`;

  return report;
}

// ============================================================================
// Export Helper Types
// ============================================================================

export type { ThinkingTrace, ThinkingQualityEvaluation } from './thinking-quality-evaluator.js';
export type { MediocrityEvaluation, CommoditizationCheck } from './mediocrity-detector.js';
