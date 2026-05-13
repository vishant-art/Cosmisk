/**
 * Explainable Intelligence Quality Engine v2
 *
 * CRITICAL REDESIGN based on core insight:
 *
 * "No insight found" can mean TWO things:
 * 1. GOOD: System avoided hallucinated/generic filler (correct restraint)
 * 2. BAD: System failed to synthesize deeply (weak intelligence)
 *
 * For high-spend accounts, "nothing exists" is almost NEVER true.
 * The issue is almost always: WEAK SYNTHESIS, not ABSENT SIGNALS.
 *
 * This engine provides:
 * - EXPLAINABLE scoring with evidence
 * - Multi-signal confirmation tracking
 * - Shallow synthesis detection
 * - Hidden leverage discovery prompts
 * - Founder-grade quality standards
 */

// ============================================================================
// Types
// ============================================================================

export type SignalSource =
  | 'meta_ads'
  | 'shopify_orders'
  | 'shopify_customers'
  | 'ad_comments'
  | 'creative_performance'
  | 'cohort_analysis'
  | 'competitor_intel'
  | 'inventory_data'
  | 'discount_tracking'
  | 'audience_overlap'
  | 'attribution_data'
  | 'creator_performance'
  | 'funnel_behavior'
  | 'trust_signals'
  | 'pricing_data';

export interface SignalEvidence {
  source: SignalSource;
  dataPoint: string;
  value: string | number;
  confidence: number; // 0-1
  timestamp?: Date;
}

export interface QualityDimension {
  name: string;
  score: number; // 0-100
  weight: number; // 0-1
  evidence: string[];
  reasoning: string;
  benchmark: string;
}

export interface SynthesisDepthAnalysis {
  signalSourcesUsed: SignalSource[];
  signalSourcesMissed: SignalSource[];
  crossSignalCorrelations: number;
  causalChainsIdentified: number;
  secondOrderImplications: number;
  hiddenPatternSearchAttempts: string[];
  synthesisDepthScore: number; // 0-100
  verdict: 'DEEP' | 'MODERATE' | 'SHALLOW' | 'SURFACE';
}

export interface ExplainableQualityReport {
  overallScore: number;
  verdict: 'SHIP' | 'HOLD' | 'REJECT' | 'NEEDS_DEEPER_SYNTHESIS';
  dimensions: QualityDimension[];
  synthesisAnalysis: SynthesisDepthAnalysis;
  multiSignalConfirmation: {
    convergentSignals: string[];
    conflictingSignals: string[];
    unexaminedSignals: string[];
    confirmationStrength: number; // 0-100
  };
  confidenceBreakdown: {
    signalAgreement: number;
    statisticalSupport: number;
    temporalConsistency: number;
    behavioralConsistency: number;
    overallConfidence: number;
  };
  hiddenLeverageSearch: {
    areasSearched: string[];
    areasNotSearched: string[];
    potentialHiddenPatterns: string[];
    recommendedDeepDives: string[];
  };
  founderGradeAssessment: {
    wouldImpressFounder: boolean;
    reasoning: string;
    whatWouldMakeItBetter: string[];
  };
  finalExplanation: string;
}

export interface IntelligenceInput {
  clientId: string;
  reportType: string;
  content: string;
  recommendations: string[];
  signalEvidence: SignalEvidence[];
  economicImpactEstimate?: number;
  crossSourceSynthesis: boolean;
  synthesisAttempts?: string[]; // What correlations did we try?
}

// ============================================================================
// All Signal Sources (What SHOULD be examined for a high-spend account)
// ============================================================================

export const ALL_SIGNAL_SOURCES: SignalSource[] = [
  'meta_ads',
  'shopify_orders',
  'shopify_customers',
  'ad_comments',
  'creative_performance',
  'cohort_analysis',
  'competitor_intel',
  'inventory_data',
  'discount_tracking',
  'audience_overlap',
  'attribution_data',
  'creator_performance',
  'funnel_behavior',
  'trust_signals',
  'pricing_data',
];

// Hidden patterns that ALWAYS exist in high-spend accounts
export const HIDDEN_PATTERN_AREAS = [
  'audience fatigue micro-segments',
  'creator trust decay curves',
  'pricing elasticity by cohort',
  'attribution leakage points',
  'discount code cannibalization',
  'inventory velocity vs ad spend mismatch',
  'weekend vs weekday behavioral shifts',
  'new vs returning customer acquisition cost divergence',
  'creative hook saturation by audience segment',
  'competitor budget shift detection',
  'trust contamination from aggressive tactics',
  'cohort LTV decay patterns',
  'funnel stage dropout anomalies',
  'seasonal demand misalignment',
  'geographic efficiency variance',
];

// ============================================================================
// Dimension Scorers with Explainability
// ============================================================================

/**
 * Dimension 1: Strategic Novelty
 * Would a senior media buyer already know this?
 */
function scoreStrategicNovelty(input: IntelligenceInput): QualityDimension {
  const content = input.content.toLowerCase();
  let score = 50; // Start neutral
  const evidence: string[] = [];

  // Check for non-obvious synthesis
  const synthesisIndicators = [
    { pattern: /cross-referenced|synthesized|correlated/i, points: 15, desc: 'Cross-system synthesis present' },
    { pattern: /hidden|overlooked|missed|unnoticed/i, points: 12, desc: 'Hidden pattern identified' },
    { pattern: /unlike typical|contrary to|counterintuitive/i, points: 15, desc: 'Counterintuitive finding' },
    { pattern: /\d+ (sources|systems|signals)/i, points: 10, desc: 'Multi-signal synthesis' },
  ];

  synthesisIndicators.forEach(({ pattern, points, desc }) => {
    if (pattern.test(content)) {
      score += points;
      evidence.push(`+${points}: ${desc}`);
    }
  });

  // Penalize obvious observations
  const obviousPatterns = [
    { pattern: /roas (is|was) \d/i, points: -15, desc: 'Dashboard-visible ROAS statement' },
    { pattern: /ctr (is|was|at) \d/i, points: -10, desc: 'Basic CTR observation' },
    { pattern: /performance (improved|declined)/i, points: -8, desc: 'Generic performance statement' },
    { pattern: /spend (increased|decreased)/i, points: -8, desc: 'Obvious spend observation' },
  ];

  obviousPatterns.forEach(({ pattern, points, desc }) => {
    if (pattern.test(content)) {
      score += points;
      evidence.push(`${points}: ${desc}`);
    }
  });

  // Multi-source bonus
  const uniqueSources = new Set(input.signalEvidence.map(e => e.source)).size;
  if (uniqueSources >= 4) {
    score += 20;
    evidence.push(`+20: ${uniqueSources} signal sources used`);
  } else if (uniqueSources >= 2) {
    score += 10;
    evidence.push(`+10: ${uniqueSources} signal sources used`);
  } else {
    score -= 15;
    evidence.push(`-15: Only ${uniqueSources} signal source - likely surface-level`);
  }

  return {
    name: 'Strategic Novelty',
    score: Math.min(100, Math.max(0, score)),
    weight: 0.15,
    evidence,
    reasoning: score >= 70
      ? 'Insight requires synthesis that a media buyer couldn\'t easily do manually'
      : score >= 50
      ? 'Some novelty but could be partially visible in dashboards'
      : 'This insight is likely visible to anyone with dashboard access',
    benchmark: 'Elite (80+): Impossible without multi-system synthesis. Good (60-79): Would take significant manual effort.',
  };
}

/**
 * Dimension 2: Multi-Signal Confirmation
 * Was the insight validated across multiple systems?
 */
function scoreMultiSignalConfirmation(input: IntelligenceInput): QualityDimension {
  const sourcesUsed = new Set(input.signalEvidence.map(e => e.source));
  const evidence: string[] = [];

  // Count confirmation
  let score = 20; // Base
  const confirmationSources: string[] = [];

  ALL_SIGNAL_SOURCES.forEach(source => {
    if (sourcesUsed.has(source)) {
      confirmationSources.push(source);
    }
  });

  // Score based on confirmation breadth
  const confirmationCount = confirmationSources.length;
  if (confirmationCount >= 6) {
    score = 90;
    evidence.push(`+70: Strong confirmation across ${confirmationCount} sources`);
  } else if (confirmationCount >= 4) {
    score = 70;
    evidence.push(`+50: Good confirmation across ${confirmationCount} sources`);
  } else if (confirmationCount >= 2) {
    score = 50;
    evidence.push(`+30: Moderate confirmation across ${confirmationCount} sources`);
  } else {
    score = 25;
    evidence.push(`-5: Weak confirmation - only ${confirmationCount} source(s)`);
  }

  // List sources used
  evidence.push(`Sources: ${confirmationSources.join(', ')}`);

  // Cross-source synthesis bonus
  if (input.crossSourceSynthesis) {
    score += 10;
    evidence.push(`+10: Explicit cross-source synthesis performed`);
  }

  return {
    name: 'Multi-Signal Confirmation',
    score: Math.min(100, Math.max(0, score)),
    weight: 0.15,
    evidence,
    reasoning: confirmationCount >= 4
      ? 'Insight confirmed across multiple independent data sources'
      : 'Insight relies on limited data sources - should seek more confirmation',
    benchmark: 'Elite (80+): 6+ sources confirm. Good (60-79): 4-5 sources. Weak (<50): 1-2 sources.',
  };
}

/**
 * Dimension 3: Behavioral Depth
 * Does the insight explain WHY behavior is changing, not just WHAT happened?
 */
function scoreBehavioralDepth(input: IntelligenceInput): QualityDimension {
  const content = input.content.toLowerCase();
  let score = 30;
  const evidence: string[] = [];

  // WHY indicators
  const whyIndicators = [
    { pattern: /because|due to|driven by|caused by|as a result of/i, points: 15, desc: 'Causal explanation present' },
    { pattern: /the root cause|underlying reason|fundamentally/i, points: 20, desc: 'Root cause identified' },
    { pattern: /behavior(al)? shift|psychology|mindset|perception/i, points: 15, desc: 'Behavioral psychology insight' },
    { pattern: /trust|confidence|skepticism|doubt/i, points: 12, desc: 'Trust/confidence dynamics addressed' },
    { pattern: /fatigue|exhaustion|saturation|overexposure/i, points: 10, desc: 'Fatigue mechanics explained' },
  ];

  whyIndicators.forEach(({ pattern, points, desc }) => {
    if (pattern.test(content)) {
      score += points;
      evidence.push(`+${points}: ${desc}`);
    }
  });

  // Second-order implications
  if (/which means|this implies|therefore|consequently/i.test(content)) {
    score += 15;
    evidence.push('+15: Second-order implications explored');
  }

  // Penalize pure WHAT observations
  const whatOnlyPatterns = [
    { pattern: /^(your|the) .{0,20} (is|was|are|were) \d/im, points: -10, desc: 'Stat-only observation' },
  ];

  whatOnlyPatterns.forEach(({ pattern, points, desc }) => {
    if (pattern.test(content)) {
      score += points;
      evidence.push(`${points}: ${desc}`);
    }
  });

  // No causal language = major penalty
  if (!/because|due to|driven by|caused by|as a result/i.test(content)) {
    score -= 20;
    evidence.push('-20: No causal explanation - only describes WHAT, not WHY');
  }

  return {
    name: 'Behavioral Depth',
    score: Math.min(100, Math.max(0, score)),
    weight: 0.15,
    evidence,
    reasoning: score >= 70
      ? 'Insight explains WHY behavior is changing with causal reasoning'
      : score >= 50
      ? 'Some behavioral explanation but could go deeper'
      : 'Describes WHAT happened but not WHY - shallow analysis',
    benchmark: 'Elite (80+): Root cause + second-order implications. Good (60-79): Clear causal reasoning.',
  };
}

/**
 * Dimension 4: Economic Leverage
 * If acted upon, could this materially affect business metrics?
 */
function scoreEconomicLeverage(input: IntelligenceInput): QualityDimension {
  const evidence: string[] = [];
  let score = 30;

  // Economic impact estimate
  if (input.economicImpactEstimate) {
    const impact = input.economicImpactEstimate;
    if (impact >= 10000000) { // ₹1Cr+
      score = 95;
      evidence.push(`+65: ₹${(impact / 100000).toFixed(1)}L+ potential impact - transformational`);
    } else if (impact >= 1000000) { // ₹10L+
      score = 80;
      evidence.push(`+50: ₹${(impact / 100000).toFixed(1)}L potential impact - significant`);
    } else if (impact >= 100000) { // ₹1L+
      score = 60;
      evidence.push(`+30: ₹${(impact / 100000).toFixed(1)}L potential impact - meaningful`);
    } else {
      score = 40;
      evidence.push(`+10: ₹${(impact / 1000).toFixed(0)}K potential impact - minor`);
    }
  } else {
    evidence.push('-10: No economic impact estimated - unclear leverage');
  }

  // Check for leverage language
  const content = input.content.toLowerCase();
  const leverageIndicators = [
    { pattern: /₹[\d,]+\s*(lakh|L|cr|crore)/i, points: 10, desc: 'Specific rupee impact mentioned' },
    { pattern: /\d+%\s*(increase|decrease|improvement|reduction)/i, points: 8, desc: 'Percentage impact quantified' },
    { pattern: /cac|ltv|roas|profit margin/i, points: 5, desc: 'Key business metric addressed' },
    { pattern: /scale|scaling|growth/i, points: 5, desc: 'Growth/scaling implication' },
  ];

  leverageIndicators.forEach(({ pattern, points, desc }) => {
    if (pattern.test(content)) {
      score += points;
      evidence.push(`+${points}: ${desc}`);
    }
  });

  return {
    name: 'Economic Leverage',
    score: Math.min(100, Math.max(0, score)),
    weight: 0.15,
    evidence,
    reasoning: score >= 70
      ? 'Clear, quantified economic impact if acted upon'
      : score >= 50
      ? 'Some economic implication but not clearly quantified'
      : 'Unclear how this affects business economics',
    benchmark: 'Elite (80+): >₹10L quantified impact. Good (60-79): >₹1L impact. Weak (<50): Unquantified.',
  };
}

/**
 * Dimension 5: Actionability
 * Can operators immediately operationalize this?
 */
function scoreActionability(input: IntelligenceInput): QualityDimension {
  const evidence: string[] = [];
  let score = 20;

  if (input.recommendations.length === 0) {
    return {
      name: 'Actionability',
      score: 10,
      weight: 0.15,
      evidence: ['-40: No recommendations provided'],
      reasoning: 'No actionable recommendations - insight has no operational value',
      benchmark: 'Elite (80+): Specific action + timing + expected outcome. Good (60-79): Clear direction.',
    };
  }

  input.recommendations.forEach((rec, i) => {
    const recLower = rec.toLowerCase();

    // Specific action verbs
    const actionVerbs = ['pause', 'increase', 'decrease', 'shift', 'reallocate', 'launch', 'kill', 'duplicate', 'test', 'reduce', 'add', 'remove'];
    const hasActionVerb = actionVerbs.some(v => recLower.includes(v));
    if (hasActionVerb) {
      score += 10;
      evidence.push(`+10: Rec ${i + 1} has specific action verb`);
    }

    // Specific amounts
    if (/₹[\d,]+|by \d+%|\d+x/.test(rec)) {
      score += 8;
      evidence.push(`+8: Rec ${i + 1} has specific amount`);
    }

    // Specific timing
    if (/today|tomorrow|this week|next \d+ days|within \d+ hours|by \w+day|immediate/i.test(rec)) {
      score += 8;
      evidence.push(`+8: Rec ${i + 1} has specific timing`);
    }

    // Expected outcome
    if (/expect|should result|will likely|estimated|targeting/i.test(recLower)) {
      score += 6;
      evidence.push(`+6: Rec ${i + 1} has expected outcome`);
    }

    // Generic language penalty
    const genericPhrases = ['consider', 'explore', 'monitor', 'optimize', 'leverage', 'focus on'];
    const hasGeneric = genericPhrases.some(g => recLower.includes(g));
    if (hasGeneric) {
      score -= 8;
      evidence.push(`-8: Rec ${i + 1} uses generic language`);
    }
  });

  return {
    name: 'Actionability',
    score: Math.min(100, Math.max(0, score)),
    weight: 0.15,
    evidence,
    reasoning: score >= 70
      ? 'Recommendations are specific, timed, and measurable'
      : score >= 50
      ? 'Some direction but could be more specific'
      : 'Recommendations are vague - hard to operationalize',
    benchmark: 'Elite (80+): Action + amount + timing + outcome. Good (60-79): Specific action.',
  };
}

/**
 * Dimension 6: Founder-WOW Factor
 * Would a founder spending ₹50L/month think "This is genuinely insightful"?
 */
function scoreFounderWow(input: IntelligenceInput): QualityDimension {
  const content = input.content.toLowerCase();
  const evidence: string[] = [];
  let score = 30;

  // Hidden pattern revelation
  const hiddenPatternIndicators = [
    { pattern: /hidden|overlooked|missed|unnoticed|blind spot/i, points: 15, desc: 'Hidden pattern revealed' },
    { pattern: /your team|your operations|internally/i, points: 10, desc: 'Internal blind spot identified' },
    { pattern: /competitor.{0,30}(pulled back|shifted|opportunity)/i, points: 20, desc: 'Competitive intelligence' },
    { pattern: /window|opportunity.{0,20}(closing|limited|time-sensitive)/i, points: 15, desc: 'Time-sensitive opportunity' },
    { pattern: /root cause.{0,20}(is not|isn't|is NOT)/i, points: 15, desc: 'Root cause correction' },
    { pattern: /the issue is.{0,30}not/i, points: 10, desc: 'Common misconception corrected' },
    { pattern: /synthesis.{0,30}across|correlated.{0,20}sources/i, points: 15, desc: 'Cross-source synthesis' },
    { pattern: /\d+\s*sources|evidence.{0,20}synthesis/i, points: 10, desc: 'Multi-signal evidence' },
  ];

  hiddenPatternIndicators.forEach(({ pattern, points, desc }) => {
    if (pattern.test(content)) {
      score += points;
      evidence.push(`+${points}: ${desc}`);
    }
  });

  // Money leak/risk identification - expanded patterns
  if (/wasting|losing|bleeding|leaking|burning|at risk/i.test(content) && /₹[\d,.]+[LlKkCc]?/.test(content)) {
    score += 20;
    evidence.push('+20: Specific money at risk with amount');
  }

  // Economic impact with compounding
  if (/compounding|impact.{0,20}₹|ltv.{0,30}effect/i.test(content)) {
    score += 10;
    evidence.push('+10: Compounding economic impact identified');
  }

  // Genuine surprise element - expanded
  if (/surprisingly|unexpectedly|contrary to|despite|is not.{0,30}it's|is NOT/i.test(content)) {
    score += 10;
    evidence.push('+10: Counterintuitive finding');
  }

  // Penalty for generic consulting language
  const genericPatterns = [
    'based on best practices',
    'industry standards',
    'moving forward',
    'low-hanging fruit',
    'quick wins',
  ];
  genericPatterns.forEach(pattern => {
    if (content.includes(pattern)) {
      score -= 10;
      evidence.push(`-10: Generic consulting language: "${pattern}"`);
    }
  });

  return {
    name: 'Founder-WOW Factor',
    score: Math.min(100, Math.max(0, score)),
    weight: 0.15,
    evidence,
    reasoning: score >= 70
      ? 'This insight reveals something the team likely missed - genuinely valuable'
      : score >= 50
      ? 'Somewhat useful but founder might have suspected this already'
      : 'Generic insight - founder would likely think "we already knew this"',
    benchmark: 'Elite (80+): "How did we miss this?" Good (60-79): "Useful to know." Weak (<50): "Obvious."',
  };
}

/**
 * Dimension 7: Signal Density
 * How much strategic value per sentence?
 */
function scoreSignalDensity(input: IntelligenceInput): QualityDimension {
  const content = input.content;
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const evidence: string[] = [];

  if (sentences.length === 0) {
    return {
      name: 'Signal Density',
      score: 20,
      weight: 0.05,
      evidence: ['-30: No substantive sentences'],
      reasoning: 'Content lacks substance',
      benchmark: 'Elite (80+): >2 insights per paragraph. Good (60-79): Clear signal throughout.',
    };
  }

  let signalSentences = 0;
  let fillerSentences = 0;

  sentences.forEach(sentence => {
    const s = sentence.toLowerCase();

    // Check for signal content
    const hasNumber = /₹[\d,]+|\d+%|\d+x|\d+\.\d+/.test(sentence);
    const hasCausal = /because|therefore|which means|driven by/.test(s);
    const hasSpecific = /specifically|particular|exact/.test(s);
    const hasInsight = /hidden|revealed|discovered|identified|detected/.test(s);

    if (hasNumber || hasCausal || hasSpecific || hasInsight) {
      signalSentences++;
    }

    // Check for filler
    const fillerPhrases = [
      'it\'s important to note',
      'based on our analysis',
      'moving forward',
      'as mentioned',
      'needless to say',
    ];
    if (fillerPhrases.some(f => s.includes(f))) {
      fillerSentences++;
    }
  });

  const signalRatio = signalSentences / sentences.length;
  const fillerRatio = fillerSentences / sentences.length;

  let score = 50;
  score += signalRatio * 40;
  score -= fillerRatio * 30;

  evidence.push(`Signal sentences: ${signalSentences}/${sentences.length} (${(signalRatio * 100).toFixed(0)}%)`);
  evidence.push(`Filler sentences: ${fillerSentences}/${sentences.length} (${(fillerRatio * 100).toFixed(0)}%)`);

  return {
    name: 'Signal Density',
    score: Math.min(100, Math.max(0, Math.round(score))),
    weight: 0.05,
    evidence,
    reasoning: signalRatio > 0.6
      ? 'High signal-to-noise ratio - content is dense with value'
      : signalRatio > 0.4
      ? 'Moderate signal density - some filler could be removed'
      : 'Low signal density - too much filler, not enough insight',
    benchmark: 'Elite (80+): >70% signal sentences. Good (60-79): >50% signal.',
  };
}

/**
 * Dimension 8: Predictive Power
 * Does the insight forecast future behavior?
 */
function scorePredictivePower(input: IntelligenceInput): QualityDimension {
  const content = input.content.toLowerCase();
  const evidence: string[] = [];
  let score = 30;

  const predictiveIndicators = [
    { pattern: /will likely|expect(ed)? to|forecast|predict|anticipate/i, points: 15, desc: 'Forward-looking prediction' },
    { pattern: /in the next \d+|over the coming|by end of/i, points: 12, desc: 'Time-bound forecast' },
    { pattern: /if (this|you|we) .{0,30} then/i, points: 10, desc: 'Conditional prediction' },
    { pattern: /trend(ing)?|trajectory|heading|direction/i, points: 8, desc: 'Trend identification' },
    { pattern: /before (it|they|this)|window closing/i, points: 15, desc: 'Urgency prediction' },
  ];

  predictiveIndicators.forEach(({ pattern, points, desc }) => {
    if (pattern.test(content)) {
      score += points;
      evidence.push(`+${points}: ${desc}`);
    }
  });

  // Pure historical reporting penalty
  if (/last week|yesterday|previous|past \d+/i.test(content) &&
      !/will|expect|predict|forecast|future/i.test(content)) {
    score -= 15;
    evidence.push('-15: Historical reporting only - no forward prediction');
  }

  return {
    name: 'Predictive Power',
    score: Math.min(100, Math.max(0, score)),
    weight: 0.05,
    evidence,
    reasoning: score >= 70
      ? 'Insight includes actionable predictions about future behavior'
      : score >= 50
      ? 'Some forward-looking elements but mostly historical'
      : 'Pure historical reporting - no predictive value',
    benchmark: 'Elite (80+): Clear time-bound predictions. Good (60-79): Trend direction identified.',
  };
}

// ============================================================================
// Synthesis Depth Analysis
// ============================================================================

function analyzeSynthesisDepth(input: IntelligenceInput): SynthesisDepthAnalysis {
  const sourcesUsed = new Set(input.signalEvidence.map(e => e.source));
  const sourcesMissed = ALL_SIGNAL_SOURCES.filter(s => !sourcesUsed.has(s));

  // Count correlations
  const content = input.content.toLowerCase();
  const correlationPatterns = [
    /correlated with/gi,
    /combined with/gi,
    /alongside/gi,
    /together with/gi,
    /cross-referenced/gi,
  ];
  let crossSignalCorrelations = 0;
  correlationPatterns.forEach(p => {
    const matches = content.match(p);
    if (matches) crossSignalCorrelations += matches.length;
  });

  // Count causal chains
  const causalPatterns = [
    /because .{10,100} therefore/gi,
    /which means .{10,100} which leads to/gi,
    /driven by .{10,100} resulting in/gi,
  ];
  let causalChains = 0;
  causalPatterns.forEach(p => {
    if (p.test(content)) causalChains++;
  });

  // Second-order implications
  const secondOrderPatterns = [/the implication|this suggests|this means that|consequently/gi];
  let secondOrder = 0;
  secondOrderPatterns.forEach(p => {
    const matches = content.match(p);
    if (matches) secondOrder += matches.length;
  });

  // Hidden pattern search attempts
  const hiddenPatternSearchAttempts = input.synthesisAttempts || [];

  // Calculate synthesis depth score
  let synthesisScore = 20; // Base
  synthesisScore += sourcesUsed.size * 8;
  synthesisScore += crossSignalCorrelations * 10;
  synthesisScore += causalChains * 15;
  synthesisScore += secondOrder * 10;
  synthesisScore = Math.min(100, synthesisScore);

  let verdict: 'DEEP' | 'MODERATE' | 'SHALLOW' | 'SURFACE';
  if (synthesisScore >= 75) verdict = 'DEEP';
  else if (synthesisScore >= 55) verdict = 'MODERATE';
  else if (synthesisScore >= 35) verdict = 'SHALLOW';
  else verdict = 'SURFACE';

  return {
    signalSourcesUsed: Array.from(sourcesUsed),
    signalSourcesMissed: sourcesMissed,
    crossSignalCorrelations,
    causalChainsIdentified: causalChains,
    secondOrderImplications: secondOrder,
    hiddenPatternSearchAttempts,
    synthesisDepthScore: synthesisScore,
    verdict,
  };
}

// ============================================================================
// Hidden Leverage Discovery Analysis
// ============================================================================

function analyzeHiddenLeverageSearch(input: IntelligenceInput): {
  areasSearched: string[];
  areasNotSearched: string[];
  potentialHiddenPatterns: string[];
  recommendedDeepDives: string[];
} {
  const content = input.content.toLowerCase();
  const areasSearched: string[] = [];
  const areasNotSearched: string[] = [];

  HIDDEN_PATTERN_AREAS.forEach(area => {
    const keywords = area.toLowerCase().split(' ');
    const found = keywords.some(k => content.includes(k));
    if (found) {
      areasSearched.push(area);
    } else {
      areasNotSearched.push(area);
    }
  });

  // For high-spend accounts, recommend what SHOULD be searched
  const recommendedDeepDives = areasNotSearched.slice(0, 5).map(area =>
    `Search for ${area} - high probability of hidden inefficiency`
  );

  // Identify potential patterns based on what was found
  const potentialHiddenPatterns: string[] = [];
  if (content.includes('fatigue') || content.includes('decay')) {
    potentialHiddenPatterns.push('Likely more granular fatigue segments exist - analyze by sub-audience');
  }
  if (content.includes('competitor')) {
    potentialHiddenPatterns.push('Competitor shifts usually cascade - look for secondary effects');
  }
  if (content.includes('cohort') || content.includes('customer')) {
    potentialHiddenPatterns.push('Cohort patterns often hide micro-segments with 10x variance');
  }

  return {
    areasSearched,
    areasNotSearched,
    potentialHiddenPatterns,
    recommendedDeepDives,
  };
}

// ============================================================================
// Main Explainable Quality Evaluation
// ============================================================================

export function evaluateExplainableQuality(input: IntelligenceInput): ExplainableQualityReport {
  // Calculate all dimensions
  const dimensions: QualityDimension[] = [
    scoreStrategicNovelty(input),
    scoreMultiSignalConfirmation(input),
    scoreBehavioralDepth(input),
    scoreEconomicLeverage(input),
    scoreActionability(input),
    scoreFounderWow(input),
    scoreSignalDensity(input),
    scorePredictivePower(input),
  ];

  // Calculate weighted overall score
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const weightedScore = dimensions.reduce((sum, d) => sum + (d.score * d.weight), 0) / totalWeight;
  const overallScore = Math.round(weightedScore);

  // Synthesis analysis
  const synthesisAnalysis = analyzeSynthesisDepth(input);

  // Multi-signal confirmation
  const sourcesUsed = new Set(input.signalEvidence.map(e => e.source));
  const convergentSignals: string[] = [];
  const conflictingSignals: string[] = [];

  // Group evidence by theme and check convergence
  input.signalEvidence.forEach(e => {
    convergentSignals.push(`${e.source}: ${e.dataPoint}`);
  });

  const unexaminedSignals = ALL_SIGNAL_SOURCES.filter(s => !sourcesUsed.has(s));

  // Confidence breakdown
  const signalAgreement = input.signalEvidence.length >= 3 ? 70 : 40;
  const statisticalSupport = input.signalEvidence.filter(e => e.confidence > 0.7).length * 15;
  const temporalConsistency = input.signalEvidence.some(e => e.timestamp) ? 60 : 40;
  const behavioralConsistency = /pattern|consistent|repeatedly/i.test(input.content) ? 70 : 40;
  const overallConfidence = Math.min(100, (signalAgreement + statisticalSupport + temporalConsistency + behavioralConsistency) / 4);

  // Hidden leverage analysis
  const hiddenLeverageSearch = analyzeHiddenLeverageSearch(input);

  // Founder-grade assessment
  const founderDimension = dimensions.find(d => d.name === 'Founder-WOW Factor')!;
  const wouldImpressFounder = founderDimension.score >= 60;
  const whatWouldMakeItBetter: string[] = [];

  if (!wouldImpressFounder) {
    if (founderDimension.score < 40) {
      whatWouldMakeItBetter.push('Identify a hidden pattern the team missed');
      whatWouldMakeItBetter.push('Quantify specific money at risk');
      whatWouldMakeItBetter.push('Find a competitive insight');
    }
    whatWouldMakeItBetter.push('Add time-sensitive urgency');
  }

  // Determine verdict
  let verdict: 'SHIP' | 'HOLD' | 'REJECT' | 'NEEDS_DEEPER_SYNTHESIS';

  if (overallScore >= 65 && synthesisAnalysis.verdict !== 'SURFACE') {
    verdict = 'SHIP';
  } else if (synthesisAnalysis.verdict === 'SURFACE' || synthesisAnalysis.verdict === 'SHALLOW') {
    verdict = 'NEEDS_DEEPER_SYNTHESIS';
  } else if (overallScore >= 45) {
    verdict = 'HOLD';
  } else {
    verdict = 'REJECT';
  }

  // Generate final explanation
  let finalExplanation: string;
  if (verdict === 'SHIP') {
    finalExplanation = `Quality Score: ${overallScore}/100. This insight meets founder-grade standards with ${synthesisAnalysis.signalSourcesUsed.length} signal sources and ${synthesisAnalysis.verdict.toLowerCase()} synthesis depth.`;
  } else if (verdict === 'NEEDS_DEEPER_SYNTHESIS') {
    finalExplanation = `Quality Score: ${overallScore}/100. Synthesis depth is ${synthesisAnalysis.verdict}. For a high-spend account, hidden patterns almost certainly exist. The issue is weak synthesis, NOT absent signals. Recommended: Search ${hiddenLeverageSearch.areasNotSearched.slice(0, 3).join(', ')}.`;
  } else if (verdict === 'HOLD') {
    finalExplanation = `Quality Score: ${overallScore}/100. Borderline quality. Key gaps: ${dimensions.filter(d => d.score < 50).map(d => d.name).join(', ')}.`;
  } else {
    finalExplanation = `Quality Score: ${overallScore}/100. Below threshold. Major issues: ${dimensions.filter(d => d.score < 40).map(d => d.name).join(', ')}.`;
  }

  return {
    overallScore,
    verdict,
    dimensions,
    synthesisAnalysis,
    multiSignalConfirmation: {
      convergentSignals,
      conflictingSignals,
      unexaminedSignals,
      confirmationStrength: dimensions.find(d => d.name === 'Multi-Signal Confirmation')?.score || 0,
    },
    confidenceBreakdown: {
      signalAgreement,
      statisticalSupport: Math.min(100, statisticalSupport),
      temporalConsistency,
      behavioralConsistency,
      overallConfidence,
    },
    hiddenLeverageSearch,
    founderGradeAssessment: {
      wouldImpressFounder,
      reasoning: founderDimension.reasoning,
      whatWouldMakeItBetter,
    },
    finalExplanation,
  };
}

// ============================================================================
// Intelligent "No Insight" Response
// ============================================================================

export function generateIntelligentNoInsightResponse(
  clientId: string,
  reportType: string,
  synthesisAnalysis: SynthesisDepthAnalysis,
  hiddenLeverageSearch: ReturnType<typeof analyzeHiddenLeverageSearch>
): string {
  const missedSources = synthesisAnalysis.signalSourcesMissed.slice(0, 5);
  const recommendedSearches = hiddenLeverageSearch.recommendedDeepDives.slice(0, 3);

  // NEVER say "nothing exists" - say what wasn't searched
  return `
## No High-Confidence Cross-Signal Insight Found

**Client:** ${clientId}
**Report:** ${reportType}
**Synthesis Depth:** ${synthesisAnalysis.verdict}

### What This Means

This does NOT mean "no patterns exist."

For a high-spend account, hidden inefficiencies ALWAYS exist:
- Audience fatigue micro-segments
- Creator trust decay
- Pricing elasticity variance
- Attribution leakage
- Cohort LTV anomalies

### The Issue: Synthesis Depth

${synthesisAnalysis.verdict === 'SURFACE' || synthesisAnalysis.verdict === 'SHALLOW'
  ? 'Current analysis is too shallow. We examined only ' + synthesisAnalysis.signalSourcesUsed.length + ' signal sources.'
  : 'Analysis used ' + synthesisAnalysis.signalSourcesUsed.length + ' sources but did not find convergent patterns meeting confidence threshold.'}

### Signal Sources NOT Examined

${missedSources.map(s => `- ${s}`).join('\n')}

### Recommended Deep Dives

${recommendedSearches.map(s => `- ${s}`).join('\n')}

### Hidden Patterns to Search

${hiddenLeverageSearch.potentialHiddenPatterns.length > 0
  ? hiddenLeverageSearch.potentialHiddenPatterns.map(p => `- ${p}`).join('\n')
  : '- Examine cross-platform correlation between ad fatigue and Shopify cohort retention\n- Search for weekend/weekday behavioral variance by audience segment\n- Look for discount code usage patterns affecting repeat purchase rate'}

---

**Action Required:** Run deeper synthesis across missed signal sources before concluding "no insight exists."
`;
}

export default {
  evaluateExplainableQuality,
  generateIntelligentNoInsightResponse,
  ALL_SIGNAL_SOURCES,
  HIDDEN_PATTERN_AREAS,
};
