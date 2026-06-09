/**
 * Operator Experience — TIER 2: DECISION COMPRESSION
 */

import type {
  CompressionLevel,
  CompressedDecision,
  ScoredAction,
  NarrativeInsight,
  HiddenOpportunity,
  TimedIntelligence,
} from './types.js';

/**
 * Compress multiple insights into prioritized decisions
 */
export function compressDecisions(
  insights: NarrativeInsight[],
  opportunities: HiddenOpportunity[],
  timedItems: TimedIntelligence[],
  level: CompressionLevel = 'one_thing'
): CompressedDecision {
  // Score and rank all potential actions
  const scoredActions = scoreAndRankActions(insights, opportunities, timedItems);

  // THE ONE THING — highest scored action
  const topAction = scoredActions[0];
  const theOneThing = topAction ? {
    action: topAction.action,
    deadline: topAction.deadline,
    impact: topAction.impactStatement,
    confidence: topAction.score,
  } : null;

  const result: CompressedDecision = {
    level,
    theOneThing,
  };

  // Add top 3 if requested
  if (level === 'top_three' || level === 'full_context') {
    result.topThree = scoredActions.slice(0, 3).map((a, i) => ({
      rank: (i + 1) as 1 | 2 | 3,
      action: a.action,
      type: a.type,
      effort: a.effort,
      impact: a.impact,
    }));
  }

  // Add full context if requested
  if (level === 'full_context') {
    result.fullContext = {
      actions: scoredActions.map(a => ({
        action: a.action,
        category: a.type,
        evidence: a.evidence,
        blockers: a.blockers,
      })),
      skipList: generateSkipList(insights, scoredActions),
    };
  }

  return result;
}

/**
 * Score and rank all potential actions
 */
function scoreAndRankActions(
  insights: NarrativeInsight[],
  opportunities: HiddenOpportunity[],
  timedItems: TimedIntelligence[]
): ScoredAction[] {
  const actions: ScoredAction[] = [];

  // Convert insights to scored actions
  for (const insight of insights) {
    const urgencyScore = { act_now: 40, this_week: 30, this_month: 20, when_ready: 10 };
    const baseScore = urgencyScore[insight.urgency] + (insight.confidence * 0.5);

    actions.push({
      action: insight.actionStatement,
      score: baseScore,
      deadline: getDeadlineFromUrgency(insight.urgency),
      impactStatement: insight.whatIfNothing,
      type: categorizeAction(insight.headline),
      effort: estimateEffort(insight.actionStatement),
      impact: estimateImpact(insight.confidence, insight.urgency),
      evidence: `Based on ${insight.evidence.length} data points`,
    });
  }

  // Convert opportunities to scored actions
  for (const opp of opportunities) {
    actions.push({
      action: opp.actionSteps[0],
      score: opp.confidence * 0.8,  // Slightly lower than urgent insights
      deadline: opp.timeToCapture,
      impactStatement: opp.potentialUpside,
      type: 'grow',
      effort: opp.actionSteps.length > 3 ? 'high' : 'medium',
      impact: 'high',
      evidence: `Cross-signal: ${opp.signalsCombined.join(', ')}`,
    });
  }

  // Boost items with tight deadlines
  for (const item of timedItems) {
    const existing = actions.find(a => a.action.includes(item.title.split(' ')[0]));
    if (existing && item.daysRemaining <= 3) {
      existing.score += 20;  // Urgency boost
    }
  }

  // Sort by score descending
  actions.sort((a, b) => b.score - a.score);

  return actions;
}

/**
 * Categorize action type
 */
function categorizeAction(headline: string): 'protect' | 'grow' | 'optimize' {
  const lower = headline.toLowerCase();
  if (lower.includes('drop') || lower.includes('decline') || lower.includes('waste') || lower.includes('leak')) {
    return 'protect';
  }
  if (lower.includes('opportunity') || lower.includes('untested') || lower.includes('gap')) {
    return 'grow';
  }
  return 'optimize';
}

/**
 * Estimate effort from action text
 */
function estimateEffort(action: string): 'low' | 'medium' | 'high' {
  const lower = action.toLowerCase();
  if (lower.includes('pause') || lower.includes('review') || lower.includes('check')) {
    return 'low';
  }
  if (lower.includes('create') || lower.includes('launch') || lower.includes('build')) {
    return 'high';
  }
  return 'medium';
}

/**
 * Estimate impact from confidence and urgency
 */
function estimateImpact(
  confidence: number,
  urgency: NarrativeInsight['urgency']
): 'low' | 'medium' | 'high' {
  if (urgency === 'act_now' || confidence > 80) return 'high';
  if (urgency === 'when_ready' && confidence < 60) return 'low';
  return 'medium';
}

/**
 * Get deadline string from urgency
 */
function getDeadlineFromUrgency(urgency: NarrativeInsight['urgency']): string {
  switch (urgency) {
    case 'act_now': return 'Today';
    case 'this_week': return 'This week';
    case 'this_month': return 'This month';
    default: return 'When ready';
  }
}

/**
 * Generate list of skipped actions with reasons
 */
function generateSkipList(
  insights: NarrativeInsight[],
  scoredActions: ScoredAction[]
): string[] {
  const skipList: string[] = [];

  // Low confidence insights
  const lowConfidence = insights.filter(i => i.confidence < 50);
  if (lowConfidence.length > 0) {
    skipList.push(`${lowConfidence.length} insight(s) skipped due to low confidence (<50%)`);
  }

  // Duplicate actions
  const actionTexts = scoredActions.map(a => a.action.toLowerCase());
  const duplicates = actionTexts.filter((a, i) => actionTexts.indexOf(a) !== i);
  if (duplicates.length > 0) {
    skipList.push(`${duplicates.length} duplicate action(s) merged`);
  }

  return skipList;
}

/**
 * Generate "if you only have 5 minutes" brief
 */
export function generateFiveMinuteBrief(
  compressed: CompressedDecision
): string {
  const parts: string[] = [];

  parts.push('**⏱️ 5-MINUTE BRIEF**\n');

  if (compressed.theOneThing) {
    parts.push(`**THE ONE THING:** ${compressed.theOneThing.action}`);
    parts.push(`↳ Deadline: ${compressed.theOneThing.deadline}`);
    parts.push(`↳ If not: ${compressed.theOneThing.impact}\n`);
  }

  if (compressed.topThree && compressed.topThree.length > 1) {
    parts.push('**ALSO IMPORTANT:**');
    for (const item of compressed.topThree.slice(1)) {
      const icon = item.type === 'protect' ? '🛡️' : item.type === 'grow' ? '📈' : '⚙️';
      parts.push(`${item.rank}. ${icon} ${item.action} (${item.effort} effort, ${item.impact} impact)`);
    }
  }

  return parts.join('\n');
}
