/**
 * Strategic Intelligence Engine — "What Should We Create Next?" v2
 *
 * NOT a recommendation engine.
 * A strategic interpretation system that synthesizes:
 * - WHY audience behavior is changing
 * - WHAT underlying systems are shifting
 * - WHAT strategic direction should happen next
 *
 * Evolves from: OBSERVATION → INTERPRETATION → STRATEGIC DIRECTION
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// ============================================================================
// TYPES — STRATEGIC DEPTH, NOT TACTICAL RECOMMENDATIONS
// ============================================================================

/**
 * Audience State — not sentiment, but psychological position
 */
export type AudienceState =
  | 'trust_intact'           // Baseline: audience trusts brand
  | 'curiosity_rising'       // New interest, evaluating
  | 'legitimacy_skepticism'  // Actively questioning if brand is real
  | 'purchase_anxiety'       // Wants to buy, but blocked by fear
  | 'trust_erosion'          // Trust declining over time
  | 'trust_contamination'    // Negative sentiment spreading
  | 'aspiration_fatigue'     // Tired of aspirational messaging
  | 'authenticity_hunger'    // Craving real, unpolished content
  | 'price_sensitivity_spike'// Economic anxiety affecting decisions
  | 'competitive_comparison' // Actively comparing alternatives
  | 'post_purchase_doubt'    // Buyer's remorse signals
  | 'community_formation';   // Loyal customer emergence

/**
 * Strategic Risk — business impact, not just observations
 */
export interface StrategicRisk {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  riskType: 'trust' | 'cac' | 'positioning' | 'scaling' | 'retention' | 'perception';

  // The interpretation, not just the observation
  observation: string;      // What we see
  interpretation: string;   // What it means psychologically
  businessImpact: string;   // What it means for the business
  strategicImplication: string; // What direction this suggests

  // Quantified impact
  estimatedImpact: {
    cacIncrease?: string;      // e.g., "+15-25%"
    conversionDecline?: string; // e.g., "-20-30%"
    trustScore?: string;        // e.g., "Declining"
    scalingRisk?: string;       // e.g., "High"
  };

  // What to do about it
  strategicDirection: string[];
  creativeSystemsNeeded: string[];

  detectedAt: string;
}

/**
 * Strategic Opportunity — not just "create more ads"
 */
export interface StrategicOpportunity {
  id: string;
  leverage: 'transformational' | 'high' | 'medium' | 'low';
  opportunityType: 'positioning' | 'trust' | 'narrative' | 'audience' | 'competitive' | 'emotional';

  // Deep interpretation
  signal: string;           // What we detected
  interpretation: string;   // What it reveals about audience psychology
  strategicValue: string;   // Why this matters strategically
  competitiveEdge: string;  // How this differentiates from competitors

  // Strategic direction
  narrativeDirection: string;
  emotionalTerritory: string;
  creativeSystemRecommendation: string[];

  // Founder-level insight
  founderInsight: string;   // The "wow" realization

  detectedAt: string;
}

/**
 * Audience Psychology Report — not comment summary
 */
export interface AudiencePsychologyReport {
  // Current state
  dominantState: AudienceState;
  stateTransitions: {
    from: AudienceState;
    to: AudienceState;
    confidence: number;
    evidence: string[];
  }[];

  // Psychological landscape
  trustLandscape: {
    overallTrust: 'strong' | 'stable' | 'fragile' | 'eroding' | 'contaminated';
    trustThreats: string[];
    trustOpportunities: string[];
  };

  emotionalLandscape: {
    dominantEmotions: string[];
    emergingEmotions: string[];
    fadingEmotions: string[];
    emotionalShifts: string[];
  };

  buyingFriction: {
    primaryBlockers: string[];
    hiddenFriction: string[];
    frictionTrend: 'increasing' | 'stable' | 'decreasing';
  };

  // Strategic interpretation
  strategicInterpretation: string;
}

/**
 * Category Intelligence — what's happening in the market
 */
export interface CategoryIntelligence {
  persuasionSaturation: {
    saturatedApproaches: string[];
    emergingApproaches: string[];
    underexploitedApproaches: string[];
  };

  narrativeShifts: {
    decliningNarratives: string[];
    risingNarratives: string[];
    categoryGaps: string[];
  };

  audienceEvolution: {
    sophisticationLevel: 'naive' | 'aware' | 'skeptical' | 'cynical';
    trustRequirements: string[];
    authenticityExpectations: string[];
  };
}

/**
 * Full Strategic Intelligence Output
 */
export interface StrategicIntelligenceOutput {
  clientId: string;
  generatedAt: string;

  // Executive summary — the founder-level insight
  executiveSummary: {
    headline: string;
    strategicSituation: string;
    criticalRisk: string | null;
    highestLeverageOpportunity: string | null;
    recommendedDirection: string;
  };

  // Deep analysis
  audiencePsychology: AudiencePsychologyReport;
  categoryIntelligence: CategoryIntelligence;

  // Risks and opportunities
  risks: StrategicRisk[];
  opportunities: StrategicOpportunity[];

  // Strategic direction — not tactical recommendations
  strategicDirection: {
    narrativeEvolution: string;
    trustStrategy: string;
    emotionalTerritory: string;
    creativeSystemPriorities: string[];
    whatToStopDoing: string[];
    whatToStartDoing: string[];
  };
}

// ============================================================================
// AUDIENCE PSYCHOLOGY ANALYZER
// ============================================================================

interface CommentSignalInput {
  pattern: string;
  category: string;
  frequency: number;
  sentiment: string;
  examples: string[];
}

interface FatigueSignalInput {
  creativeName: string;
  fatigueScore: number;
  ctrDrop: number;
  daysSinceDecline: number;
}

interface PerformanceSignalInput {
  overallROAS: number;
  roasTrend: 'improving' | 'stable' | 'declining';
  cacTrend: 'improving' | 'stable' | 'increasing';
  topCreativeType: string;
}

/**
 * Analyze audience psychology from signals — not just summarize
 */
export function analyzeAudiencePsychology(
  commentSignals: CommentSignalInput[],
  categoryContext: { name: string; pricePoint: 'premium' | 'mid' | 'value' }
): AudiencePsychologyReport {

  // Calculate state indicators
  const totalComments = commentSignals.reduce((sum, s) => sum + s.frequency, 0);

  const frustrationRate = commentSignals
    .filter(s => s.category === 'frustration')
    .reduce((sum, s) => sum + s.frequency, 0) / totalComments;

  const objectionRate = commentSignals
    .filter(s => s.category === 'objection' || s.category === 'question')
    .reduce((sum, s) => sum + s.frequency, 0) / totalComments;

  const praiseRate = commentSignals
    .filter(s => s.category === 'praise')
    .reduce((sum, s) => sum + s.frequency, 0) / totalComments;

  // Detect specific psychological signals
  const trustSignals = commentSignals.filter(s =>
    s.pattern.toLowerCase().match(/fraud|fake|scam|legit|real|trust|genuine|authentic/)
  );
  const hasTrustCrisis = trustSignals.reduce((sum, s) => sum + s.frequency, 0) > totalComments * 0.05;

  const pricingSignals = commentSignals.filter(s =>
    s.pattern.toLowerCase().match(/price|expensive|cost|worth|afford|cheap/)
  );
  const hasPriceSensitivity = pricingSignals.reduce((sum, s) => sum + s.frequency, 0) > totalComments * 0.08;

  const qualitySignals = commentSignals.filter(s =>
    s.pattern.toLowerCase().match(/quality|material|fabric|last|durable/)
  );

  // Determine dominant state
  let dominantState: AudienceState;

  if (hasTrustCrisis && frustrationRate > 0.3) {
    dominantState = 'trust_contamination';
  } else if (hasTrustCrisis) {
    dominantState = 'legitimacy_skepticism';
  } else if (frustrationRate > 0.4) {
    dominantState = 'trust_erosion';
  } else if (objectionRate > 0.3 && hasPriceSensitivity) {
    dominantState = 'purchase_anxiety';
  } else if (hasPriceSensitivity) {
    dominantState = 'price_sensitivity_spike';
  } else if (praiseRate > 0.3) {
    dominantState = 'community_formation';
  } else if (objectionRate > 0.2) {
    dominantState = 'curiosity_rising';
  } else {
    dominantState = 'trust_intact';
  }

  // Detect state transitions
  const stateTransitions: AudiencePsychologyReport['stateTransitions'] = [];

  if (hasTrustCrisis && trustSignals.length > 0) {
    stateTransitions.push({
      from: 'curiosity_rising',
      to: 'legitimacy_skepticism',
      confidence: 0.8,
      evidence: trustSignals.map(s => `"${s.pattern}" mentioned ${s.frequency}x`)
    });
  }

  if (frustrationRate > 0.3 && objectionRate > 0.2) {
    stateTransitions.push({
      from: 'trust_intact',
      to: 'trust_erosion',
      confidence: 0.7,
      evidence: [`${Math.round(frustrationRate * 100)}% frustration rate`, `${Math.round(objectionRate * 100)}% objection rate`]
    });
  }

  // Build trust landscape
  let overallTrust: AudiencePsychologyReport['trustLandscape']['overallTrust'];
  if (hasTrustCrisis && frustrationRate > 0.3) {
    overallTrust = 'contaminated';
  } else if (hasTrustCrisis || frustrationRate > 0.25) {
    overallTrust = 'eroding';
  } else if (objectionRate > 0.2) {
    overallTrust = 'fragile';
  } else if (praiseRate > 0.2) {
    overallTrust = 'strong';
  } else {
    overallTrust = 'stable';
  }

  const trustThreats: string[] = [];
  const trustOpportunities: string[] = [];

  if (hasTrustCrisis) {
    trustThreats.push('Legitimacy skepticism is contaminating cold audience perception before website visit');
  }
  if (frustrationRate > 0.3) {
    trustThreats.push('Operational friction is eroding brand credibility in public comments');
  }
  if (qualitySignals.length > 0) {
    trustOpportunities.push('Quality validation content can convert skeptics into advocates');
  }
  if (praiseRate > 0.15) {
    trustOpportunities.push('Existing customer praise is under-leveraged as trust infrastructure');
  }

  // Build emotional landscape
  const dominantEmotions: string[] = [];
  const emergingEmotions: string[] = [];

  if (frustrationRate > 0.2) dominantEmotions.push('frustration');
  if (objectionRate > 0.2) dominantEmotions.push('skepticism');
  if (hasTrustCrisis) dominantEmotions.push('distrust');
  if (hasPriceSensitivity) dominantEmotions.push('price_anxiety');
  if (praiseRate > 0.15) dominantEmotions.push('satisfaction');

  if (hasTrustCrisis && categoryContext.pricePoint === 'premium') {
    emergingEmotions.push('legitimacy_verification_mode');
  }

  // Build buying friction analysis
  const primaryBlockers: string[] = [];
  const hiddenFriction: string[] = [];

  if (hasTrustCrisis) {
    primaryBlockers.push('Pre-purchase trust verification required');
    hiddenFriction.push('Cold audiences are researching brand legitimacy before even viewing products');
  }
  if (hasPriceSensitivity) {
    primaryBlockers.push('Value justification not clear');
    hiddenFriction.push('Price objections may mask deeper quality/trust concerns');
  }
  if (frustrationRate > 0.3) {
    primaryBlockers.push('Public negative sentiment affecting new buyer confidence');
    hiddenFriction.push('Operational issues becoming brand perception issues');
  }

  const frictionTrend: AudiencePsychologyReport['buyingFriction']['frictionTrend'] =
    frustrationRate > 0.3 || hasTrustCrisis ? 'increasing' :
    praiseRate > 0.2 ? 'decreasing' : 'stable';

  // Generate strategic interpretation
  let strategicInterpretation = '';

  if (dominantState === 'trust_contamination') {
    strategicInterpretation = `The audience has entered a legitimacy-verification state. Public distrust signals in comments are contaminating cold-audience perception before users even evaluate products. This is no longer a customer service issue—it is a brand trust infrastructure problem that will compound CAC and reduce conversion across all channels if not addressed systemically.`;
  } else if (dominantState === 'legitimacy_skepticism') {
    strategicInterpretation = `Rising legitimacy skepticism indicates the audience is transitioning from product evaluation to brand verification. First-time buyers are allocating cognitive resources to "is this real?" before "is this right for me?" This psychological shift requires trust-first creative systems before product-benefit messaging.`;
  } else if (dominantState === 'purchase_anxiety') {
    strategicInterpretation = `The audience demonstrates clear purchase intent blocked by specific anxieties. The desire exists—the friction is psychological, not informational. Reassurance-driven creative systems can unlock conversion that aspiration-focused content cannot reach.`;
  } else if (dominantState === 'trust_erosion') {
    strategicInterpretation = `Gradual trust erosion is occurring through accumulated small friction points. No single crisis, but consistent negative signal accumulation is shifting audience perception. Requires proactive trust-building before erosion reaches contamination threshold.`;
  } else if (dominantState === 'community_formation') {
    strategicInterpretation = `Positive audience signals indicate community formation potential. Customer advocacy is emerging organically—this represents a strategic asset that can be systematized into trust infrastructure for cold audience acquisition.`;
  } else {
    strategicInterpretation = `Audience psychology is in a stable state with manageable friction points. Standard optimization approach is viable, but monitoring for state transitions remains important.`;
  }

  return {
    dominantState,
    stateTransitions,
    trustLandscape: {
      overallTrust,
      trustThreats,
      trustOpportunities
    },
    emotionalLandscape: {
      dominantEmotions,
      emergingEmotions,
      fadingEmotions: [],
      emotionalShifts: stateTransitions.map(t => `${t.from} → ${t.to}`)
    },
    buyingFriction: {
      primaryBlockers,
      hiddenFriction,
      frictionTrend
    },
    strategicInterpretation
  };
}

// ============================================================================
// STRATEGIC RISK DETECTION
// ============================================================================

export function detectStrategicRisks(
  audiencePsychology: AudiencePsychologyReport,
  fatigueSignals: FatigueSignalInput[],
  performanceSignals: PerformanceSignalInput,
  commentSignals: CommentSignalInput[]
): StrategicRisk[] {
  const risks: StrategicRisk[] = [];

  // TRUST CONTAMINATION RISK
  if (audiencePsychology.trustLandscape.overallTrust === 'contaminated' ||
      audiencePsychology.trustLandscape.overallTrust === 'eroding') {

    const trustComments = commentSignals.filter(s =>
      s.pattern.toLowerCase().match(/fraud|fake|scam|legit/)
    );

    risks.push({
      id: uuidv4(),
      severity: audiencePsychology.trustLandscape.overallTrust === 'contaminated' ? 'critical' : 'high',
      riskType: 'trust',
      observation: `${trustComments.reduce((sum, s) => sum + s.frequency, 0)} comments questioning brand legitimacy. Trust landscape: ${audiencePsychology.trustLandscape.overallTrust}.`,
      interpretation: `The audience is entering legitimacy-verification mode. Cold traffic is now performing brand trust checks before product evaluation. Public skepticism in comments is contaminating perception for all viewers, not just commenters.`,
      businessImpact: `CAC will increase as conversion requires additional trust-building touchpoints. Cold audience conversion rate declining as first-click skepticism rises. Scaling becomes progressively harder as each new audience segment encounters public doubt signals.`,
      strategicImplication: `This is not a customer service issue—it is a brand trust infrastructure problem. Addressing individual complaints will not solve systemic perception contamination. Requires trust-first creative systems and operational transparency content.`,
      estimatedImpact: {
        cacIncrease: '+25-40%',
        conversionDecline: '-30-45%',
        trustScore: 'Critical decline',
        scalingRisk: 'High—new audiences encounter doubt signals'
      },
      strategicDirection: [
        'Founder visibility and transparency content',
        'Behind-the-scenes fulfillment documentation',
        'Proactive delivery tracking showcases',
        'COD reassurance for first-time buyers',
        'Customer unboxing aggregation as trust content',
        'Operational excellence as brand narrative'
      ],
      creativeSystemsNeeded: [
        'Trust-first acquisition funnel',
        'Legitimacy proof content library',
        'Founder transparency series',
        'Customer verification content system',
        'Operational proof creative rotation'
      ],
      detectedAt: new Date().toISOString()
    });
  }

  // CREATIVE FATIGUE AS STRATEGIC SIGNAL
  const highFatigueCreatives = fatigueSignals.filter(f => f.fatigueScore > 70);
  if (highFatigueCreatives.length > 0) {

    const avgCtrDrop = highFatigueCreatives.reduce((sum, f) => sum + f.ctrDrop, 0) / highFatigueCreatives.length;

    risks.push({
      id: uuidv4(),
      severity: avgCtrDrop > 40 ? 'high' : 'medium',
      riskType: 'cac',
      observation: `${highFatigueCreatives.length} creative(s) showing ${Math.round(avgCtrDrop)}% average CTR decline.`,
      interpretation: `The current creative approach is exhausting audience receptivity. This is not just creative fatigue—it indicates the emotional angle or narrative structure is saturating in the audience's mental space. The "reason to pay attention" is diminishing.`,
      businessImpact: `Continued spending on fatigued approaches compounds negative returns. Each impression reinforces audience dismissal patterns rather than consideration. CAC trajectory is unsustainable without narrative evolution.`,
      strategicImplication: `The winning factor in current creatives needs decomposition. Often, the surface execution (visuals, hook) is fatiguing while the underlying emotional structure remains viable. Requires identifying what's actually working versus what's exhausting.`,
      estimatedImpact: {
        cacIncrease: '+15-30%',
        conversionDecline: '-20-35%',
        scalingRisk: 'Medium—diminishing returns on proven concepts'
      },
      strategicDirection: [
        'Decompose winning creatives into transferable components',
        'Identify emotional structure vs. visual execution fatigue',
        'Develop variation strategy that preserves what works',
        'Test narrative evolution, not just visual refresh',
        'Consider format shift if emotional angle is saturated'
      ],
      creativeSystemsNeeded: [
        'Winning element extraction system',
        'Variation development with structure preservation',
        'Format diversification for proven emotional angles',
        'Narrative evolution testing framework'
      ],
      detectedAt: new Date().toISOString()
    });
  }

  // ASPIRATION FATIGUE RISK
  const desireComments = commentSignals.filter(s => s.category === 'desire');
  const praiseComments = commentSignals.filter(s => s.category === 'praise');
  const objectionComments = commentSignals.filter(s => s.category === 'objection' || s.category === 'question');

  const aspirationFatigueSignal =
    desireComments.length > 0 &&
    objectionComments.length > desireComments.length * 2 &&
    praiseComments.length < objectionComments.length;

  if (aspirationFatigueSignal) {
    risks.push({
      id: uuidv4(),
      severity: 'medium',
      riskType: 'positioning',
      observation: `Objection-to-desire ratio is ${(objectionComments.length / Math.max(desireComments.length, 1)).toFixed(1)}:1. Audience is questioning more than aspiring.`,
      interpretation: `The audience may be experiencing aspiration fatigue. They've seen enough "lifestyle promise" content—they now want proof, specifics, and reassurance. The persuasion system of "inspire desire" is saturating; "validate decision" is emerging.`,
      businessImpact: `Continued aspiration-heavy creative investment yields diminishing returns. Audience is psychologically past the "dream" stage and into "verify" stage. Creative spend is misaligned with audience psychological position.`,
      strategicImplication: `The category is maturing from aspiration-driven to validation-driven purchasing. Early-majority buyers require different persuasion architecture than early adopters. Creative strategy must evolve from "imagine having this" to "here's proof it works."`,
      estimatedImpact: {
        conversionDecline: '-15-25%',
        scalingRisk: 'Medium—aspiration approach reaching ceiling'
      },
      strategicDirection: [
        'Shift from aspiration to validation creative weight',
        'Increase proof-point density in content',
        'Feature customer verification, not just aspiration',
        'Lead with specifics, not lifestyle',
        'Develop "for people like you who already decided" content'
      ],
      creativeSystemsNeeded: [
        'Validation-first creative system',
        'Proof-point content library',
        'Customer verification showcase system',
        'Specificity-focused hooks'
      ],
      detectedAt: new Date().toISOString()
    });
  }

  return risks.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

// ============================================================================
// STRATEGIC OPPORTUNITY DETECTION
// ============================================================================

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

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

export function generateStrategicIntelligence(
  clientId: string,
  inputs: {
    commentSignals: CommentSignalInput[];
    fatigueSignals: FatigueSignalInput[];
    performanceSignals: PerformanceSignalInput;
    competitorGaps: string[];
    categoryContext: { name: string; pricePoint: 'premium' | 'mid' | 'value' };
  }
): StrategicIntelligenceOutput {

  // Analyze audience psychology
  const audiencePsychology = analyzeAudiencePsychology(
    inputs.commentSignals,
    inputs.categoryContext
  );

  // Detect strategic risks
  const risks = detectStrategicRisks(
    audiencePsychology,
    inputs.fatigueSignals,
    inputs.performanceSignals,
    inputs.commentSignals
  );

  // Detect strategic opportunities
  const opportunities = detectStrategicOpportunities(
    audiencePsychology,
    inputs.commentSignals,
    inputs.competitorGaps
  );

  // Build category intelligence
  const categoryIntelligence: CategoryIntelligence = {
    persuasionSaturation: {
      saturatedApproaches: audiencePsychology.dominantState === 'aspiration_fatigue'
        ? ['Lifestyle aspiration', 'Influencer endorsement', 'Trend-riding']
        : [],
      emergingApproaches: audiencePsychology.trustLandscape.overallTrust !== 'strong'
        ? ['Trust-first messaging', 'Proof-density content', 'Operational transparency']
        : ['Customer advocacy', 'Community building'],
      underexploitedApproaches: ['Objection-first acquisition', 'Customer language creative', 'Founder accessibility']
    },
    narrativeShifts: {
      decliningNarratives: audiencePsychology.buyingFriction.frictionTrend === 'increasing'
        ? ['Pure aspiration without proof', 'Price-justified messaging']
        : [],
      risingNarratives: ['Authenticity and transparency', 'Specificity over generality', 'Customer voice over brand voice'],
      categoryGaps: inputs.competitorGaps
    },
    audienceEvolution: {
      sophisticationLevel: audiencePsychology.dominantState === 'legitimacy_skepticism' ? 'skeptical' :
                          audiencePsychology.dominantState === 'trust_contamination' ? 'cynical' : 'aware',
      trustRequirements: audiencePsychology.trustLandscape.trustThreats.length > 0
        ? ['Proof before promise', 'Operational visibility', 'Customer verification']
        : ['Consistent quality', 'Brand reliability'],
      authenticityExpectations: ['Imperfection over polish', 'Founder visibility', 'Behind-the-scenes access']
    }
  };

  // Build executive summary
  const criticalRisk = risks.find(r => r.severity === 'critical');
  const topOpportunity = opportunities[0];

  let headline: string;
  let strategicSituation: string;
  let recommendedDirection: string;

  if (criticalRisk) {
    headline = `Critical: ${audiencePsychology.dominantState.replace(/_/g, ' ')} requires immediate strategic response`;
    strategicSituation = criticalRisk.interpretation;
    recommendedDirection = `Priority: ${criticalRisk.strategicDirection[0]}. ${criticalRisk.strategicImplication}`;
  } else if (topOpportunity?.leverage === 'transformational') {
    headline = `Transformational opportunity: ${topOpportunity.opportunityType} positioning available`;
    strategicSituation = topOpportunity.interpretation;
    recommendedDirection = topOpportunity.founderInsight;
  } else {
    headline = `Audience state: ${audiencePsychology.dominantState.replace(/_/g, ' ')}`;
    strategicSituation = audiencePsychology.strategicInterpretation;
    recommendedDirection = opportunities[0]?.founderInsight || 'Continue monitoring for state transitions.';
  }

  // Build strategic direction
  const strategicDirection = {
    narrativeEvolution: categoryIntelligence.narrativeShifts.risingNarratives[0] || 'Maintain current narrative',
    trustStrategy: audiencePsychology.trustLandscape.overallTrust === 'strong'
      ? 'Leverage existing trust for advocacy amplification'
      : 'Trust-first creative systems required before scaling',
    emotionalTerritory: topOpportunity?.emotionalTerritory || 'Confidence and validation',
    creativeSystemPriorities: [
      ...(criticalRisk?.creativeSystemsNeeded.slice(0, 2) || []),
      ...(topOpportunity?.creativeSystemRecommendation.slice(0, 2) || [])
    ],
    whatToStopDoing: categoryIntelligence.persuasionSaturation.saturatedApproaches.slice(0, 2),
    whatToStartDoing: categoryIntelligence.persuasionSaturation.emergingApproaches.slice(0, 3)
  };

  return {
    clientId,
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      headline,
      strategicSituation,
      criticalRisk: criticalRisk?.observation || null,
      highestLeverageOpportunity: topOpportunity?.signal || null,
      recommendedDirection
    },
    audiencePsychology,
    categoryIntelligence,
    risks,
    opportunities,
    strategicDirection
  };
}

// ============================================================================
// HTML REPORT GENERATION
// ============================================================================

export function generateStrategicIntelligenceHTML(output: StrategicIntelligenceOutput, brandName: string): string {
  const severityColors = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#6b7280'
  };

  const leverageColors = {
    transformational: '#8b5cf6',
    high: '#10b981',
    medium: '#3b82f6',
    low: '#6b7280'
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Strategic Intelligence — ${brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e5e5; line-height: 1.7; }
    .container { max-width: 1100px; margin: 0 auto; padding: 50px 24px; }

    .header { margin-bottom: 50px; }
    .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #fff; }
    .header .subtitle { color: #888; font-size: 14px; }
    .header .brand { color: #EC8A23; }

    .executive-summary { background: linear-gradient(135deg, #1a1a1a, #252525); border: 2px solid #EC8A23; border-radius: 16px; padding: 32px; margin-bottom: 50px; }
    .executive-summary h2 { color: #EC8A23; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
    .executive-headline { font-size: 24px; font-weight: 700; margin-bottom: 20px; line-height: 1.3; }
    .executive-situation { color: #ccc; margin-bottom: 24px; font-size: 15px; }
    .executive-direction { background: #0a0a0a; padding: 20px; border-radius: 12px; border-left: 4px solid #EC8A23; }
    .executive-direction h3 { color: #EC8A23; font-size: 11px; text-transform: uppercase; margin-bottom: 8px; }
    .executive-direction p { font-size: 15px; }

    .section { margin-bottom: 50px; }
    .section-title { font-size: 18px; font-weight: 600; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #2a2a2a; }

    .psychology-state { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; margin-bottom: 24px; }
    .state-label { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 8px; }
    .state-value { font-size: 20px; font-weight: 600; color: #EC8A23; margin-bottom: 16px; }
    .state-interpretation { color: #aaa; font-size: 14px; line-height: 1.7; }

    .trust-landscape { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 24px; }
    .trust-card { background: #1a1a1a; padding: 16px; border-radius: 8px; }
    .trust-card h4 { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 12px; }
    .trust-card ul { list-style: none; font-size: 13px; }
    .trust-card li { padding: 6px 0; border-bottom: 1px solid #252525; }
    .trust-card li:last-child { border: none; }

    .risk-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; margin-bottom: 20px; border-left: 4px solid; }
    .risk-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
    .risk-type { font-size: 11px; color: #888; text-transform: uppercase; }
    .risk-severity { padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 600; text-transform: uppercase; }

    .risk-section { margin-bottom: 16px; }
    .risk-section-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 6px; }
    .risk-section-content { font-size: 14px; color: #ccc; }

    .risk-impact { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
    .impact-item { background: #1a1a1a; padding: 8px 14px; border-radius: 6px; font-size: 12px; }
    .impact-label { color: #888; }
    .impact-value { color: #ef4444; font-weight: 600; margin-left: 4px; }

    .risk-actions { background: #0a0a0a; padding: 16px; border-radius: 8px; }
    .risk-actions h4 { font-size: 11px; color: #EC8A23; text-transform: uppercase; margin-bottom: 12px; }
    .risk-actions ul { list-style: none; font-size: 13px; }
    .risk-actions li { padding: 4px 0; padding-left: 16px; position: relative; }
    .risk-actions li:before { content: "→"; position: absolute; left: 0; color: #EC8A23; }

    .opportunity-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; margin-bottom: 20px; border-left: 4px solid; }
    .opportunity-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
    .opp-type { font-size: 11px; color: #888; text-transform: uppercase; }
    .opp-leverage { padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 600; text-transform: uppercase; }

    .founder-insight { background: linear-gradient(135deg, #1a1a1a, #0a0a0a); border: 1px solid #EC8A23; padding: 20px; border-radius: 12px; margin-top: 16px; }
    .founder-insight h4 { color: #EC8A23; font-size: 11px; text-transform: uppercase; margin-bottom: 8px; }
    .founder-insight p { font-size: 15px; font-style: italic; color: #fff; }

    .strategic-direction { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 24px; }
    .direction-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
    .direction-item h4 { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 12px; }
    .direction-item p { font-size: 14px; color: #ccc; }
    .direction-item ul { list-style: none; font-size: 13px; }
    .direction-item li { padding: 4px 0; }
    .stop { color: #ef4444; }
    .start { color: #10b981; }

    .footer { margin-top: 60px; text-align: center; color: #666; font-size: 13px; }
    .footer-logo { font-size: 20px; font-weight: 700; color: #EC8A23; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Strategic Intelligence Report</h1>
      <p class="subtitle">Audience psychology & strategic direction for <span class="brand">${brandName}</span></p>
      <p class="subtitle">Generated ${new Date(output.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    </div>

    <div class="executive-summary">
      <h2>Executive Summary</h2>
      <div class="executive-headline">${output.executiveSummary.headline}</div>
      <p class="executive-situation">${output.executiveSummary.strategicSituation}</p>
      <div class="executive-direction">
        <h3>Recommended Direction</h3>
        <p>${output.executiveSummary.recommendedDirection}</p>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Audience Psychology</h2>
      <div class="psychology-state">
        <div class="state-label">Dominant Audience State</div>
        <div class="state-value">${output.audiencePsychology.dominantState.replace(/_/g, ' ')}</div>
        <p class="state-interpretation">${output.audiencePsychology.strategicInterpretation}</p>

        <div class="trust-landscape">
          <div class="trust-card">
            <h4>Trust Threats</h4>
            <ul>
              ${output.audiencePsychology.trustLandscape.trustThreats.length > 0
                ? output.audiencePsychology.trustLandscape.trustThreats.map(t => `<li>${t}</li>`).join('')
                : '<li style="color:#666">No critical threats detected</li>'}
            </ul>
          </div>
          <div class="trust-card">
            <h4>Trust Opportunities</h4>
            <ul>
              ${output.audiencePsychology.trustLandscape.trustOpportunities.length > 0
                ? output.audiencePsychology.trustLandscape.trustOpportunities.map(t => `<li>${t}</li>`).join('')
                : '<li style="color:#666">Building on stable foundation</li>'}
            </ul>
          </div>
        </div>
      </div>
    </div>

    ${output.risks.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Strategic Risks</h2>
      ${output.risks.map(risk => `
        <div class="risk-card" style="border-left-color: ${severityColors[risk.severity]}">
          <div class="risk-header">
            <div>
              <div class="risk-type">${risk.riskType} risk</div>
            </div>
            <span class="risk-severity" style="background: ${severityColors[risk.severity]}20; color: ${severityColors[risk.severity]}">${risk.severity}</span>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Observation</div>
            <div class="risk-section-content">${risk.observation}</div>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Interpretation</div>
            <div class="risk-section-content">${risk.interpretation}</div>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Business Impact</div>
            <div class="risk-section-content">${risk.businessImpact}</div>
          </div>

          ${risk.estimatedImpact ? `
          <div class="risk-impact">
            ${risk.estimatedImpact.cacIncrease ? `<div class="impact-item"><span class="impact-label">CAC Impact:</span><span class="impact-value">${risk.estimatedImpact.cacIncrease}</span></div>` : ''}
            ${risk.estimatedImpact.conversionDecline ? `<div class="impact-item"><span class="impact-label">Conversion:</span><span class="impact-value">${risk.estimatedImpact.conversionDecline}</span></div>` : ''}
            ${risk.estimatedImpact.scalingRisk ? `<div class="impact-item"><span class="impact-label">Scaling Risk:</span><span class="impact-value">${risk.estimatedImpact.scalingRisk}</span></div>` : ''}
          </div>
          ` : ''}

          <div class="risk-section">
            <div class="risk-section-label">Strategic Implication</div>
            <div class="risk-section-content">${risk.strategicImplication}</div>
          </div>

          <div class="risk-actions">
            <h4>Strategic Direction</h4>
            <ul>
              ${risk.strategicDirection.map(d => `<li>${d}</li>`).join('')}
            </ul>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${output.opportunities.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Strategic Opportunities</h2>
      ${output.opportunities.map(opp => `
        <div class="opportunity-card" style="border-left-color: ${leverageColors[opp.leverage]}">
          <div class="opportunity-header">
            <div>
              <div class="opp-type">${opp.opportunityType} opportunity</div>
            </div>
            <span class="opp-leverage" style="background: ${leverageColors[opp.leverage]}20; color: ${leverageColors[opp.leverage]}">${opp.leverage}</span>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Signal Detected</div>
            <div class="risk-section-content">${opp.signal}</div>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Interpretation</div>
            <div class="risk-section-content">${opp.interpretation}</div>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Strategic Value</div>
            <div class="risk-section-content">${opp.strategicValue}</div>
          </div>

          <div class="risk-section">
            <div class="risk-section-label">Competitive Edge</div>
            <div class="risk-section-content">${opp.competitiveEdge}</div>
          </div>

          <div class="founder-insight">
            <h4>Founder Insight</h4>
            <p>"${opp.founderInsight}"</p>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Strategic Direction</h2>
      <div class="strategic-direction">
        <div class="direction-grid">
          <div class="direction-item">
            <h4>Trust Strategy</h4>
            <p>${output.strategicDirection.trustStrategy}</p>
          </div>
          <div class="direction-item">
            <h4>Emotional Territory</h4>
            <p>${output.strategicDirection.emotionalTerritory}</p>
          </div>
          <div class="direction-item">
            <h4 class="stop">What to Stop Doing</h4>
            <ul>
              ${output.strategicDirection.whatToStopDoing.length > 0
                ? output.strategicDirection.whatToStopDoing.map(s => `<li class="stop">× ${s}</li>`).join('')
                : '<li style="color:#666">Continue current approach</li>'}
            </ul>
          </div>
          <div class="direction-item">
            <h4 class="start">What to Start Doing</h4>
            <ul>
              ${output.strategicDirection.whatToStartDoing.map(s => `<li class="start">+ ${s}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-logo">The Bridge Service</div>
      <p>Powered by Cosmisk Strategic Intelligence</p>
      <p style="margin-top:8px"><a href="https://smashed.agency/scan" style="color:#EC8A23">smashed.agency/scan</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
