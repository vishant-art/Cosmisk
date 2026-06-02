/**
 * Creative Opportunity Engine — "What Should We Create Next?"
 *
 * Combines signals from multiple intelligence agents to produce
 * a prioritized queue of creative opportunities.
 *
 * Input Signals:
 * - Comment Mining (demand signals, objections, desires)
 * - Fatigue Detection (current creative health)
 * - Competitor Intelligence (narrative gaps)
 * - Performance Data (what's working/dying)
 *
 * Output: Priority queue with urgency, reasoning, and briefs
 */

import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

export type OpportunityType =
  | 'fatigue_replacement'    // Current creative dying, need fresh
  | 'objection_handler'      // Customer objections need addressing
  | 'demand_signal'          // Strong desire patterns detected
  | 'competitor_gap'         // Competitor not covering this angle
  | 'trend_ride'             // Emerging trend to ride
  | 'social_proof'           // Strong praise patterns to leverage
  | 'format_test'            // Underused format showing promise
  | 'seasonal_prep'          // Upcoming event/season
  | 'winner_variation'       // Scale winning creative with variants
  | 'audience_expansion';    // New audience segment opportunity

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

export interface CreativeOpportunity {
  id: string;
  type: OpportunityType;
  urgency: UrgencyLevel;
  title: string;
  reasoning: string;
  dataPoints: {
    source: string;
    metric: string;
    value: string | number;
  }[];
  suggestedConcept: {
    hook: string;
    angle: string;
    format: string[];
    targetEmotion: string;
  };
  estimatedImpact: 'high' | 'medium' | 'low';
  deadline?: string;
  createdAt: string;
}

export interface OpportunityQueueResult {
  clientId: string;
  generatedAt: string;
  opportunities: CreativeOpportunity[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    topPriority: string;
  };
}

// Input signal types
interface FatigueSignal {
  creativeId: string;
  creativeName: string;
  fatigueScore: number; // 0-100, higher = more fatigued
  daysSinceDecline: number;
  currentCTR: number;
  peakCTR: number;
  spend: number;
}

interface CommentSignal {
  pattern: string;
  category: 'objection' | 'desire' | 'praise' | 'question' | 'frustration' | 'use_case';
  frequency: number;
  emotionalIntensity: number;
  exampleComments: string[];
}

interface CompetitorSignal {
  competitorName: string;
  gap: string;
  description: string;
  opportunity: string;
}

interface PerformanceSignal {
  topCreatives: {
    id: string;
    name: string;
    roas: number;
    spend: number;
    format: string;
  }[];
  underperforming: {
    id: string;
    name: string;
    roas: number;
    spend: number;
  }[];
  formatBreakdown: Record<string, { count: number; avgRoas: number }>;
}

// ============================================================================
// MAIN ENGINE
// ============================================================================

/**
 * Generate priority queue of creative opportunities
 */
export async function generateOpportunityQueue(
  clientId: string,
  signals: {
    fatigue?: FatigueSignal[];
    comments?: CommentSignal[];
    competitors?: CompetitorSignal[];
    performance?: PerformanceSignal;
  }
): Promise<OpportunityQueueResult> {
  const opportunities: CreativeOpportunity[] = [];

  // 1. Process fatigue signals (CRITICAL priority)
  if (signals.fatigue && signals.fatigue.length > 0) {
    const fatigueOpps = processFatigueSignals(signals.fatigue);
    opportunities.push(...fatigueOpps);
  }

  // 2. Process comment signals (HIGH priority for objections)
  if (signals.comments && signals.comments.length > 0) {
    const commentOpps = processCommentSignals(signals.comments);
    opportunities.push(...commentOpps);
  }

  // 3. Process competitor gaps (MEDIUM priority)
  if (signals.competitors && signals.competitors.length > 0) {
    const competitorOpps = processCompetitorSignals(signals.competitors);
    opportunities.push(...competitorOpps);
  }

  // 4. Process performance signals (winner variations, format tests)
  if (signals.performance) {
    const perfOpps = processPerformanceSignals(signals.performance);
    opportunities.push(...perfOpps);
  }

  // Sort by urgency and score
  const sortedOpportunities = sortOpportunities(opportunities);

  // Build summary
  const summary = {
    critical: sortedOpportunities.filter(o => o.urgency === 'critical').length,
    high: sortedOpportunities.filter(o => o.urgency === 'high').length,
    medium: sortedOpportunities.filter(o => o.urgency === 'medium').length,
    low: sortedOpportunities.filter(o => o.urgency === 'low').length,
    topPriority: sortedOpportunities[0]?.title || 'No opportunities detected'
  };

  return {
    clientId,
    generatedAt: new Date().toISOString(),
    opportunities: sortedOpportunities,
    summary
  };
}

// ============================================================================
// SIGNAL PROCESSORS
// ============================================================================

function processFatigueSignals(signals: FatigueSignal[]): CreativeOpportunity[] {
  const opportunities: CreativeOpportunity[] = [];

  for (const signal of signals) {
    // Critical if fatigue > 80% or CTR dropped > 50%
    const ctrDrop = ((signal.peakCTR - signal.currentCTR) / signal.peakCTR) * 100;
    const isCritical = signal.fatigueScore >= 80 || ctrDrop >= 50;
    const isHigh = signal.fatigueScore >= 60 || ctrDrop >= 30;

    if (signal.fatigueScore >= 50) {
      opportunities.push({
        id: uuidv4(),
        type: 'fatigue_replacement',
        urgency: isCritical ? 'critical' : isHigh ? 'high' : 'medium',
        title: `Replace fatigued creative: "${signal.creativeName}"`,
        reasoning: `This creative has ${signal.fatigueScore}% fatigue score. CTR dropped from ${signal.peakCTR.toFixed(2)}% to ${signal.currentCTR.toFixed(2)}% (${ctrDrop.toFixed(0)}% decline). It has spent ₹${Math.round(signal.spend).toLocaleString()} and needs fresh replacement.`,
        dataPoints: [
          { source: 'Fatigue Detector', metric: 'Fatigue Score', value: `${signal.fatigueScore}%` },
          { source: 'Meta Ads', metric: 'CTR Drop', value: `${ctrDrop.toFixed(1)}%` },
          { source: 'Meta Ads', metric: 'Days Since Decline', value: signal.daysSinceDecline },
          { source: 'Meta Ads', metric: 'Total Spend', value: `₹${Math.round(signal.spend).toLocaleString()}` }
        ],
        suggestedConcept: {
          hook: 'Fresh angle on same product/message',
          angle: 'Variation of winning elements with new execution',
          format: ['ugc_script', 'static_image'],
          targetEmotion: 'curiosity'
        },
        estimatedImpact: isCritical ? 'high' : 'medium',
        deadline: isCritical ? 'ASAP' : 'This week',
        createdAt: new Date().toISOString()
      });
    }
  }

  return opportunities;
}

function processCommentSignals(signals: CommentSignal[]): CreativeOpportunity[] {
  const opportunities: CreativeOpportunity[] = [];

  // Group by category
  const objections = signals.filter(s => s.category === 'objection' || s.category === 'question');
  const desires = signals.filter(s => s.category === 'desire');
  const praise = signals.filter(s => s.category === 'praise');
  const frustrations = signals.filter(s => s.category === 'frustration');

  // Process high-frequency objections (HIGH priority)
  for (const obj of objections.filter(o => o.frequency >= 3)) {
    opportunities.push({
      id: uuidv4(),
      type: 'objection_handler',
      urgency: obj.frequency >= 10 ? 'critical' : obj.frequency >= 5 ? 'high' : 'medium',
      title: `Address objection: "${obj.pattern}"`,
      reasoning: `${obj.frequency} customers mentioned "${obj.pattern}". This is blocking purchases. Create content that directly addresses this concern.`,
      dataPoints: [
        { source: 'Comment Mining', metric: 'Frequency', value: obj.frequency },
        { source: 'Comment Mining', metric: 'Category', value: obj.category },
        { source: 'Comment Mining', metric: 'Sample', value: obj.exampleComments[0] || '' }
      ],
      suggestedConcept: {
        hook: `"${obj.pattern}" — here's the truth...`,
        angle: 'Objection-handling with proof/demo',
        format: ['ugc_script', 'video_hook'],
        targetEmotion: 'reassurance'
      },
      estimatedImpact: 'high',
      deadline: obj.frequency >= 10 ? 'ASAP' : 'This week',
      createdAt: new Date().toISOString()
    });
  }

  // Process frustrations (HIGH priority if > 15% of comments)
  const totalComments = signals.reduce((sum, s) => sum + s.frequency, 0);
  const frustrationCount = frustrations.reduce((sum, s) => sum + s.frequency, 0);
  const frustrationRate = (frustrationCount / totalComments) * 100;

  if (frustrationRate > 15) {
    const topFrustration = frustrations.sort((a, b) => b.frequency - a.frequency)[0];
    if (topFrustration) {
      opportunities.push({
        id: uuidv4(),
        type: 'objection_handler',
        urgency: frustrationRate > 30 ? 'critical' : 'high',
        title: `Address frustration spike: ${Math.round(frustrationRate)}% frustrated`,
        reasoning: `${Math.round(frustrationRate)}% of comments show frustration. Top issue: "${topFrustration.pattern}". This needs immediate attention before it spreads.`,
        dataPoints: [
          { source: 'Comment Mining', metric: 'Frustration Rate', value: `${Math.round(frustrationRate)}%` },
          { source: 'Comment Mining', metric: 'Top Issue', value: topFrustration.pattern },
          { source: 'Comment Mining', metric: 'Frequency', value: topFrustration.frequency }
        ],
        suggestedConcept: {
          hook: 'We heard you. Here\'s what we\'re doing about it.',
          angle: 'Fear reversal / Trust building',
          format: ['ugc_script', 'static_image'],
          targetEmotion: 'relief'
        },
        estimatedImpact: 'high',
        deadline: 'ASAP',
        createdAt: new Date().toISOString()
      });
    }
  }

  // Process desires (MEDIUM priority)
  for (const desire of desires.filter(d => d.frequency >= 3).slice(0, 3)) {
    opportunities.push({
      id: uuidv4(),
      type: 'demand_signal',
      urgency: desire.frequency >= 10 ? 'high' : 'medium',
      title: `Tap into desire: "${desire.pattern}"`,
      reasoning: `${desire.frequency} customers expressed wanting "${desire.pattern}". This is validated demand — create content that amplifies this desire.`,
      dataPoints: [
        { source: 'Comment Mining', metric: 'Frequency', value: desire.frequency },
        { source: 'Comment Mining', metric: 'Emotional Intensity', value: desire.emotionalIntensity }
      ],
      suggestedConcept: {
        hook: `That feeling when ${desire.pattern.toLowerCase()}...`,
        angle: 'Desire amplification',
        format: ['video_hook', 'carousel'],
        targetEmotion: 'desire'
      },
      estimatedImpact: 'medium',
      createdAt: new Date().toISOString()
    });
  }

  // Process praise (MEDIUM priority - social proof opportunity)
  for (const p of praise.filter(pr => pr.frequency >= 5).slice(0, 2)) {
    opportunities.push({
      id: uuidv4(),
      type: 'social_proof',
      urgency: 'medium',
      title: `Leverage praise: "${p.pattern}"`,
      reasoning: `${p.frequency} customers said "${p.pattern}". This is ready-made social proof — use their exact words in ads.`,
      dataPoints: [
        { source: 'Comment Mining', metric: 'Frequency', value: p.frequency },
        { source: 'Comment Mining', metric: 'Sample', value: p.exampleComments[0] || '' }
      ],
      suggestedConcept: {
        hook: `"${p.pattern}" — real customers, real words`,
        angle: 'Social proof / Testimonial',
        format: ['static_image', 'carousel', 'ugc_script'],
        targetEmotion: 'trust'
      },
      estimatedImpact: 'medium',
      createdAt: new Date().toISOString()
    });
  }

  return opportunities;
}

function processCompetitorSignals(signals: CompetitorSignal[]): CreativeOpportunity[] {
  const opportunities: CreativeOpportunity[] = [];

  for (const signal of signals.slice(0, 3)) {
    opportunities.push({
      id: uuidv4(),
      type: 'competitor_gap',
      urgency: 'medium',
      title: `Competitor gap: ${signal.gap}`,
      reasoning: `${signal.competitorName} is not covering "${signal.gap}". ${signal.description}. Opportunity: ${signal.opportunity}`,
      dataPoints: [
        { source: 'Competitor Intel', metric: 'Competitor', value: signal.competitorName },
        { source: 'Competitor Intel', metric: 'Gap', value: signal.gap }
      ],
      suggestedConcept: {
        hook: signal.opportunity.split('.')[0],
        angle: 'Differentiation / Gap filling',
        format: ['static_image', 'video_hook'],
        targetEmotion: 'confidence'
      },
      estimatedImpact: 'medium',
      createdAt: new Date().toISOString()
    });
  }

  return opportunities;
}

function processPerformanceSignals(signal: PerformanceSignal): CreativeOpportunity[] {
  const opportunities: CreativeOpportunity[] = [];

  // Winner variations (scale what's working)
  const topCreative = signal.topCreatives[0];
  if (topCreative && topCreative.roas >= 3) {
    opportunities.push({
      id: uuidv4(),
      type: 'winner_variation',
      urgency: 'high',
      title: `Scale winner: Create variations of "${topCreative.name}"`,
      reasoning: `"${topCreative.name}" is achieving ${topCreative.roas.toFixed(1)}x ROAS with ₹${Math.round(topCreative.spend).toLocaleString()} spend. Create 3-5 variations to scale without fatiguing the original.`,
      dataPoints: [
        { source: 'Meta Ads', metric: 'ROAS', value: `${topCreative.roas.toFixed(1)}x` },
        { source: 'Meta Ads', metric: 'Spend', value: `₹${Math.round(topCreative.spend).toLocaleString()}` },
        { source: 'Meta Ads', metric: 'Format', value: topCreative.format }
      ],
      suggestedConcept: {
        hook: 'Same winning message, fresh execution',
        angle: 'Hook variation / Visual variation / Format variation',
        format: [topCreative.format, 'ugc_script'],
        targetEmotion: 'same as original'
      },
      estimatedImpact: 'high',
      deadline: 'This week',
      createdAt: new Date().toISOString()
    });
  }

  // Format tests (underused formats)
  const formatEntries = Object.entries(signal.formatBreakdown);
  const underusedFormats = formatEntries
    .filter(([_, data]) => data.count <= 2 && data.avgRoas >= 2)
    .slice(0, 2);

  for (const [format, data] of underusedFormats) {
    opportunities.push({
      id: uuidv4(),
      type: 'format_test',
      urgency: 'low',
      title: `Test underused format: ${format}`,
      reasoning: `${format} has only ${data.count} creatives but ${data.avgRoas.toFixed(1)}x average ROAS. Worth testing more in this format.`,
      dataPoints: [
        { source: 'Meta Ads', metric: 'Current Count', value: data.count },
        { source: 'Meta Ads', metric: 'Avg ROAS', value: `${data.avgRoas.toFixed(1)}x` }
      ],
      suggestedConcept: {
        hook: 'Apply winning angles to new format',
        angle: 'Format diversification',
        format: [format],
        targetEmotion: 'varies'
      },
      estimatedImpact: 'medium',
      createdAt: new Date().toISOString()
    });
  }

  return opportunities;
}

// ============================================================================
// SORTING & SCORING
// ============================================================================

function sortOpportunities(opportunities: CreativeOpportunity[]): CreativeOpportunity[] {
  const urgencyScore: Record<UrgencyLevel, number> = {
    critical: 100,
    high: 75,
    medium: 50,
    low: 25
  };

  const impactScore: Record<string, number> = {
    high: 30,
    medium: 20,
    low: 10
  };

  const typeBoost: Record<OpportunityType, number> = {
    fatigue_replacement: 20,
    objection_handler: 15,
    demand_signal: 10,
    competitor_gap: 5,
    trend_ride: 10,
    social_proof: 5,
    format_test: 0,
    seasonal_prep: 5,
    winner_variation: 15,
    audience_expansion: 5
  };

  return opportunities.sort((a, b) => {
    const scoreA = urgencyScore[a.urgency] + impactScore[a.estimatedImpact] + typeBoost[a.type];
    const scoreB = urgencyScore[b.urgency] + impactScore[b.estimatedImpact] + typeBoost[b.type];
    return scoreB - scoreA;
  });
}

// ============================================================================
// HTML REPORT GENERATION
// ============================================================================

export function generateOpportunityHTML(result: OpportunityQueueResult, brandName: string): string {
  const urgencyColors: Record<UrgencyLevel, string> = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#6b7280'
  };

  const typeIcons: Record<OpportunityType, string> = {
    fatigue_replacement: '🔄',
    objection_handler: '🛡️',
    demand_signal: '🎯',
    competitor_gap: '🏆',
    trend_ride: '📈',
    social_proof: '⭐',
    format_test: '🧪',
    seasonal_prep: '📅',
    winner_variation: '🚀',
    audience_expansion: '👥'
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>What Should We Create Next? — ${brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.6; }
    .container { max-width: 1000px; margin: 0 auto; padding: 40px 20px; }

    .header { margin-bottom: 40px; }
    .header h1 { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
    .header .subtitle { color: #888; font-size: 16px; }
    .header .brand { color: #EC8A23; }

    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 40px; }
    .summary-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; text-align: center; }
    .summary-card .count { font-size: 36px; font-weight: 700; }
    .summary-card .label { color: #888; font-size: 13px; text-transform: uppercase; margin-top: 4px; }

    .critical-count { color: #ef4444; }
    .high-count { color: #f59e0b; }
    .medium-count { color: #3b82f6; }
    .low-count { color: #6b7280; }

    .top-priority { background: linear-gradient(135deg, #1a1a1a, #252525); border: 1px solid #EC8A23; border-radius: 12px; padding: 24px; margin-bottom: 40px; }
    .top-priority h2 { color: #EC8A23; font-size: 14px; text-transform: uppercase; margin-bottom: 12px; }
    .top-priority p { font-size: 20px; font-weight: 600; }

    .opportunities { display: flex; flex-direction: column; gap: 20px; }
    .opportunity { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; border-left: 4px solid; }
    .opportunity-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
    .opportunity-title { font-size: 18px; font-weight: 600; }
    .opportunity-type { font-size: 12px; color: #888; margin-top: 4px; }
    .urgency-badge { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; }

    .opportunity-reasoning { color: #aaa; margin-bottom: 16px; }

    .data-points { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
    .data-point { background: #1a1a1a; padding: 8px 12px; border-radius: 8px; font-size: 12px; }
    .data-point .label { color: #666; }
    .data-point .value { color: #EC8A23; font-weight: 600; margin-left: 4px; }

    .suggested-concept { background: #1a1a1a; border-radius: 8px; padding: 16px; }
    .suggested-concept h4 { color: #888; font-size: 12px; text-transform: uppercase; margin-bottom: 12px; }
    .concept-row { display: flex; gap: 24px; flex-wrap: wrap; }
    .concept-item { flex: 1; min-width: 200px; }
    .concept-item .label { color: #666; font-size: 11px; text-transform: uppercase; }
    .concept-item .value { margin-top: 4px; }

    .deadline { color: #ef4444; font-weight: 600; margin-top: 12px; font-size: 13px; }

    .footer { margin-top: 60px; text-align: center; color: #666; font-size: 13px; }
    .footer-logo { font-size: 20px; font-weight: 700; color: #EC8A23; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>What Should We Create Next?</h1>
      <p class="subtitle">Creative opportunities for <span class="brand">${brandName}</span></p>
      <p class="subtitle">Generated ${new Date(result.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    </div>

    <div class="summary">
      <div class="summary-card">
        <div class="count critical-count">${result.summary.critical}</div>
        <div class="label">Critical</div>
      </div>
      <div class="summary-card">
        <div class="count high-count">${result.summary.high}</div>
        <div class="label">High</div>
      </div>
      <div class="summary-card">
        <div class="count medium-count">${result.summary.medium}</div>
        <div class="label">Medium</div>
      </div>
      <div class="summary-card">
        <div class="count low-count">${result.summary.low}</div>
        <div class="label">Low</div>
      </div>
    </div>

    ${result.summary.critical > 0 || result.summary.high > 0 ? `
    <div class="top-priority">
      <h2>🚨 Top Priority</h2>
      <p>${result.summary.topPriority}</p>
    </div>
    ` : ''}

    <div class="opportunities">
      ${result.opportunities.map((opp, idx) => `
        <div class="opportunity" style="border-left-color: ${urgencyColors[opp.urgency]}">
          <div class="opportunity-header">
            <div>
              <div class="opportunity-title">${typeIcons[opp.type]} ${opp.title}</div>
              <div class="opportunity-type">${opp.type.replace(/_/g, ' ')}</div>
            </div>
            <span class="urgency-badge" style="background: ${urgencyColors[opp.urgency]}20; color: ${urgencyColors[opp.urgency]}">${opp.urgency}</span>
          </div>

          <p class="opportunity-reasoning">${opp.reasoning}</p>

          <div class="data-points">
            ${opp.dataPoints.map(dp => `
              <div class="data-point">
                <span class="label">${dp.metric}:</span>
                <span class="value">${dp.value}</span>
              </div>
            `).join('')}
          </div>

          <div class="suggested-concept">
            <h4>Suggested Concept</h4>
            <div class="concept-row">
              <div class="concept-item">
                <div class="label">Hook</div>
                <div class="value">${opp.suggestedConcept.hook}</div>
              </div>
              <div class="concept-item">
                <div class="label">Angle</div>
                <div class="value">${opp.suggestedConcept.angle}</div>
              </div>
              <div class="concept-item">
                <div class="label">Format</div>
                <div class="value">${opp.suggestedConcept.format.join(', ')}</div>
              </div>
              <div class="concept-item">
                <div class="label">Emotion</div>
                <div class="value">${opp.suggestedConcept.targetEmotion}</div>
              </div>
            </div>
          </div>

          ${opp.deadline ? `<p class="deadline">⏰ Deadline: ${opp.deadline}</p>` : ''}
        </div>
      `).join('')}
    </div>

    <div class="footer">
      <div class="footer-logo">The Bridge Service</div>
      <p>Powered by Cosmisk Creative Intelligence</p>
      <p style="margin-top:8px"><a href="https://smashed.agency/scan" style="color:#EC8A23">smashed.agency/scan</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
