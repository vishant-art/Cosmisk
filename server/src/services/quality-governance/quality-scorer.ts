/**
 * Intelligence Quality Scorer
 *
 * The MOST critical layer in the system.
 * Evaluates whether intelligence outputs are worth shipping.
 *
 * Goal: Maximum signal quality, NOT maximum output volume.
 *
 * Question every output must answer:
 * "Is this worth showing to a founder spending ₹50L/month?"
 */

// ============================================================================
// Types
// ============================================================================

export type QualityVerdict = 'SHIP' | 'HOLD' | 'REJECT';

export interface QualityScores {
  signalDensity: number;      // 0-100: Insight per word ratio
  strategicDepth: number;     // 0-100: Beyond surface observation
  originality: number;        // 0-100: Not findable in 30 min manually
  actionability: number;      // 0-100: Specific, timed, measurable action
  founderWow: number;         // 0-100: "System sees what team missed"
  economicValue: number;      // 0-100: Estimated ₹ impact potential
}

export interface QualityPenalties {
  genericLanguage: number;    // Penalty for consultant-speak
  verbosity: number;          // Penalty for filler words
  shallowness: number;        // Penalty for surface-level observations
  obviousness: number;        // Penalty for dashboard-visible insights
  triviality: number;         // Penalty for media-buyer-obvious insights
}

export interface QualityEvaluation {
  scores: QualityScores;
  penalties: QualityPenalties;
  compositeScore: number;
  verdict: QualityVerdict;
  reasons: string[];
  rejectionReason?: string;
  improvementSuggestions?: string[];
}

export interface IntelligenceOutput {
  type: string;
  content: string;
  recommendations?: string[];
  insights?: string[];
  metrics?: Record<string, number>;
  dataPointsUsed?: number;
  crossSourceSynthesis?: boolean;
  economicImpactEstimate?: number;
}

// ============================================================================
// Signal Sufficiency Types (NEW - Prevents shipping "no data" reports)
// ============================================================================

export interface SignalSufficiencyCheck {
  hasSufficientSignal: boolean;
  verdict: 'SUFFICIENT' | 'INSUFFICIENT' | 'NO_DATA';
  reason: string;
  details: {
    hasContent: boolean;
    contentLength: number;
    minContentLength: number;
    hasDataPoints: boolean;
    dataPointCount: number;
    minDataPoints: number;
    hasRecommendations: boolean;
    isNoDataMessage: boolean;
    dataSources: string[];
  };
}

// ============================================================================
// Anti-Patterns to Detect
// ============================================================================

const GENERIC_PHRASES = [
  'consider testing',
  'it may be worth',
  'continue monitoring',
  'optimize for better',
  'leverage your existing',
  'focus on high-performing',
  'align your strategy',
  'ensure consistent',
  'explore opportunities',
  'maximize your',
  'enhance your',
  'streamline your',
  'based on best practices',
  'industry standards suggest',
  'moving forward',
  'going forward',
  'at the end of the day',
  'low-hanging fruit',
  'quick wins',
  'deep dive',
  'circle back',
  'take it to the next level',
];

const FILLER_PHRASES = [
  'it\'s important to note that',
  'it should be noted that',
  'based on our analysis',
  'as mentioned previously',
  'in order to',
  'the fact that',
  'at this point in time',
  'due to the fact that',
  'it is worth mentioning',
  'needless to say',
  'as we can see',
  'it goes without saying',
  'for all intents and purposes',
];

const SHALLOW_PATTERNS = [
  /your (roas|ctr|cpc|cpm|cpa) (is|was) \d/i,
  /spend (increased|decreased) by \d+%/i,
  /performance (improved|declined)/i,
  /creative [a-z] outperformed/i,
  /below average/i,
  /above average/i,
  /trending (up|down)/i,
];

const FAKE_SOPHISTICATION = [
  'optimization opportunity identified',
  'strategic pivot recommended',
  'performance variance observed',
  'audience fatigue detected',
  'creative saturation',
  'market dynamics',
  'competitive landscape',
  'holistic approach',
  'synergistic',
  'paradigm shift',
];

const DASHBOARD_VISIBLE = [
  /total spend: ₹?\d/i,
  /total revenue: ₹?\d/i,
  /roas: \d/i,
  /ctr: \d/i,
  /impressions: \d/i,
  /clicks: \d/i,
  /purchases: \d/i,
];

// Patterns that indicate "no data" scenarios - should NOT be shipped
const NO_DATA_INDICATORS = [
  /no data (available|found|to analyze)/i,
  /insufficient (data|signal|information)/i,
  /not enough (data|signal|information)/i,
  /we don't have enough signal/i,
  /unable to (analyze|generate|produce)/i,
  /no (insights?|findings?|recommendations?) (available|found|to report)/i,
  /data.*not.*available/i,
  /could not (retrieve|fetch|get|access)/i,
  /missing required data/i,
  /no metrics (available|found)/i,
  /empty (response|result|data)/i,
];

// ============================================================================
// Signal Sufficiency Check (CRITICAL - Gate #0)
// ============================================================================

/**
 * Check if we have enough data to generate a meaningful report.
 * This is the FIRST gate - runs BEFORE quality scoring.
 *
 * Returns INSUFFICIENT/NO_DATA = DO NOT SHIP
 * Returns SUFFICIENT = proceed to quality scoring
 */
export function checkSignalSufficiency(
  output: IntelligenceOutput,
  options: {
    minContentLength?: number;
    minDataPoints?: number;
    minRecommendations?: number;
  } = {}
): SignalSufficiencyCheck {
  const {
    minContentLength = 100,  // At least 100 chars of real content
    minDataPoints = 1,       // At least 1 data point
    minRecommendations = 0,  // Recommendations optional by default
  } = options;

  const content = output.content?.trim() || '';
  const contentLength = content.length;
  const hasContent = contentLength >= minContentLength;

  // Check for "no data" messages that should never ship
  const isNoDataMessage = NO_DATA_INDICATORS.some(pattern => pattern.test(content));

  // Count actual data points
  const dataPointCount = output.dataPointsUsed || 0;
  const metricsCount = output.metrics ? Object.keys(output.metrics).length : 0;
  const totalDataPoints = dataPointCount + metricsCount;
  const hasDataPoints = totalDataPoints >= minDataPoints;

  // Check recommendations
  const recommendationCount = output.recommendations?.length || 0;
  const hasRecommendations = recommendationCount >= minRecommendations || minRecommendations === 0;

  // Determine data sources
  const dataSources: string[] = [];
  if (output.crossSourceSynthesis) dataSources.push('cross-source');
  if (metricsCount > 0) dataSources.push('metrics');
  if (output.insights?.length) dataSources.push('insights');

  // Build the check result
  const details = {
    hasContent,
    contentLength,
    minContentLength,
    hasDataPoints,
    dataPointCount: totalDataPoints,
    minDataPoints,
    hasRecommendations,
    isNoDataMessage,
    dataSources,
  };

  // VERDICT LOGIC:

  // Case 1: Explicit "no data" message detected - NEVER SHIP
  if (isNoDataMessage) {
    return {
      hasSufficientSignal: false,
      verdict: 'NO_DATA',
      reason: 'Report contains "no data" language - this should not be shipped to clients',
      details,
    };
  }

  // Case 2: Empty or near-empty content - NEVER SHIP
  if (contentLength < 50) {
    return {
      hasSufficientSignal: false,
      verdict: 'NO_DATA',
      reason: `Content is empty or too short (${contentLength} chars, need at least 50)`,
      details,
    };
  }

  // Case 3: Below minimum content threshold - HOLD
  if (!hasContent) {
    return {
      hasSufficientSignal: false,
      verdict: 'INSUFFICIENT',
      reason: `Content length ${contentLength} below minimum ${minContentLength}`,
      details,
    };
  }

  // Case 4: No data points at all - HOLD
  if (!hasDataPoints && minDataPoints > 0) {
    return {
      hasSufficientSignal: false,
      verdict: 'INSUFFICIENT',
      reason: `No data points found (need at least ${minDataPoints})`,
      details,
    };
  }

  // Case 5: Has content but no substance (all filler)
  const fillerRatio = calculateFillerRatio(content);
  if (fillerRatio > 0.7) {
    return {
      hasSufficientSignal: false,
      verdict: 'INSUFFICIENT',
      reason: `Content is ${Math.round(fillerRatio * 100)}% filler language - no substantive data`,
      details,
    };
  }

  // PASSED - has sufficient signal
  return {
    hasSufficientSignal: true,
    verdict: 'SUFFICIENT',
    reason: `Signal sufficient: ${contentLength} chars, ${totalDataPoints} data points, ${dataSources.length} sources`,
    details,
  };
}

/**
 * Calculate what percentage of content is filler language
 */
function calculateFillerRatio(content: string): number {
  const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return 1;

  let fillerWordCount = 0;

  // Check each filler phrase
  FILLER_PHRASES.forEach(phrase => {
    const phraseWords = phrase.split(/\s+/).length;
    if (content.toLowerCase().includes(phrase)) {
      fillerWordCount += phraseWords;
    }
  });

  // Also check generic phrases
  GENERIC_PHRASES.forEach(phrase => {
    const phraseWords = phrase.split(/\s+/).length;
    if (content.toLowerCase().includes(phrase)) {
      fillerWordCount += phraseWords;
    }
  });

  return Math.min(1, fillerWordCount / words.length);
}

// ============================================================================
// Quality Scoring Functions
// ============================================================================

/**
 * Calculate Signal Density Score
 * How much actual insight per word?
 */
export function scoreSignalDensity(output: IntelligenceOutput): number {
  const content = output.content.toLowerCase();
  const words = content.split(/\s+/).length;

  // Count substantive elements
  let signals = 0;

  // Specific numbers/metrics add signal
  const numberMatches = content.match(/₹[\d,]+|\d+%|\d+x|\d+\.\d+/g) || [];
  signals += numberMatches.length * 5;

  // Causal language adds signal
  const causalWords = ['because', 'therefore', 'which means', 'resulting in', 'driven by', 'caused by', 'leads to'];
  causalWords.forEach(word => {
    if (content.includes(word)) signals += 10;
  });

  // Time-specific language adds signal
  const timeSpecific = ['this week', 'last 7 days', 'next 3 days', 'by friday', 'within 48 hours'];
  timeSpecific.forEach(phrase => {
    if (content.includes(phrase)) signals += 8;
  });

  // Specific recommendations add signal
  if (output.recommendations) {
    output.recommendations.forEach(rec => {
      if (rec.match(/₹[\d,]+/)) signals += 15; // Money-specific
      if (rec.match(/\d+ (days?|hours?|weeks?)/)) signals += 10; // Time-specific
      if (rec.length < 100 && !GENERIC_PHRASES.some(g => rec.toLowerCase().includes(g))) {
        signals += 12; // Concise and non-generic
      }
    });
  }

  // Penalize for length without proportional signal
  const signalDensityRaw = (signals / words) * 100;

  // Normalize to 0-100
  return Math.min(100, Math.max(0, signalDensityRaw * 10));
}

/**
 * Calculate Strategic Depth Score
 * Does this go beyond surface-level observation?
 */
export function scoreStrategicDepth(output: IntelligenceOutput): number {
  const content = output.content.toLowerCase();
  let score = 30; // Base score

  // Second-order thinking indicators
  const secondOrder = [
    'which means that',
    'the implication is',
    'this suggests',
    'looking deeper',
    'the root cause',
    'underlying',
    'if this continues',
    'the ripple effect',
  ];
  secondOrder.forEach(phrase => {
    if (content.includes(phrase)) score += 10;
  });

  // Cross-signal synthesis
  if (output.crossSourceSynthesis) score += 20;

  // Multiple data points used
  if (output.dataPointsUsed && output.dataPointsUsed > 5) {
    score += Math.min(20, output.dataPointsUsed * 2);
  }

  // Counterintuitive findings
  const counterintuitive = ['surprisingly', 'unexpectedly', 'contrary to', 'despite', 'even though'];
  counterintuitive.forEach(phrase => {
    if (content.includes(phrase)) score += 8;
  });

  // Time-horizon reasoning
  const timeHorizon = ['in the next', 'over the coming', 'by end of', 'long-term', 'short-term window'];
  timeHorizon.forEach(phrase => {
    if (content.includes(phrase)) score += 5;
  });

  // Penalize for shallow patterns
  SHALLOW_PATTERNS.forEach(pattern => {
    if (pattern.test(content)) score -= 15;
  });

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate Originality Score
 * Could a senior media buyer identify this manually in 30 minutes?
 */
export function scoreOriginality(output: IntelligenceOutput): number {
  const content = output.content.toLowerCase();
  let score = 40; // Base score

  // Cross-platform synthesis required
  if (output.crossSourceSynthesis) score += 25;

  // Multiple data points (harder to see manually)
  if (output.dataPointsUsed && output.dataPointsUsed > 10) score += 15;

  // Dashboard-visible content (heavily penalize)
  DASHBOARD_VISIBLE.forEach(pattern => {
    if (pattern.test(content)) score -= 20;
  });

  // Pattern detection over time
  const temporalPatterns = ['over the past', 'trending', 'pattern emerging', 'cyclical', 'compared to same period'];
  temporalPatterns.forEach(phrase => {
    if (content.includes(phrase)) score += 8;
  });

  // Behavioral micro-patterns
  const behavioral = ['audience segment', 'cohort', 'customer journey', 'attribution', 'cross-device'];
  behavioral.forEach(phrase => {
    if (content.includes(phrase)) score += 6;
  });

  // Competitive intelligence
  const competitive = ['competitor', 'market share', 'auction', 'bidding landscape'];
  competitive.forEach(phrase => {
    if (content.includes(phrase)) score += 10;
  });

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate Actionability Score
 * Can the founder DO something specific with this?
 */
export function scoreActionability(output: IntelligenceOutput): number {
  let score = 20; // Base score

  if (!output.recommendations || output.recommendations.length === 0) {
    return 10; // Very low if no recommendations
  }

  output.recommendations.forEach(rec => {
    const recLower = rec.toLowerCase();

    // Specific action verb
    const actionVerbs = ['pause', 'increase', 'decrease', 'shift', 'reallocate', 'launch', 'kill', 'duplicate', 'test'];
    actionVerbs.forEach(verb => {
      if (recLower.includes(verb)) score += 8;
    });

    // Specific amount
    if (rec.match(/₹[\d,]+|by \d+%|\d+x/)) score += 10;

    // Specific timeframe
    if (rec.match(/today|tomorrow|this week|next \d+ days|by \w+day|within \d+ hours/i)) score += 10;

    // Expected outcome
    if (recLower.includes('expect') || recLower.includes('should result') || recLower.includes('will likely')) {
      score += 8;
    }

    // Generic action (penalize)
    if (GENERIC_PHRASES.some(g => recLower.includes(g))) score -= 15;
  });

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate Founder-WOW Score
 * Does this create "This system sees what my team missed"?
 */
export function scoreFounderWow(output: IntelligenceOutput): number {
  const content = output.content.toLowerCase();
  let score = 25; // Base score

  // Hidden pattern revealed
  const hiddenPatterns = ['hidden', 'overlooked', 'missed', 'unnoticed', 'flying under radar'];
  hiddenPatterns.forEach(phrase => {
    if (content.includes(phrase)) score += 15;
  });

  // Money impact quantified
  if (output.economicImpactEstimate) {
    if (output.economicImpactEstimate > 1000000) score += 30; // >₹10L
    else if (output.economicImpactEstimate > 100000) score += 20; // >₹1L
    else score += 10;
  }

  // Timing criticality
  const urgency = ['window closing', 'act now', 'time-sensitive', 'before competitors', 'limited window'];
  urgency.forEach(phrase => {
    if (content.includes(phrase)) score += 10;
  });

  // Competitive advantage potential
  const competitive = ['competitor', 'market opportunity', 'first-mover', 'ahead of'];
  competitive.forEach(phrase => {
    if (content.includes(phrase)) score += 8;
  });

  // Specific money leak or opportunity
  const moneyLeak = ['wasting', 'losing', 'bleeding', 'leaking', 'opportunity cost'];
  moneyLeak.forEach(phrase => {
    if (content.includes(phrase)) score += 12;
  });

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate Economic Value Score
 * What's the potential ₹ impact?
 */
export function scoreEconomicValue(output: IntelligenceOutput): number {
  if (!output.economicImpactEstimate) {
    return 30; // Unknown = low confidence
  }

  const impact = output.economicImpactEstimate;

  if (impact > 10000000) return 100; // >₹1Cr
  if (impact > 5000000) return 90;   // >₹50L
  if (impact > 1000000) return 80;   // >₹10L
  if (impact > 500000) return 70;    // >₹5L
  if (impact > 100000) return 60;    // >₹1L
  if (impact > 50000) return 50;     // >₹50K
  if (impact > 10000) return 40;     // >₹10K
  return 30;
}

// ============================================================================
// Penalty Calculation
// ============================================================================

/**
 * Calculate penalty for generic language
 */
export function penalizeGenericLanguage(output: IntelligenceOutput): number {
  const content = output.content.toLowerCase();
  let penalty = 0;

  GENERIC_PHRASES.forEach(phrase => {
    if (content.includes(phrase)) penalty += 5;
  });

  FAKE_SOPHISTICATION.forEach(phrase => {
    if (content.includes(phrase)) penalty += 8;
  });

  return Math.min(40, penalty); // Cap penalty
}

/**
 * Calculate penalty for verbosity
 */
export function penalizeVerbosity(output: IntelligenceOutput): number {
  const content = output.content.toLowerCase();
  const words = content.split(/\s+/).length;
  let penalty = 0;

  // Filler phrases
  FILLER_PHRASES.forEach(phrase => {
    if (content.includes(phrase)) penalty += 3;
  });

  // Excessive length without proportional value
  if (words > 500 && !output.crossSourceSynthesis) penalty += 10;
  if (words > 800) penalty += 15;
  if (words > 1200) penalty += 20;

  return Math.min(35, penalty);
}

/**
 * Calculate penalty for shallow observations
 */
export function penalizeShallowness(output: IntelligenceOutput): number {
  const content = output.content.toLowerCase();
  let penalty = 0;

  SHALLOW_PATTERNS.forEach(pattern => {
    if (pattern.test(content)) penalty += 8;
  });

  // No "why" or "because"
  if (!content.includes('because') && !content.includes('due to') && !content.includes('driven by')) {
    penalty += 15;
  }

  return Math.min(35, penalty);
}

/**
 * Calculate penalty for obvious insights
 */
export function penalizeObviousness(output: IntelligenceOutput): number {
  const content = output.content.toLowerCase();
  let penalty = 0;

  DASHBOARD_VISIBLE.forEach(pattern => {
    if (pattern.test(content)) penalty += 10;
  });

  // Single data source
  if (!output.crossSourceSynthesis) penalty += 10;

  // Few data points
  if (output.dataPointsUsed && output.dataPointsUsed < 3) penalty += 10;

  return Math.min(40, penalty);
}

/**
 * Calculate penalty for media-buyer-obvious insights
 */
export function penalizeTriviality(output: IntelligenceOutput): number {
  const content = output.content.toLowerCase();
  let penalty = 0;

  const trivialInsights = [
    'pause underperforming',
    'scale winners',
    'test new creatives',
    'refresh creative',
    'expand audience',
    'increase budget on',
    'decrease budget on',
    'a/b test',
  ];

  trivialInsights.forEach(phrase => {
    if (content.includes(phrase)) penalty += 6;
  });

  return Math.min(30, penalty);
}

// ============================================================================
// Main Quality Evaluation
// ============================================================================

/**
 * Evaluate intelligence output quality
 * Returns verdict: SHIP, HOLD, or REJECT
 *
 * IMPORTANT: This now checks signal sufficiency FIRST.
 * If there's no data, it returns REJECT immediately.
 */
export function evaluateQuality(output: IntelligenceOutput): QualityEvaluation {
  // GATE 0: Signal sufficiency check (NEW)
  // This prevents shipping "no data" reports
  const signalCheck = checkSignalSufficiency(output);

  if (!signalCheck.hasSufficientSignal) {
    // Immediate rejection for no-data scenarios
    return {
      scores: {
        signalDensity: 0,
        strategicDepth: 0,
        originality: 0,
        actionability: 0,
        founderWow: 0,
        economicValue: 0,
      },
      penalties: {
        genericLanguage: 0,
        verbosity: 0,
        shallowness: 0,
        obviousness: 0,
        triviality: 0,
      },
      compositeScore: 0,
      verdict: 'REJECT',
      reasons: [signalCheck.reason],
      rejectionReason: signalCheck.verdict === 'NO_DATA'
        ? 'No data available - report cannot be generated'
        : 'Insufficient signal to generate meaningful intelligence',
      improvementSuggestions: [
        'Ensure data sources are connected and returning data',
        'Verify API credentials and permissions',
        'Check that the date range contains activity',
        'Ensure the account has enough spend/activity to analyze',
      ],
    };
  }

  // Calculate scores
  const scores: QualityScores = {
    signalDensity: scoreSignalDensity(output),
    strategicDepth: scoreStrategicDepth(output),
    originality: scoreOriginality(output),
    actionability: scoreActionability(output),
    founderWow: scoreFounderWow(output),
    economicValue: scoreEconomicValue(output),
  };

  // Calculate penalties
  const penalties: QualityPenalties = {
    genericLanguage: penalizeGenericLanguage(output),
    verbosity: penalizeVerbosity(output),
    shallowness: penalizeShallowness(output),
    obviousness: penalizeObviousness(output),
    triviality: penalizeTriviality(output),
  };

  // Calculate composite score
  const rawScore = (
    scores.signalDensity * 0.20 +
    scores.strategicDepth * 0.20 +
    scores.originality * 0.15 +
    scores.actionability * 0.20 +
    scores.founderWow * 0.15 +
    scores.economicValue * 0.10
  );

  const totalPenalty = Object.values(penalties).reduce((a, b) => a + b, 0);
  const compositeScore = Math.max(0, rawScore - totalPenalty);

  // Determine verdict
  let verdict: QualityVerdict;
  let rejectionReason: string | undefined;
  const reasons: string[] = [];
  const improvementSuggestions: string[] = [];

  if (compositeScore < 45) {
    verdict = 'REJECT';
    rejectionReason = 'Quality score below threshold. This output does not meet the standard for founder-grade intelligence.';

    if (scores.signalDensity < 50) {
      reasons.push('Low signal density - too much filler, not enough insight');
      improvementSuggestions.push('Remove generic phrases and add specific numbers/actions');
    }
    if (scores.strategicDepth < 50) {
      reasons.push('Shallow analysis - no second-order thinking');
      improvementSuggestions.push('Add "because" and "which means" to show causal reasoning');
    }
    if (scores.originality < 50) {
      reasons.push('Obvious insight - visible in dashboard');
      improvementSuggestions.push('Synthesize across multiple data sources');
    }
    if (scores.actionability < 50) {
      reasons.push('Not actionable - no specific recommendation');
      improvementSuggestions.push('Add specific action, amount, and timeframe');
    }
    if (penalties.genericLanguage > 15) {
      reasons.push('Generic consultant-speak detected');
    }

  } else if (compositeScore < 65) {
    verdict = 'HOLD';
    reasons.push('Quality is borderline. Review before shipping.');

    if (scores.founderWow < 50) {
      improvementSuggestions.push('Add specific money impact or competitive insight');
    }
    if (penalties.verbosity > 15) {
      improvementSuggestions.push('Reduce length - more concise = more impact');
    }

  } else {
    verdict = 'SHIP';

    if (scores.founderWow >= 70) {
      reasons.push('High founder-wow factor');
    }
    if (scores.economicValue >= 70) {
      reasons.push('High economic value potential');
    }
    if (scores.originality >= 70) {
      reasons.push('Original insight - not easily found manually');
    }
  }

  return {
    scores,
    penalties,
    compositeScore: Math.round(compositeScore),
    verdict,
    reasons,
    rejectionReason,
    improvementSuggestions: improvementSuggestions.length > 0 ? improvementSuggestions : undefined,
  };
}

/**
 * Quick quality check - returns true only if output is shippable
 */
export function isShippable(output: IntelligenceOutput): boolean {
  const evaluation = evaluateQuality(output);
  return evaluation.verdict === 'SHIP';
}

/**
 * Generate "no insight available" response
 * Better to ship nothing than ship mediocrity
 */
export function generateNoInsightResponse(context: string): string {
  return `No high-confidence strategic insight available for ${context}.

Data was analyzed but did not reveal patterns that meet our quality threshold for founder-grade intelligence.

This is intentional: We only surface insights that provide genuine strategic value - not dashboard summaries or generic recommendations.

Next analysis scheduled to look for:
• Cross-platform patterns requiring synthesis
• Non-obvious behavioral signals
• Time-sensitive opportunities
• Hidden money leaks

If you need immediate guidance, we recommend reviewing the raw metrics directly.`;
}

// ============================================================================
// Quality Gate Wrappers
// ============================================================================

/**
 * Pre-generation validation
 * Check if we have enough data to generate quality intelligence
 */
export function validatePreGeneration(inputs: {
  dataPoints: number;
  timeRangeDays: number;
  hasComparison: boolean;
  crossSourceAvailable: boolean;
}): { valid: boolean; reason?: string } {
  if (inputs.dataPoints < 3) {
    return { valid: false, reason: 'Insufficient data points for meaningful analysis' };
  }

  if (inputs.timeRangeDays < 3) {
    return { valid: false, reason: 'Time range too short for pattern detection' };
  }

  if (!inputs.hasComparison && !inputs.crossSourceAvailable) {
    return { valid: false, reason: 'No baseline comparison or cross-source data available' };
  }

  return { valid: true };
}

/**
 * Wrap any intelligence generator with quality gates
 */
export async function withQualityGates<T extends IntelligenceOutput>(
  generator: () => Promise<T>,
  context: string
): Promise<T | { rejected: true; reason: string }> {
  const output = await generator();
  const evaluation = evaluateQuality(output);

  if (evaluation.verdict === 'REJECT') {
    console.log(`[QUALITY GATE] REJECTED: ${context}`);
    console.log(`  Composite Score: ${evaluation.compositeScore}`);
    console.log(`  Reasons: ${evaluation.reasons.join(', ')}`);

    return {
      rejected: true,
      reason: evaluation.rejectionReason || 'Quality threshold not met',
    };
  }

  if (evaluation.verdict === 'HOLD') {
    console.log(`[QUALITY GATE] HOLD for review: ${context}`);
    console.log(`  Composite Score: ${evaluation.compositeScore}`);
    // For now, still return but log warning
  }

  console.log(`[QUALITY GATE] SHIP: ${context} (Score: ${evaluation.compositeScore})`);
  return output;
}

export default {
  evaluateQuality,
  isShippable,
  generateNoInsightResponse,
  validatePreGeneration,
  withQualityGates,
  checkSignalSufficiency, // NEW: Signal sufficiency gate
  // Individual scorers for testing
  scoreSignalDensity,
  scoreStrategicDepth,
  scoreOriginality,
  scoreActionability,
  scoreFounderWow,
  scoreEconomicValue,
};
