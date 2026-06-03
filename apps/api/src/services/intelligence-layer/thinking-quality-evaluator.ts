/**
 * Thinking Quality Evaluator
 *
 * Evaluates the QUALITY OF REASONING, not just output quality.
 *
 * For ₹50L+/month accounts, we don't just ask "Does the output look good?"
 * We ask "Was the THINKING that produced this elite-level?"
 *
 * 9 Dimensions of Thinking Quality:
 * 1. Hypothesis Depth - Were multiple explanations considered?
 * 2. Evidence Search - Was contradicting evidence actively sought?
 * 3. Causal Reasoning - Is the "why" explained, not just "what"?
 * 4. Assumption Exposure - Are hidden assumptions surfaced?
 * 5. Contradiction Handling - Are conflicts in data addressed?
 * 6. Second-Order Thinking - Are downstream effects considered?
 * 7. Strategic Originality - Is this insight non-obvious?
 * 8. Hidden Leverage Search - Was invisible opportunity actively sought?
 * 9. Behavioral Interpretation - Are human behaviors explained?
 */

// ============================================================================
// Types
// ============================================================================

export interface HypothesisRecord {
  hypothesis: string;
  tested: boolean;
  evidence: string[];
  confidence: number;
  disproven: boolean;
}

export interface CausalChain {
  cause: string;
  effect: string;
  confidence: number;
}

export interface ThinkingTrace {
  // What hypotheses were generated and tested
  hypotheses: HypothesisRecord[];

  // What evidence was searched
  evidenceSearched: {
    source: string;
    lookingFor: string;
    found: boolean;
    finding?: string;
  }[];

  // Causal reasoning chains
  causalChains: CausalChain[];

  // Assumptions identified
  assumptions: {
    assumption: string;
    challenged: boolean;
    risk?: string;
  }[];

  // Contradictions found
  contradictions: {
    statement1: string;
    statement2: string;
    resolved: boolean;
    resolution?: string;
  }[];

  // Second-order consequences considered
  consequences: {
    action: string;
    firstOrder: string;
    secondOrder?: string;
    thirdOrder?: string;
  }[];

  // Hidden leverage areas searched
  hiddenLeverageSearched: {
    area: string;
    searched: boolean;
    found: boolean;
    finding?: string;
  }[];

  // Behavioral interpretations made
  behavioralInterpretations: {
    metric: string;
    behavioralMeaning: string;
    confidence: number;
  }[];
}

export interface ThinkingDimensionScore {
  dimension: string;
  score: number; // 0-100
  weight: number;
  weightedContribution: number;
  evidence: string[];
  benchmark: string;
  failedBecause?: string;
  howToImprove?: string;
}

export interface ThinkingQualityEvaluation {
  // Individual dimensions
  hypothesisDepth: ThinkingDimensionScore;
  evidenceSearch: ThinkingDimensionScore;
  causalReasoning: ThinkingDimensionScore;
  assumptionExposure: ThinkingDimensionScore;
  contradictionHandling: ThinkingDimensionScore;
  secondOrderThinking: ThinkingDimensionScore;
  strategicOriginality: ThinkingDimensionScore;
  hiddenLeverageSearch: ThinkingDimensionScore;
  behavioralInterpretation: ThinkingDimensionScore;

  // Aggregate
  allDimensions: ThinkingDimensionScore[];
  overallThinkingScore: number;
  verdict: 'ELITE_REASONING' | 'ADEQUATE_REASONING' | 'SHALLOW_REASONING' | 'NO_REASONING';
  improvementRequired: string[];
  humanReadableExplanation: string;
}

// ============================================================================
// Dimension Weights
// ============================================================================

const DIMENSION_WEIGHTS = {
  hypothesisDepth: 0.15,
  evidenceSearch: 0.15,
  causalReasoning: 0.15,
  assumptionExposure: 0.10,
  contradictionHandling: 0.10,
  secondOrderThinking: 0.10,
  strategicOriginality: 0.10,
  hiddenLeverageSearch: 0.10,
  behavioralInterpretation: 0.05,
};

// ============================================================================
// Scoring Functions
// ============================================================================

function scoreHypothesisDepth(trace: ThinkingTrace): ThinkingDimensionScore {
  const hypotheses = trace.hypotheses;
  const tested = hypotheses.filter(h => h.tested);
  const disproven = hypotheses.filter(h => h.disproven);

  let score = 20; // Base
  const evidence: string[] = [];

  // Score based on number of hypotheses
  if (hypotheses.length >= 3) {
    score += 30;
    evidence.push(`+30: ${hypotheses.length} hypotheses generated`);
  } else if (hypotheses.length >= 2) {
    score += 15;
    evidence.push(`+15: ${hypotheses.length} hypotheses generated`);
  } else if (hypotheses.length === 1) {
    evidence.push(`+0: Only 1 hypothesis - single-explanation thinking`);
  } else {
    score -= 10;
    evidence.push(`-10: No hypotheses generated`);
  }

  // Score based on testing
  if (tested.length >= 2) {
    score += 25;
    evidence.push(`+25: ${tested.length} hypotheses tested with evidence`);
  } else if (tested.length === 1) {
    score += 10;
    evidence.push(`+10: 1 hypothesis tested`);
  }

  // Score based on disproven hypotheses (shows intellectual rigor)
  if (disproven.length >= 1) {
    score += 15;
    evidence.push(`+15: ${disproven.length} hypotheses disproven - shows rigor`);
  }

  // Check if alternative explanations were considered
  if (hypotheses.length === 1 && !disproven.length) {
    score -= 15;
    evidence.push(`-15: Single hypothesis assumed without alternatives`);
  }

  const failedBecause = score < 60 ? 'Not enough alternative explanations explored' : undefined;
  const howToImprove = score < 60 ? 'Generate 3+ hypotheses, test each with evidence, actively try to disprove' : undefined;

  return {
    dimension: 'Hypothesis Depth',
    score: Math.min(100, Math.max(0, score)),
    weight: DIMENSION_WEIGHTS.hypothesisDepth,
    weightedContribution: Math.min(100, Math.max(0, score)) * DIMENSION_WEIGHTS.hypothesisDepth,
    evidence,
    benchmark: 'Elite (90+): 3+ hypotheses tested, 1+ disproven. Good (70-89): 2+ hypotheses tested.',
    failedBecause,
    howToImprove,
  };
}

function scoreEvidenceSearch(trace: ThinkingTrace): ThinkingDimensionScore {
  const searches = trace.evidenceSearched;
  const found = searches.filter(s => s.found);

  let score = 20;
  const evidence: string[] = [];

  // Score based on number of sources searched
  if (searches.length >= 5) {
    score += 30;
    evidence.push(`+30: ${searches.length} evidence sources searched`);
  } else if (searches.length >= 3) {
    score += 20;
    evidence.push(`+20: ${searches.length} evidence sources searched`);
  } else if (searches.length >= 1) {
    score += 10;
    evidence.push(`+10: ${searches.length} evidence sources searched`);
  } else {
    score -= 10;
    evidence.push(`-10: No evidence search conducted`);
  }

  // Check for disconfirming evidence search
  const disconfirmingSearches = searches.filter(s =>
    s.lookingFor.toLowerCase().includes('contradict') ||
    s.lookingFor.toLowerCase().includes('disprove') ||
    s.lookingFor.toLowerCase().includes('against') ||
    s.lookingFor.toLowerCase().includes('opposite')
  );

  if (disconfirmingSearches.length >= 1) {
    score += 25;
    evidence.push(`+25: Actively searched for disconfirming evidence`);
  } else {
    score -= 10;
    evidence.push(`-10: No disconfirming evidence search`);
  }

  // Score based on evidence found
  if (found.length >= 3) {
    score += 15;
    evidence.push(`+15: Found substantive evidence in ${found.length} sources`);
  }

  const failedBecause = score < 60 ? 'Did not actively search for contradicting evidence' : undefined;
  const howToImprove = score < 60 ? 'Search 5+ sources, explicitly look for evidence that would DISPROVE the hypothesis' : undefined;

  return {
    dimension: 'Evidence Search',
    score: Math.min(100, Math.max(0, score)),
    weight: DIMENSION_WEIGHTS.evidenceSearch,
    weightedContribution: Math.min(100, Math.max(0, score)) * DIMENSION_WEIGHTS.evidenceSearch,
    evidence,
    benchmark: 'Elite (90+): 5+ sources, disconfirming evidence sought. Good (70-89): 3+ sources.',
    failedBecause,
    howToImprove,
  };
}

function scoreCausalReasoning(trace: ThinkingTrace): ThinkingDimensionScore {
  const chains = trace.causalChains;

  let score = 20;
  const evidence: string[] = [];

  // Calculate max chain depth
  let maxDepth = 0;
  if (chains.length > 0) {
    // Simple heuristic: count chains as depth indicators
    maxDepth = Math.min(chains.length, 4);
  }

  if (maxDepth >= 3) {
    score += 40;
    evidence.push(`+40: ${maxDepth}-level causal chain (multi-level reasoning)`);
  } else if (maxDepth >= 2) {
    score += 25;
    evidence.push(`+25: ${maxDepth}-level causal chain`);
  } else if (maxDepth === 1) {
    score += 10;
    evidence.push(`+10: Single-level causal reasoning`);
  } else {
    score -= 10;
    evidence.push(`-10: No causal reasoning - just correlation`);
  }

  // Check for root cause investigation
  const rootCauseIndicators = chains.filter(c =>
    c.cause.toLowerCase().includes('root') ||
    c.cause.toLowerCase().includes('underlying') ||
    c.cause.toLowerCase().includes('fundamental')
  );

  if (rootCauseIndicators.length >= 1) {
    score += 20;
    evidence.push(`+20: Root cause investigation conducted`);
  }

  // Check confidence levels
  const highConfidenceChains = chains.filter(c => c.confidence >= 0.7);
  if (highConfidenceChains.length >= 2) {
    score += 10;
    evidence.push(`+10: ${highConfidenceChains.length} high-confidence causal links`);
  }

  const failedBecause = score < 60 ? 'Only single-level cause identified, no root cause' : undefined;
  const howToImprove = score < 60 ? 'Ask "why" 3+ times. Trace to root cause. Consider alternative causes.' : undefined;

  return {
    dimension: 'Causal Reasoning',
    score: Math.min(100, Math.max(0, score)),
    weight: DIMENSION_WEIGHTS.causalReasoning,
    weightedContribution: Math.min(100, Math.max(0, score)) * DIMENSION_WEIGHTS.causalReasoning,
    evidence,
    benchmark: 'Elite (90+): 3+ level causal chain with root cause. Good (70-89): 2-level chain.',
    failedBecause,
    howToImprove,
  };
}

function scoreAssumptionExposure(trace: ThinkingTrace): ThinkingDimensionScore {
  const assumptions = trace.assumptions;
  const challenged = assumptions.filter(a => a.challenged);
  const withRisks = assumptions.filter(a => a.risk);

  let score = 30;
  const evidence: string[] = [];

  if (assumptions.length >= 3) {
    score += 25;
    evidence.push(`+25: ${assumptions.length} hidden assumptions surfaced`);
  } else if (assumptions.length >= 1) {
    score += 15;
    evidence.push(`+15: ${assumptions.length} assumptions identified`);
  } else {
    score -= 15;
    evidence.push(`-15: No assumptions identified (they always exist)`);
  }

  if (challenged.length >= 2) {
    score += 25;
    evidence.push(`+25: ${challenged.length} assumptions actively challenged`);
  } else if (challenged.length === 1) {
    score += 10;
    evidence.push(`+10: 1 assumption challenged`);
  }

  if (withRisks.length >= 1) {
    score += 10;
    evidence.push(`+10: Assumption risks identified`);
  }

  const failedBecause = score < 60 ? 'Hidden assumptions not surfaced or challenged' : undefined;
  const howToImprove = score < 60 ? 'List 3+ assumptions underlying the analysis, challenge each, identify risks if wrong' : undefined;

  return {
    dimension: 'Assumption Exposure',
    score: Math.min(100, Math.max(0, score)),
    weight: DIMENSION_WEIGHTS.assumptionExposure,
    weightedContribution: Math.min(100, Math.max(0, score)) * DIMENSION_WEIGHTS.assumptionExposure,
    evidence,
    benchmark: 'Elite (90+): 3+ assumptions surfaced and challenged. Good (70-89): 2+ assumptions.',
    failedBecause,
    howToImprove,
  };
}

function scoreContradictionHandling(trace: ThinkingTrace): ThinkingDimensionScore {
  const contradictions = trace.contradictions;
  const resolved = contradictions.filter(c => c.resolved);

  let score = 40; // Higher base - contradictions may not always exist
  const evidence: string[] = [];

  if (contradictions.length >= 2) {
    score += 20;
    evidence.push(`+20: ${contradictions.length} contradictions identified`);
  } else if (contradictions.length === 1) {
    score += 10;
    evidence.push(`+10: 1 contradiction identified`);
  }

  if (resolved.length >= 1) {
    score += 30;
    evidence.push(`+30: ${resolved.length} contradictions resolved with explanation`);
  } else if (contradictions.length > 0) {
    score -= 20;
    evidence.push(`-20: Contradictions found but not resolved`);
  }

  // Penalty for ignoring contradictions
  const unresolved = contradictions.length - resolved.length;
  if (unresolved > 0) {
    score -= unresolved * 10;
    evidence.push(`-${unresolved * 10}: ${unresolved} contradictions left unresolved`);
  }

  const failedBecause = score < 60 ? 'Data contradictions ignored or unresolved' : undefined;
  const howToImprove = score < 60 ? 'Actively look for contradicting data, explain why contradictions exist, resolve them' : undefined;

  return {
    dimension: 'Contradiction Handling',
    score: Math.min(100, Math.max(0, score)),
    weight: DIMENSION_WEIGHTS.contradictionHandling,
    weightedContribution: Math.min(100, Math.max(0, score)) * DIMENSION_WEIGHTS.contradictionHandling,
    evidence,
    benchmark: 'Elite (90+): Contradictions found and resolved. Good (70-89): Contradictions acknowledged.',
    failedBecause,
    howToImprove,
  };
}

function scoreSecondOrderThinking(trace: ThinkingTrace): ThinkingDimensionScore {
  const consequences = trace.consequences;

  let score = 20;
  const evidence: string[] = [];

  // Count consequence depth
  const withSecondOrder = consequences.filter(c => c.secondOrder);
  const withThirdOrder = consequences.filter(c => c.thirdOrder);

  if (withThirdOrder.length >= 1) {
    score += 40;
    evidence.push(`+40: Third-order consequences considered`);
  } else if (withSecondOrder.length >= 2) {
    score += 30;
    evidence.push(`+30: ${withSecondOrder.length} second-order consequences considered`);
  } else if (withSecondOrder.length === 1) {
    score += 20;
    evidence.push(`+20: 1 second-order consequence considered`);
  } else if (consequences.length > 0) {
    score += 10;
    evidence.push(`+10: First-order consequences only`);
  } else {
    score -= 10;
    evidence.push(`-10: No consequence thinking`);
  }

  // Check for unintended consequences
  const unintendedMentioned = consequences.some(c =>
    c.secondOrder?.toLowerCase().includes('unintended') ||
    c.thirdOrder?.toLowerCase().includes('unintended') ||
    c.secondOrder?.toLowerCase().includes('risk') ||
    c.thirdOrder?.toLowerCase().includes('risk')
  );

  if (unintendedMentioned) {
    score += 20;
    evidence.push(`+20: Unintended consequences/risks considered`);
  }

  const failedBecause = score < 60 ? 'Only immediate effects considered, no downstream thinking' : undefined;
  const howToImprove = score < 60 ? 'For each recommendation, ask "then what?" 2-3 times. Consider unintended consequences.' : undefined;

  return {
    dimension: 'Second-Order Thinking',
    score: Math.min(100, Math.max(0, score)),
    weight: DIMENSION_WEIGHTS.secondOrderThinking,
    weightedContribution: Math.min(100, Math.max(0, score)) * DIMENSION_WEIGHTS.secondOrderThinking,
    evidence,
    benchmark: 'Elite (90+): 3rd-order consequences + unintended effects. Good (70-89): 2nd-order.',
    failedBecause,
    howToImprove,
  };
}

function scoreStrategicOriginality(trace: ThinkingTrace, content: string): ThinkingDimensionScore {
  let score = 30;
  const evidence: string[] = [];

  // Check for EXPLANATORY context (reduces penalties for dashboard terms used analytically)
  const explanatoryPatterns = [
    /root cause.{0,30}(is not|isn't|is NOT)/i,
    /not.{0,20}(creative fatigue|audience fatigue)/i,
    /rather than.{0,20}(fatigue|decline)/i,
    /the issue is.{0,30}not/i,
    /this is.{0,30}because/i,
    /investigating.{0,20}(sources|signals|data)/i,
    /after.{0,20}(analyzing|investigating|examining)/i,
  ];

  let explanatoryContext = 0;
  explanatoryPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      explanatoryContext++;
    }
  });

  // Check for dashboard-level insights (PENALTY - reduced if explanatory context)
  const dashboardPatterns = [
    /ROAS (dropped|declined|increased)/i,
    /CTR is (low|high|declining)/i,
    /CPA (spiked|dropped)/i,
    /test new creatives/i,
    /scale (winning|top) creatives/i,
  ];

  // Terms that are OK when used in explanatory/analytical context
  const contextualPatterns = [
    /creative fatigue/i,
    /audience overlap/i,
    /CTR (drop|decline)/i,
  ];

  let dashboardMatches = 0;
  dashboardPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      dashboardMatches++;
    }
  });

  // Only penalize contextual patterns if NOT in explanatory context
  if (explanatoryContext < 2) {
    contextualPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        dashboardMatches++;
      }
    });
  }

  if (dashboardMatches >= 3) {
    score -= 40;
    evidence.push(`-40: ${dashboardMatches} dashboard-level observations without strategic context`);
  } else if (dashboardMatches >= 1 && explanatoryContext === 0) {
    score -= 20;
    evidence.push(`-20: ${dashboardMatches} dashboard-level observations`);
  } else if (dashboardMatches >= 1 && explanatoryContext > 0) {
    // Reduced penalty - terms used in explanatory context
    score -= 5;
    evidence.push(`-5: Dashboard terms used but in analytical/explanatory context`);
  }

  // Check for non-obvious insights (BONUS)
  const nonObviousPatterns = [
    /root cause.{0,30}(is not|isn't|is NOT)/i,
    /contrary to/i,
    /hidden.{0,20}(pattern|leverage|opportunity)/i,
    /cross.{0,10}(system|platform|source)/i,
    /behavioral.{0,20}(shift|change|pattern)/i,
    /second.{0,10}order/i,
    /downstream.{0,10}(effect|impact)/i,
    /compounding.{0,20}(effect|impact|risk)/i,
    /strategically significant/i,
    /\d+ signal sources/i,
    /face fatigue|trust decay|saturation/i,
    /untapped.{0,20}(segment|audience|opportunity)/i,
    /fresh reach/i,
    /LTV.{0,20}(higher|impact|cohort)/i,
    /acquisition.{0,20}efficiency/i,
  ];

  let nonObviousMatches = 0;
  nonObviousPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      nonObviousMatches++;
    }
  });

  if (nonObviousMatches >= 5) {
    score += 50;
    evidence.push(`+50: ${nonObviousMatches} non-obvious strategic insights`);
  } else if (nonObviousMatches >= 3) {
    score += 40;
    evidence.push(`+40: ${nonObviousMatches} non-obvious insights`);
  } else if (nonObviousMatches >= 1) {
    score += 20;
    evidence.push(`+20: ${nonObviousMatches} non-obvious insights`);
  }

  // Check if hypotheses led to novel insights
  const novelHypotheses = trace.hypotheses.filter(h =>
    h.hypothesis.toLowerCase().includes('hidden') ||
    h.hypothesis.toLowerCase().includes('unexpected') ||
    h.hypothesis.toLowerCase().includes('contrary')
  );

  if (novelHypotheses.length >= 1) {
    score += 15;
    evidence.push(`+15: Novel hypothesis explored`);
  }

  const failedBecause = score < 60 ? 'Insight is obvious - dashboard shows this, senior MB already knows' : undefined;
  const howToImprove = score < 60 ? 'Find what\'s NOT visible in dashboards. Discover hidden patterns. Challenge obvious explanations.' : undefined;

  return {
    dimension: 'Strategic Originality',
    score: Math.min(100, Math.max(0, score)),
    weight: DIMENSION_WEIGHTS.strategicOriginality,
    weightedContribution: Math.min(100, Math.max(0, score)) * DIMENSION_WEIGHTS.strategicOriginality,
    evidence,
    benchmark: 'Elite (90+): Insight surprises a senior MB. Good (70-89): Not in standard dashboards.',
    failedBecause,
    howToImprove,
  };
}

function scoreHiddenLeverageSearch(trace: ThinkingTrace): ThinkingDimensionScore {
  const searches = trace.hiddenLeverageSearched;
  const searched = searches.filter(s => s.searched);
  const found = searches.filter(s => s.found);

  let score = 20;
  const evidence: string[] = [];

  if (searched.length >= 5) {
    score += 35;
    evidence.push(`+35: ${searched.length} hidden leverage areas investigated`);
  } else if (searched.length >= 3) {
    score += 25;
    evidence.push(`+25: ${searched.length} hidden leverage areas investigated`);
  } else if (searched.length >= 1) {
    score += 10;
    evidence.push(`+10: ${searched.length} hidden leverage areas investigated`);
  } else {
    score -= 15;
    evidence.push(`-15: No hidden leverage search conducted`);
  }

  if (found.length >= 2) {
    score += 30;
    evidence.push(`+30: ${found.length} hidden leverage opportunities discovered`);
  } else if (found.length === 1) {
    score += 20;
    evidence.push(`+20: 1 hidden leverage opportunity discovered`);
  }

  const failedBecause = score < 60 ? 'Did not actively search for hidden profitable/unprofitable patterns' : undefined;
  const howToImprove = score < 60 ? 'Search: audience micro-segments, creator decay, pricing elasticity, attribution leakage, discount cannibalization' : undefined;

  return {
    dimension: 'Hidden Leverage Search',
    score: Math.min(100, Math.max(0, score)),
    weight: DIMENSION_WEIGHTS.hiddenLeverageSearch,
    weightedContribution: Math.min(100, Math.max(0, score)) * DIMENSION_WEIGHTS.hiddenLeverageSearch,
    evidence,
    benchmark: 'Elite (90+): 5+ areas searched, leverage quantified. Good (70-89): 3+ areas searched.',
    failedBecause,
    howToImprove,
  };
}

function scoreBehavioralInterpretation(trace: ThinkingTrace): ThinkingDimensionScore {
  const interpretations = trace.behavioralInterpretations;

  let score = 30;
  const evidence: string[] = [];

  if (interpretations.length >= 3) {
    score += 35;
    evidence.push(`+35: ${interpretations.length} metrics translated to behavioral meaning`);
  } else if (interpretations.length >= 1) {
    score += 20;
    evidence.push(`+20: ${interpretations.length} behavioral interpretations`);
  } else {
    score -= 10;
    evidence.push(`-10: No behavioral interpretation - just metrics`);
  }

  // Check confidence
  const highConfidence = interpretations.filter(i => i.confidence >= 0.7);
  if (highConfidence.length >= 2) {
    score += 15;
    evidence.push(`+15: ${highConfidence.length} high-confidence behavioral insights`);
  }

  // Check for rich behavioral language
  const richInterpretations = interpretations.filter(i =>
    i.behavioralMeaning.length > 50 &&
    (i.behavioralMeaning.includes('because') || i.behavioralMeaning.includes('which means'))
  );

  if (richInterpretations.length >= 1) {
    score += 10;
    evidence.push(`+10: Rich behavioral narrative with causal explanation`);
  }

  const failedBecause = score < 60 ? 'Metrics not translated into human behavior understanding' : undefined;
  const howToImprove = score < 60 ? 'For each metric, explain WHAT HUMANS ARE DOING. "CTR dropped" → "Audience has seen this message enough and is now ignoring it"' : undefined;

  return {
    dimension: 'Behavioral Interpretation',
    score: Math.min(100, Math.max(0, score)),
    weight: DIMENSION_WEIGHTS.behavioralInterpretation,
    weightedContribution: Math.min(100, Math.max(0, score)) * DIMENSION_WEIGHTS.behavioralInterpretation,
    evidence,
    benchmark: 'Elite (90+): Rich behavioral narrative. Good (70-89): Metrics → behaviors.',
    failedBecause,
    howToImprove,
  };
}

// ============================================================================
// Main Evaluation Function
// ============================================================================

export function evaluateThinkingQuality(
  trace: ThinkingTrace,
  outputContent: string
): ThinkingQualityEvaluation {
  // Score all dimensions
  const hypothesisDepth = scoreHypothesisDepth(trace);
  const evidenceSearch = scoreEvidenceSearch(trace);
  const causalReasoning = scoreCausalReasoning(trace);
  const assumptionExposure = scoreAssumptionExposure(trace);
  const contradictionHandling = scoreContradictionHandling(trace);
  const secondOrderThinking = scoreSecondOrderThinking(trace);
  const strategicOriginality = scoreStrategicOriginality(trace, outputContent);
  const hiddenLeverageSearch = scoreHiddenLeverageSearch(trace);
  const behavioralInterpretation = scoreBehavioralInterpretation(trace);

  const allDimensions = [
    hypothesisDepth,
    evidenceSearch,
    causalReasoning,
    assumptionExposure,
    contradictionHandling,
    secondOrderThinking,
    strategicOriginality,
    hiddenLeverageSearch,
    behavioralInterpretation,
  ];

  // Calculate overall score
  const overallThinkingScore = Math.round(
    allDimensions.reduce((sum, d) => sum + d.weightedContribution, 0)
  );

  // Determine verdict
  let verdict: ThinkingQualityEvaluation['verdict'];
  if (overallThinkingScore >= 85) {
    verdict = 'ELITE_REASONING';
  } else if (overallThinkingScore >= 65) {
    verdict = 'ADEQUATE_REASONING';
  } else if (overallThinkingScore >= 40) {
    verdict = 'SHALLOW_REASONING';
  } else {
    verdict = 'NO_REASONING';
  }

  // Collect improvement requirements
  const improvementRequired = allDimensions
    .filter(d => d.score < 60 && d.howToImprove)
    .map(d => `${d.dimension}: ${d.howToImprove}`);

  // Generate human-readable explanation
  const weakDimensions = allDimensions.filter(d => d.score < 60);
  const strongDimensions = allDimensions.filter(d => d.score >= 80);

  let humanReadableExplanation: string;
  if (verdict === 'ELITE_REASONING') {
    humanReadableExplanation = `Thinking quality is ELITE (${overallThinkingScore}/100). Strong in: ${strongDimensions.map(d => d.dimension).join(', ')}. This analysis demonstrates multi-hypothesis thinking, active evidence search, and genuine strategic depth.`;
  } else if (verdict === 'ADEQUATE_REASONING') {
    humanReadableExplanation = `Thinking quality is ADEQUATE (${overallThinkingScore}/100). ${weakDimensions.length > 0 ? `Weak in: ${weakDimensions.map(d => d.dimension).join(', ')}.` : ''} The reasoning is solid but not elite-level.`;
  } else if (verdict === 'SHALLOW_REASONING') {
    humanReadableExplanation = `Thinking quality is SHALLOW (${overallThinkingScore}/100). Major gaps: ${weakDimensions.map(d => d.dimension).join(', ')}. The analysis lacks depth - single hypothesis assumed, limited evidence search, no hidden leverage investigation.`;
  } else {
    humanReadableExplanation = `Thinking quality is ABSENT (${overallThinkingScore}/100). This is pipeline intelligence, not reasoning. No hypothesis generation, no evidence search, no causal analysis. Would not impress a founder.`;
  }

  return {
    hypothesisDepth,
    evidenceSearch,
    causalReasoning,
    assumptionExposure,
    contradictionHandling,
    secondOrderThinking,
    strategicOriginality,
    hiddenLeverageSearch,
    behavioralInterpretation,
    allDimensions,
    overallThinkingScore,
    verdict,
    improvementRequired,
    humanReadableExplanation,
  };
}

// ============================================================================
// Helper: Create Empty Thinking Trace
// ============================================================================

export function createEmptyThinkingTrace(): ThinkingTrace {
  return {
    hypotheses: [],
    evidenceSearched: [],
    causalChains: [],
    assumptions: [],
    contradictions: [],
    consequences: [],
    hiddenLeverageSearched: [],
    behavioralInterpretations: [],
  };
}

// ============================================================================
// Helper: Add to Thinking Trace
// ============================================================================

export function addHypothesis(
  trace: ThinkingTrace,
  hypothesis: string,
  tested: boolean = false,
  evidence: string[] = [],
  confidence: number = 0.5,
  disproven: boolean = false
): ThinkingTrace {
  return {
    ...trace,
    hypotheses: [...trace.hypotheses, { hypothesis, tested, evidence, confidence, disproven }],
  };
}

export function addEvidenceSearch(
  trace: ThinkingTrace,
  source: string,
  lookingFor: string,
  found: boolean,
  finding?: string
): ThinkingTrace {
  return {
    ...trace,
    evidenceSearched: [...trace.evidenceSearched, { source, lookingFor, found, finding }],
  };
}

export function addCausalChain(
  trace: ThinkingTrace,
  cause: string,
  effect: string,
  confidence: number = 0.7
): ThinkingTrace {
  return {
    ...trace,
    causalChains: [...trace.causalChains, { cause, effect, confidence }],
  };
}

export function addAssumption(
  trace: ThinkingTrace,
  assumption: string,
  challenged: boolean = false,
  risk?: string
): ThinkingTrace {
  return {
    ...trace,
    assumptions: [...trace.assumptions, { assumption, challenged, risk }],
  };
}

export function addContradiction(
  trace: ThinkingTrace,
  statement1: string,
  statement2: string,
  resolved: boolean = false,
  resolution?: string
): ThinkingTrace {
  return {
    ...trace,
    contradictions: [...trace.contradictions, { statement1, statement2, resolved, resolution }],
  };
}

export function addConsequence(
  trace: ThinkingTrace,
  action: string,
  firstOrder: string,
  secondOrder?: string,
  thirdOrder?: string
): ThinkingTrace {
  return {
    ...trace,
    consequences: [...trace.consequences, { action, firstOrder, secondOrder, thirdOrder }],
  };
}

export function addHiddenLeverageSearch(
  trace: ThinkingTrace,
  area: string,
  searched: boolean,
  found: boolean,
  finding?: string
): ThinkingTrace {
  return {
    ...trace,
    hiddenLeverageSearched: [...trace.hiddenLeverageSearched, { area, searched, found, finding }],
  };
}

export function addBehavioralInterpretation(
  trace: ThinkingTrace,
  metric: string,
  behavioralMeaning: string,
  confidence: number = 0.7
): ThinkingTrace {
  return {
    ...trace,
    behavioralInterpretations: [...trace.behavioralInterpretations, { metric, behavioralMeaning, confidence }],
  };
}
