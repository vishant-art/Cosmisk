/**
 * BUILD GATE - Pre-Build Strategic Validation System
 *
 * This is NOT a report generator. This is a GATE.
 * Every feature idea MUST pass through this before any code is written.
 *
 * If it fails: DO NOT BUILD.
 * If it passes: BUILD with constraints.
 */

import Anthropic from '@anthropic-ai/sdk';

// ============================================================
// CORE PRINCIPLE: We build CLOSED-LOOP OPERATING SYSTEMS, not reports.
// ============================================================

const COSMISK_VISION = `
Cosmisk is a CLOSED-LOOP STRATEGIC OPERATING SYSTEM for D2C brands.

NOT a reporting tool.
NOT a dashboard.
NOT an AI that generates text and ships it.

The loop is:
Detection → Reasoning → Recommendation → Execution Detection →
Performance Validation → Learning → Updated Reasoning → LOOP

Every feature MUST:
1. Close a loop (not just open one)
2. Track recommendations from creation to outcome
3. Include execution detection (did they actually do it?)
4. Validate predictions against reality
5. Learn and update reasoning based on outcomes
6. Compound intelligence over time

The moat is: intelligence that improves with every brand, every decision.
Not: reports that look smart but don't compound.
`;

const ANTI_PATTERNS = [
  {
    name: 'REPORT_GENERATOR',
    description: 'Generates output that ends at "here is your report"',
    detection: 'Output goes to PDF/HTML/text → human reads → END',
    verdict: 'DO NOT BUILD - This is reporting, not operating',
  },
  {
    name: 'STATELESS_ANALYSIS',
    description: 'Analyzes data without remembering previous analyses',
    detection: 'No storage of recommendations, no tracking of outcomes',
    verdict: 'DO NOT BUILD - No compounding intelligence',
  },
  {
    name: 'DASHBOARD_THINKING',
    description: 'Shows metrics without actionable intelligence',
    detection: 'Displays numbers but doesn\'t suggest/track actions',
    verdict: 'DO NOT BUILD - Dashboards are commodity',
  },
  {
    name: 'GENERIC_OUTPUT',
    description: 'Produces insights that could apply to any brand',
    detection: 'No brand-specific context, no historical learning',
    verdict: 'DO NOT BUILD - No moat against Meta + Claude',
  },
  {
    name: 'ONE_SHOT_INTELLIGENCE',
    description: 'Runs once, gives answer, forgets',
    detection: 'No feedback loop, no outcome tracking',
    verdict: 'DO NOT BUILD - No closed loop',
  },
  {
    name: 'AI_THEATER',
    description: 'Looks impressive but doesn\'t move business metrics',
    detection: 'Complex output with no measurable founder value',
    verdict: 'DO NOT BUILD - Waste of tokens',
  },
  {
    name: 'FEATURE_BLOAT',
    description: 'Adds capability without clear business need',
    detection: '"Nice to have" but no founder asking for it',
    verdict: 'DO NOT BUILD - Focus on core loops',
  },
  {
    name: 'DISCONNECTED_WORKFLOW',
    description: 'Creates new system that doesn\'t connect to existing loops',
    detection: 'Standalone feature that doesn\'t feed into intelligence core',
    verdict: 'DO NOT BUILD - Increases complexity without compounding',
  },
];

export interface BuildProposal {
  name: string;
  description: string;
  expectedOutput: string;
  dataInputs: string[];
  userAction: string; // What does the user do with this?
  successMetric: string; // How do we know it worked?
}

export interface BuildGateResult {
  verdict: 'BUILD' | 'TEST_FIRST' | 'REDESIGN' | 'DO_NOT_BUILD';
  score: number; // 0-100
  antiPatternsDetected: string[];
  closedLoopScore: number; // 0-100
  founderValueScore: number; // 0-100
  moatScore: number; // 0-100
  constraints: string[];
  reasoning: string;
  redesignSuggestions?: string[];
}

/**
 * The Gate. Every feature must pass through here.
 */
export async function validateBuildProposal(
  proposal: BuildProposal
): Promise<BuildGateResult> {

  // Step 1: Anti-pattern detection (fast, local)
  const antiPatternsDetected = detectAntiPatterns(proposal);

  // Step 2: Closed-loop score (does it close a loop?)
  const closedLoopScore = scoreClosedLoop(proposal);

  // Step 3: Founder value score (would a founder pay for this?)
  const founderValueScore = scoreFounderValue(proposal);

  // Step 4: Moat score (does this compound intelligence?)
  const moatScore = scoreMoat(proposal);

  // Step 5: Calculate overall score
  const overallScore = Math.round(
    closedLoopScore * 0.4 +
    founderValueScore * 0.3 +
    moatScore * 0.3
  );

  // Step 6: Determine verdict
  let verdict: BuildGateResult['verdict'];
  let constraints: string[] = [];
  let redesignSuggestions: string[] = [];

  if (antiPatternsDetected.length >= 3) {
    verdict = 'DO_NOT_BUILD';
    redesignSuggestions = antiPatternsDetected.map(p =>
      `Fix ${p}: ${ANTI_PATTERNS.find(ap => ap.name === p)?.description || ''}`
    );
  } else if (overallScore < 40) {
    verdict = 'DO_NOT_BUILD';
    redesignSuggestions = generateRedesignSuggestions(proposal, {
      closedLoopScore,
      founderValueScore,
      moatScore,
    });
  } else if (overallScore < 60) {
    verdict = 'REDESIGN';
    redesignSuggestions = generateRedesignSuggestions(proposal, {
      closedLoopScore,
      founderValueScore,
      moatScore,
    });
  } else if (overallScore < 80) {
    verdict = 'TEST_FIRST';
    constraints = generateConstraints(proposal, antiPatternsDetected);
  } else {
    verdict = 'BUILD';
    constraints = generateConstraints(proposal, antiPatternsDetected);
  }

  // Generate reasoning
  const reasoning = generateReasoning(proposal, {
    antiPatternsDetected,
    closedLoopScore,
    founderValueScore,
    moatScore,
    overallScore,
    verdict,
  });

  return {
    verdict,
    score: overallScore,
    antiPatternsDetected,
    closedLoopScore,
    founderValueScore,
    moatScore,
    constraints,
    reasoning,
    redesignSuggestions: redesignSuggestions.length > 0 ? redesignSuggestions : undefined,
  };
}

/**
 * Detect anti-patterns in the proposal
 */
function detectAntiPatterns(proposal: BuildProposal): string[] {
  const detected: string[] = [];
  const desc = proposal.description.toLowerCase();
  const output = proposal.expectedOutput.toLowerCase();
  const action = proposal.userAction.toLowerCase();

  // REPORT_GENERATOR: Output is a report that humans just read
  if (
    output.includes('report') ||
    output.includes('pdf') ||
    output.includes('html') ||
    (action.includes('read') && !action.includes('track'))
  ) {
    detected.push('REPORT_GENERATOR');
  }

  // STATELESS_ANALYSIS: No mention of tracking or memory
  if (
    !desc.includes('track') &&
    !desc.includes('remember') &&
    !desc.includes('learn') &&
    !desc.includes('history') &&
    !desc.includes('previous')
  ) {
    detected.push('STATELESS_ANALYSIS');
  }

  // DASHBOARD_THINKING: Shows metrics without actions
  if (
    (output.includes('metric') || output.includes('chart') || output.includes('graph')) &&
    !output.includes('action') &&
    !output.includes('recommend')
  ) {
    detected.push('DASHBOARD_THINKING');
  }

  // GENERIC_OUTPUT: Could work for any brand
  if (
    !desc.includes('brand') &&
    !desc.includes('client') &&
    !desc.includes('specific') &&
    !desc.includes('custom')
  ) {
    detected.push('GENERIC_OUTPUT');
  }

  // ONE_SHOT_INTELLIGENCE: No feedback loop
  if (
    !desc.includes('loop') &&
    !desc.includes('feedback') &&
    !desc.includes('outcome') &&
    !desc.includes('result') &&
    !desc.includes('validate')
  ) {
    detected.push('ONE_SHOT_INTELLIGENCE');
  }

  // AI_THEATER: Complex but no business metric
  const successMetric = proposal.successMetric.toLowerCase();
  if (
    !successMetric.includes('revenue') &&
    !successMetric.includes('roas') &&
    !successMetric.includes('cpa') &&
    !successMetric.includes('save') &&
    !successMetric.includes('profit') &&
    !successMetric.includes('cost')
  ) {
    detected.push('AI_THEATER');
  }

  // FEATURE_BLOAT: No clear user need
  if (
    action.includes('could') ||
    action.includes('might') ||
    action.includes('optional')
  ) {
    detected.push('FEATURE_BLOAT');
  }

  // DISCONNECTED_WORKFLOW: Doesn't mention integration
  if (
    !desc.includes('integrate') &&
    !desc.includes('connect') &&
    !desc.includes('feed') &&
    !desc.includes('into')
  ) {
    detected.push('DISCONNECTED_WORKFLOW');
  }

  return detected;
}

/**
 * Score how well this closes a loop (0-100)
 */
function scoreClosedLoop(proposal: BuildProposal): number {
  let score = 0;
  const desc = proposal.description.toLowerCase();
  const action = proposal.userAction.toLowerCase();
  const success = proposal.successMetric.toLowerCase();

  // Does it detect something? (+15)
  if (desc.includes('detect') || desc.includes('identify') || desc.includes('find')) {
    score += 15;
  }

  // Does it recommend action? (+15)
  if (desc.includes('recommend') || desc.includes('suggest') || desc.includes('action')) {
    score += 15;
  }

  // Does it track execution? (+20)
  if (desc.includes('track') || desc.includes('monitor') || desc.includes('detect launch')) {
    score += 20;
  }

  // Does it validate outcomes? (+20)
  if (desc.includes('validate') || desc.includes('verify') || desc.includes('measure outcome')) {
    score += 20;
  }

  // Does it learn? (+15)
  if (desc.includes('learn') || desc.includes('improve') || desc.includes('update')) {
    score += 15;
  }

  // Does success metric involve improvement over time? (+15)
  if (
    success.includes('improve') ||
    success.includes('reduce') ||
    success.includes('increase') ||
    success.includes('better')
  ) {
    score += 15;
  }

  return Math.min(100, score);
}

/**
 * Score founder value (0-100)
 */
function scoreFounderValue(proposal: BuildProposal): number {
  let score = 0;
  const desc = proposal.description.toLowerCase();
  const action = proposal.userAction.toLowerCase();
  const success = proposal.successMetric.toLowerCase();

  // Direct money impact (+30)
  if (
    success.includes('save') ||
    success.includes('revenue') ||
    success.includes('profit') ||
    success.includes('cost')
  ) {
    score += 30;
  }

  // Time saving (+20)
  if (
    desc.includes('automate') ||
    desc.includes('automatic') ||
    success.includes('time') ||
    success.includes('faster')
  ) {
    score += 20;
  }

  // Prevents mistakes (+20)
  if (
    desc.includes('prevent') ||
    desc.includes('catch') ||
    desc.includes('before') ||
    desc.includes('early')
  ) {
    score += 20;
  }

  // Clear action for user (+15)
  if (
    action.includes('click') ||
    action.includes('approve') ||
    action.includes('decide') ||
    !action.includes('read') // Reading is passive
  ) {
    score += 15;
  }

  // Measurable outcome (+15)
  if (
    success.includes('%') ||
    success.includes('rs') ||
    success.includes('₹') ||
    success.includes('number')
  ) {
    score += 15;
  }

  return Math.min(100, score);
}

/**
 * Score moat potential (0-100)
 */
function scoreMoat(proposal: BuildProposal): number {
  let score = 0;
  const desc = proposal.description.toLowerCase();

  // Uses cross-platform data (+20)
  if (
    (desc.includes('meta') && desc.includes('shopify')) ||
    (desc.includes('ads') && desc.includes('inventory')) ||
    desc.includes('cross-platform')
  ) {
    score += 20;
  }

  // Brand-specific learning (+25)
  if (
    desc.includes('brand-specific') ||
    desc.includes('client history') ||
    desc.includes('previous') ||
    desc.includes('pattern')
  ) {
    score += 25;
  }

  // Intelligence that compounds (+25)
  if (
    desc.includes('compound') ||
    desc.includes('accumulate') ||
    desc.includes('over time') ||
    desc.includes('improve with')
  ) {
    score += 25;
  }

  // Something Meta + Claude can't do (+20)
  if (
    desc.includes('shopify') ||
    desc.includes('competitor') ||
    desc.includes('oos') ||
    desc.includes('inventory') ||
    desc.includes('discount leak')
  ) {
    score += 20;
  }

  // Network effects (+10)
  if (
    desc.includes('across client') ||
    desc.includes('benchmark') ||
    desc.includes('industry')
  ) {
    score += 10;
  }

  return Math.min(100, score);
}

/**
 * Generate constraints for approved builds
 */
function generateConstraints(
  proposal: BuildProposal,
  antiPatterns: string[]
): string[] {
  const constraints: string[] = [];

  // Always require tracking
  constraints.push('MUST track every recommendation with unique ID');
  constraints.push('MUST store in strategic_memory with outcome tracking');

  // If report generator detected but approved anyway
  if (antiPatterns.includes('REPORT_GENERATOR')) {
    constraints.push('MUST include recommendation tracking, not just display');
    constraints.push('MUST have "Mark as Executed" capability');
  }

  // If stateless detected
  if (antiPatterns.includes('STATELESS_ANALYSIS')) {
    constraints.push('MUST load previous recommendations before generating new ones');
    constraints.push('MUST deduplicate against last 4 weeks');
  }

  // If one-shot detected
  if (antiPatterns.includes('ONE_SHOT_INTELLIGENCE')) {
    constraints.push('MUST include execution detection mechanism');
    constraints.push('MUST have outcome validation after 7 days');
  }

  // Always
  constraints.push('MUST NOT output to PDF/HTML without database persistence');
  constraints.push('MUST include reasoning chain with every recommendation');
  constraints.push('MUST connect to existing intelligence loops');

  return constraints;
}

/**
 * Generate redesign suggestions
 */
function generateRedesignSuggestions(
  proposal: BuildProposal,
  scores: { closedLoopScore: number; founderValueScore: number; moatScore: number }
): string[] {
  const suggestions: string[] = [];

  if (scores.closedLoopScore < 50) {
    suggestions.push('Add: Execution detection - how do we know the recommendation was followed?');
    suggestions.push('Add: Outcome tracking - what happened after they followed it?');
    suggestions.push('Add: Learning loop - how does this improve future recommendations?');
  }

  if (scores.founderValueScore < 50) {
    suggestions.push('Clarify: What money does this save/make for the founder?');
    suggestions.push('Simplify: What is the ONE action the founder takes?');
    suggestions.push('Quantify: How do we measure success in rupees?');
  }

  if (scores.moatScore < 50) {
    suggestions.push('Add: Cross-platform data (Meta + Shopify + Competitors)');
    suggestions.push('Add: Brand-specific historical learning');
    suggestions.push('Ask: Can Meta + Claude do this? If yes, don\'t build');
  }

  return suggestions;
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  proposal: BuildProposal,
  analysis: {
    antiPatternsDetected: string[];
    closedLoopScore: number;
    founderValueScore: number;
    moatScore: number;
    overallScore: number;
    verdict: string;
  }
): string {
  const lines: string[] = [];

  lines.push(`## Build Gate Analysis: ${proposal.name}`);
  lines.push('');
  lines.push(`**Verdict: ${analysis.verdict}** (Score: ${analysis.overallScore}/100)`);
  lines.push('');

  // Scores breakdown
  lines.push('### Scores');
  lines.push(`- Closed Loop: ${analysis.closedLoopScore}/100 ${analysis.closedLoopScore < 50 ? '⚠️' : '✓'}`);
  lines.push(`- Founder Value: ${analysis.founderValueScore}/100 ${analysis.founderValueScore < 50 ? '⚠️' : '✓'}`);
  lines.push(`- Moat Potential: ${analysis.moatScore}/100 ${analysis.moatScore < 50 ? '⚠️' : '✓'}`);
  lines.push('');

  // Anti-patterns
  if (analysis.antiPatternsDetected.length > 0) {
    lines.push('### Anti-Patterns Detected');
    for (const ap of analysis.antiPatternsDetected) {
      const pattern = ANTI_PATTERNS.find(p => p.name === ap);
      if (pattern) {
        lines.push(`- **${ap}**: ${pattern.description}`);
        lines.push(`  Detection: ${pattern.detection}`);
      }
    }
    lines.push('');
  }

  // Vision alignment check
  lines.push('### Vision Alignment');
  if (analysis.closedLoopScore >= 70) {
    lines.push('✓ This feature supports the closed-loop operating system vision');
  } else {
    lines.push('⚠️ This feature does NOT align with the closed-loop vision');
    lines.push('  - Cosmisk is NOT a reporting tool');
    lines.push('  - Every feature must: Detect → Recommend → Track Execution → Validate Outcome → Learn');
  }

  return lines.join('\n');
}

/**
 * Quick check - use this before even writing a proposal
 */
export function quickCheck(ideaDescription: string): {
  proceed: boolean;
  concerns: string[];
} {
  const concerns: string[] = [];
  const desc = ideaDescription.toLowerCase();

  // Instant red flags
  if (desc.includes('report') && !desc.includes('track')) {
    concerns.push('Sounds like a report generator - add tracking');
  }

  if (desc.includes('dashboard')) {
    concerns.push('Dashboard thinking - what ACTION does the user take?');
  }

  if (desc.includes('analyze') && !desc.includes('recommend')) {
    concerns.push('Analysis without recommendation - what should user DO?');
  }

  if (desc.includes('display') || desc.includes('show')) {
    concerns.push('Display/show = passive - how does this close a loop?');
  }

  if (!desc.includes('track') && !desc.includes('learn') && !desc.includes('improve')) {
    concerns.push('No learning mentioned - does this compound intelligence?');
  }

  return {
    proceed: concerns.length < 2,
    concerns,
  };
}

// ============================================================
// EXAMPLES OF DO NOT BUILD vs BUILD
// ============================================================

export const EXAMPLES = {
  DO_NOT_BUILD: [
    {
      idea: 'Creative performance report',
      why: 'Report ends at PDF. No tracking, no loop, no learning.',
    },
    {
      idea: 'Dashboard showing ad metrics',
      why: 'Dashboard is commodity. No action, no moat.',
    },
    {
      idea: 'AI that analyzes competitor ads',
      why: 'One-shot analysis. No outcome tracking. Meta can do this.',
    },
    {
      idea: 'Weekly summary email',
      why: 'Summary = reporting. No closed loop.',
    },
  ],
  BUILD: [
    {
      idea: 'Creative recommendation tracker with execution detection',
      why: 'Tracks recommendation → detects if creative launched → validates performance → learns',
    },
    {
      idea: 'OOS detector with automatic ad pause',
      why: 'Detects → acts → tracks outcome → no human needed for routine cases',
    },
    {
      idea: 'Prediction accuracy tracker',
      why: 'Validates our predictions against reality → improves future predictions',
    },
    {
      idea: 'Cross-brand pattern detector with anonymized learning',
      why: 'Compounds intelligence across clients → moat that grows',
    },
  ],
};
