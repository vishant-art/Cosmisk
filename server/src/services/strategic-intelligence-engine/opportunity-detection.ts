/**
 * Strategic Intelligence Engine — Strategic Opportunity Detection
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  StrategicOpportunity,
  AudiencePsychologyReport,
  CommentSignalInput
} from './types.js';

export function detectStrategicOpportunities(
  audiencePsychology: AudiencePsychologyReport,
  commentSignals: CommentSignalInput[],
  competitorGaps: string[]
): StrategicOpportunity[] {
  const opportunities: StrategicOpportunity[] = [];

  // TRUST DIFFERENTIATION OPPORTUNITY
  if (audiencePsychology.trustLandscape.trustOpportunities.length > 0) {
    opportunities.push({
      id: uuidv4(),
      leverage: 'high',
      opportunityType: 'trust',
      signal: audiencePsychology.trustLandscape.trustOpportunities.join('; '),
      interpretation: `While competitors optimize for aspiration, the audience is hungry for authenticity and proof. Trust-first positioning creates differentiation in a category where everyone is selling dreams.`,
      strategicValue: `Trust becomes the moat. Brands that solve the "is this real?" question first capture the audience that competitors lose to skepticism. This is an acquisition efficiency play, not just a brand play.`,
      competitiveEdge: `Competitors are optimizing aspiration but ignoring purchase-anxiety reduction. First-mover advantage on trust infrastructure captures the "want to buy but scared" segment that represents significant latent demand.`,
      narrativeDirection: `Position as the brand that earns trust before asking for purchase. Lead with proof, follow with aspiration.`,
      emotionalTerritory: `Confidence, reassurance, belonging to a community of verified satisfied customers`,
      creativeSystemRecommendation: [
        'Operational transparency content series',
        'Customer verification as acquisition creative',
        'Behind-the-scenes as brand differentiator',
        'Founder accessibility as trust signal'
      ],
      founderInsight: `Your competitors are fighting for attention. You can win by fighting for trust. The audience already wants to buy—they need permission to believe.`,
      detectedAt: new Date().toISOString()
    });
  }

  // CUSTOMER VOICE LEVERAGE OPPORTUNITY
  const praisePatterns = commentSignals.filter(s => s.category === 'praise');
  const strongPraise = praisePatterns.filter(p => p.frequency >= 5);

  if (strongPraise.length >= 2) {
    opportunities.push({
      id: uuidv4(),
      leverage: 'high',
      opportunityType: 'narrative',
      signal: `${strongPraise.length} praise patterns with 5+ repetitions: ${strongPraise.slice(0, 3).map(p => `"${p.pattern}"`).join(', ')}`,
      interpretation: `Customer language reveals what actually resonates. These aren't marketing messages—they're organic validation. The audience is already writing your copy; you're just not using it.`,
      strategicValue: `Customer-language creative outperforms brand-language creative because it bypasses "this is an ad" skepticism. Using their exact words creates recognition: "this is for people like me."`,
      competitiveEdge: `Competitors use agency copywriting. Customer voice is un-copyable because it requires earning the praise first. This is earned creative advantage.`,
      narrativeDirection: `Lead with customer quotes as headlines. Their words are more persuasive than your copywriter's words because they're obviously not manufactured.`,
      emotionalTerritory: `Social validation, belonging, "people like me already love this"`,
      creativeSystemRecommendation: [
        'Customer quote extraction system',
        'Praise-to-headline conversion pipeline',
        'Social proof density optimization',
        'Comment screenshot creative rotation'
      ],
      founderInsight: `Your best copy has already been written—by your customers. You just need to systematize extracting and deploying it. This is not UGC; this is customer-authored messaging.`,
      detectedAt: new Date().toISOString()
    });
  }

  // OBJECTION AS POSITIONING OPPORTUNITY
  const topObjections = commentSignals
    .filter(s => s.category === 'objection' || s.category === 'question')
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 3);

  if (topObjections.length > 0 && topObjections[0].frequency >= 5) {
    opportunities.push({
      id: uuidv4(),
      leverage: 'transformational',
      opportunityType: 'positioning',
      signal: `Top objection "${topObjections[0].pattern}" appears ${topObjections[0].frequency}x — this is the primary purchase blocker.`,
      interpretation: `This objection represents latent demand blocked by a specific concern. Every person voicing this concern represents 10-50 silent viewers with the same doubt. Addressing this doesn't just answer questions—it unlocks a conversion segment.`,
      strategicValue: `Objection-first content captures the "almost bought" segment that competitors let slip away. This is the highest-leverage creative investment: converting existing intent rather than generating new interest.`,
      competitiveEdge: `Competitors address objections reactively (customer service) not proactively (acquisition creative). Objection-first acquisition creative is a strategic weapon.`,
      narrativeDirection: `Lead with the objection. "Worried about [X]? Here's exactly what happens." This disarms skepticism by acknowledging it first.`,
      emotionalTerritory: `Relief, reassurance, "they understand my concern," confidence`,
      creativeSystemRecommendation: [
        'Objection-first hook system',
        'Objection → proof content pairs',
        'Retargeting sequence by objection type',
        'FAQ-to-creative conversion pipeline'
      ],
      founderInsight: `Your biggest objection is your biggest opportunity. You're not overcoming resistance—you're unlocking blocked demand. Every objection is a market segment waiting to convert.`,
      detectedAt: new Date().toISOString()
    });
  }

  return opportunities.sort((a, b) => {
    const leverageOrder = { transformational: 0, high: 1, medium: 2, low: 3 };
    return leverageOrder[a.leverage] - leverageOrder[b.leverage];
  });
}
