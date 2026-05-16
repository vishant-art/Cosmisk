/**
 * Organic → Paid Intelligence Engine
 *
 * NOT a trend scraper.
 * A commercial creative intelligence system that identifies:
 * - WHY certain organic content creates purchase psychology
 * - WHY audiences emotionally attach (not just engage)
 * - WHY trust forms and whether it transfers to paid
 * - WHETHER content structure survives paid distribution
 *
 * The goal is commercially scalable storytelling, not virality.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { agentRecommend } from './recommendation-loop.js';
// STRATEGIC MEMORY - Week-to-week learning
import { recordEpisode } from './agent-memory.js';
import { getStrategicContextForAgent, recordReport, type ReportRecord } from './strategic-memory.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Commercial Conversion Potential — NOT virality score
 * Measures likelihood content structure drives purchases when adapted for paid
 */
export interface CCPScore {
  total: number; // 0-100
  breakdown: {
    purchasePsychology: number;      // 0-25: Does it create WANT, not just LIKE?
    trustTransferability: number;    // 0-25: Does trust survive "sponsored" context?
    coldAudienceViability: number;   // 0-20: Works for people who don't know creator?
    scalability: number;             // 0-15: Replicable, multi-format, cross-category?
    commentSignals: number;          // 0-15: Purchase intent in comments?
  };
  verdict: 'immediate_priority' | 'test_with_mods' | 'extract_elements' | 'not_viable';
  reasoning: string;
}

/**
 * Creator DNA — extractable trust mechanics
 */
export interface CreatorDNA {
  // Hook mechanics (0:00-0:03)
  hookMechanics: {
    eyeContact: 'direct' | 'indirect' | 'none';
    openingType: 'question' | 'statement' | 'demonstration' | 'story';
    energyLevel: number; // 1-10
    trustSignal: string; // e.g., "slight hesitation = authenticity"
  };
  // Authority building (0:03-0:12)
  authorityPattern: {
    credibilityMarker: string; // e.g., "I've tried 12 of these"
    relatabilityMoment: string; // e.g., "I was skeptical too"
    specificProof: boolean;
    pacingStyle: 'fast' | 'medium' | 'slow' | 'variable';
  };
  // Emotional escalation (0:12-0:22)
  emotionalArc: {
    productRevealTiming: number; // seconds
    demonstrationType: 'shows' | 'tells' | 'both';
    genuineReaction: boolean;
    stakesCommunicated: boolean;
  };
  // Conversion moment (0:22-0:30)
  conversionStyle: {
    ctaType: 'soft' | 'medium' | 'hard';
    urgencyType: 'implied' | 'explicit' | 'none';
    exitEnergy: 'confident' | 'desperate' | 'casual';
    overPromising: boolean;
  };
  // Transferable patterns
  transferablePatterns: string[];
  trustArchetype: 'reluctant_authority' | 'vulnerable_expertise' | 'specific_specificity' | 'demonstration_over_claim' | 'authentic_hesitation' | 'proportional_enthusiasm' | 'exit_confidence';
}

/**
 * Comment Intelligence — deep purchase psychology extraction
 */
export interface CommentIntelligence {
  // Surface layer
  sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
  intent: 'consideration' | 'ready_to_buy' | 'objection' | 'curiosity' | 'validation';

  // Purchase psychology layer
  purchasePsychology: {
    desireConfirmed: boolean;
    desireStrength: number; // 1-10
    activeObjection: string | null;
    purchaseBlocker: string | null;
    emotionalState: string; // e.g., "want-but-hesitant"
    conversionProbability: 'high' | 'medium' | 'low' | 'blocked';
  };

  // Creative strategy output
  strategyOutput: {
    hookSuggestion: string;
    proofNeeded: string[];
    emotionalArc: string; // e.g., "Fear → Reassurance → Confidence"
  };
}

/**
 * Trend Timing — lifecycle phase detection
 */
export type TrendPhase = 'emerge' | 'rise' | 'peak' | 'plateau' | 'decline' | 'cringe';

export interface TrendTiming {
  phase: TrendPhase;
  usageCount: number;
  brandsUsing: number;
  daysInPhase: number;
  estimatedDaysRemaining: number;
  categoryFit: number; // 0-100
  brandFit: number; // 0-100
  action: 'enter_now' | 'monitor' | 'enter_cautiously' | 'avoid' | 'exit_now' | 'never';
  reasoning: string;
}

/**
 * Organic content with commercial analysis
 */
export interface OrganicContentAnalysis {
  id: string;
  sourceUrl: string;
  platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook';

  // Scores
  ccpScore: CCPScore;
  creatorDNA: CreatorDNA | null;
  commentIntelligence: CommentIntelligence[];
  trendTiming: TrendTiming | null;

  // Commercial viability filter
  commercialViability: {
    passesFilter: boolean;
    rejectionReasons: string[];
    acceptanceReasons: string[];
  };

  // Adaptation potential
  adaptationPotential: {
    formats: ('meta_video' | 'ugc_script' | 'founder_ad' | 'static' | 'whatsapp' | 'landing_page' | 'email' | 'retention')[];
    primaryFormat: string;
    adaptationNotes: string;
  };

  analyzedAt: string;
}

// ============================================================================
// COMMERCIAL CONVERSION POTENTIAL SCORER
// ============================================================================

/**
 * Score content for commercial conversion potential
 * NOT virality — likelihood to drive purchases when adapted for paid
 */
export function scoreCCP(
  content: {
    hasDesireCreation: boolean;
    hasObjectionHandling: boolean;
    hasUrgency: boolean;
    hasProductValueClarity: boolean;
    trustCreatorDependent: boolean;
    hasProofDemonstration: boolean;
    survivesSponsored: boolean;
    hookWorksWithoutContext: boolean;
    storyIsSelfContained: boolean;
    hasInsiderReferences: boolean;
    structureReplicable: boolean;
    multiFormatPotential: boolean;
    crossCategoryPotential: boolean;
    purchaseIntentCommentRate: number; // 0-1
    objectionCommentRate: number; // 0-1
    emotionalValidationComments: boolean;
  }
): CCPScore {
  let purchasePsychology = 0;
  let trustTransferability = 0;
  let coldAudienceViability = 0;
  let scalability = 0;
  let commentSignals = 0;

  // Purchase Psychology (0-25)
  if (content.hasDesireCreation) purchasePsychology += 8;
  if (content.hasObjectionHandling) purchasePsychology += 7;
  if (content.hasUrgency) purchasePsychology += 5;
  if (content.hasProductValueClarity) purchasePsychology += 5;

  // Trust Transferability (0-25)
  if (!content.trustCreatorDependent) trustTransferability += 10;
  if (content.hasProofDemonstration) trustTransferability += 8;
  if (content.survivesSponsored) trustTransferability += 7;

  // Cold Audience Viability (0-20)
  if (content.hookWorksWithoutContext) coldAudienceViability += 10;
  if (content.storyIsSelfContained) coldAudienceViability += 5;
  if (!content.hasInsiderReferences) coldAudienceViability += 5;

  // Scalability (0-15)
  if (content.structureReplicable) scalability += 5;
  if (content.multiFormatPotential) scalability += 5;
  if (content.crossCategoryPotential) scalability += 5;

  // Comment Signals (0-15)
  if (content.purchaseIntentCommentRate > 0.05) commentSignals += 8;
  else if (content.purchaseIntentCommentRate > 0.02) commentSignals += 4;
  if (content.objectionCommentRate < 0.10) commentSignals += 4;
  if (content.emotionalValidationComments) commentSignals += 3;

  const total = purchasePsychology + trustTransferability + coldAudienceViability + scalability + commentSignals;

  let verdict: CCPScore['verdict'];
  let reasoning: string;

  if (total >= 70) {
    verdict = 'immediate_priority';
    reasoning = `Strong commercial conversion potential (${total}/100). Trust mechanics transfer well, purchase psychology present, structure scalable.`;
  } else if (total >= 50) {
    verdict = 'test_with_mods';
    reasoning = `Moderate potential (${total}/100). May need trust-building modifications or stronger CTA for paid context.`;
  } else if (total >= 30) {
    verdict = 'extract_elements';
    reasoning = `Limited full adaptation potential (${total}/100). Extract specific elements (hook, proof moment, emotional arc) only.`;
  } else {
    verdict = 'not_viable';
    reasoning = `Not commercially viable (${total}/100). Entertainment value doesn't translate to purchase psychology.`;
  }

  return {
    total,
    breakdown: {
      purchasePsychology,
      trustTransferability,
      coldAudienceViability,
      scalability,
      commentSignals
    },
    verdict,
    reasoning
  };
}

// ============================================================================
// COMMERCIAL VIABILITY FILTER
// ============================================================================

/**
 * Filter organic content for commercial viability
 * Many viral posts do NOT scale as ads
 */
export function filterCommercialViability(
  content: {
    createsProductDesire: boolean;
    trustIndependentOfCreator: boolean;
    emotionalArcCreatesPurchaseUrgency: boolean;
    structureWorksForColdAudience: boolean;
    entertainmentOnly: boolean;
    creatorDependent: boolean;
    trendDependent: boolean;
    audienceSpecific: boolean;
  }
): { passesFilter: boolean; rejectionReasons: string[]; acceptanceReasons: string[] } {
  const rejectionReasons: string[] = [];
  const acceptanceReasons: string[] = [];

  // Rejection criteria
  if (content.entertainmentOnly) {
    rejectionReasons.push('Entertainment-only content — no purchase psychology present');
  }
  if (content.creatorDependent) {
    rejectionReasons.push('Creator-dependent trust — authority doesn\'t transfer to other presenters');
  }
  if (content.trendDependent) {
    rejectionReasons.push('Trend-dependent — content dies when trend dies');
  }
  if (content.audienceSpecific) {
    rejectionReasons.push('Audience-specific — doesn\'t scale to cold traffic');
  }

  // Acceptance criteria
  if (content.createsProductDesire) {
    acceptanceReasons.push('Creates product desire independent of creator');
  }
  if (content.trustIndependentOfCreator) {
    acceptanceReasons.push('Trust mechanics work even as "sponsored" content');
  }
  if (content.emotionalArcCreatesPurchaseUrgency) {
    acceptanceReasons.push('Emotional arc creates purchase urgency, not just entertainment');
  }
  if (content.structureWorksForColdAudience) {
    acceptanceReasons.push('Structure works for cold audiences who don\'t know the creator');
  }

  const passesFilter = rejectionReasons.length === 0 && acceptanceReasons.length >= 2;

  return { passesFilter, rejectionReasons, acceptanceReasons };
}

// ============================================================================
// CREATOR DNA EXTRACTION
// ============================================================================

/**
 * Extract transferable trust mechanics from creator behavior
 * NOT tracking creators — understanding WHY certain behaviors convert
 */
export function extractCreatorDNA(
  analysis: {
    // Hook (0:00-0:03)
    eyeContactPercentage: number;
    firstWordType: 'question' | 'statement' | 'exclamation';
    energyLevel: number;
    hasHesitation: boolean;

    // Authority (0:03-0:12)
    mentionsExperience: boolean;
    experienceStatement: string;
    showsSkepticism: boolean;
    usesSpecificNumbers: boolean;
    pacingVariation: number;

    // Escalation (0:12-0:22)
    productRevealTimestamp: number;
    demonstratesProduct: boolean;
    hasGenuineReaction: boolean;
    communicatesStakes: boolean;

    // Conversion (0:22-0:30)
    ctaStrength: number; // 1-10
    hasScarcity: boolean;
    endsConfidently: boolean;
    makesUnrealisticPromises: boolean;
  }
): CreatorDNA {
  // Determine trust archetype
  let trustArchetype: CreatorDNA['trustArchetype'] = 'proportional_enthusiasm';

  if (analysis.showsSkepticism && analysis.mentionsExperience) {
    trustArchetype = 'reluctant_authority';
  } else if (analysis.hasHesitation && analysis.mentionsExperience) {
    trustArchetype = 'vulnerable_expertise';
  } else if (analysis.usesSpecificNumbers) {
    trustArchetype = 'specific_specificity';
  } else if (analysis.demonstratesProduct && !analysis.makesUnrealisticPromises) {
    trustArchetype = 'demonstration_over_claim';
  } else if (analysis.hasHesitation) {
    trustArchetype = 'authentic_hesitation';
  } else if (analysis.endsConfidently && analysis.ctaStrength <= 5) {
    trustArchetype = 'exit_confidence';
  }

  // Extract transferable patterns
  const transferablePatterns: string[] = [];

  if (analysis.eyeContactPercentage > 0.8) {
    transferablePatterns.push('Maintain eye contact >80% of speaking time');
  }
  if (analysis.showsSkepticism) {
    transferablePatterns.push('Start with personal skepticism before endorsement');
  }
  if (analysis.hasHesitation) {
    transferablePatterns.push('Include natural pauses and self-corrections');
  }
  if (analysis.usesSpecificNumbers) {
    transferablePatterns.push('Use specific numbers and details, not generalizations');
  }
  if (analysis.demonstratesProduct) {
    transferablePatterns.push('Show, don\'t tell — live demonstration required');
  }
  if (analysis.hasGenuineReaction) {
    transferablePatterns.push('Allow genuine reaction at reveal — don\'t script emotion');
  }
  if (analysis.ctaStrength <= 5) {
    transferablePatterns.push('End with soft CTA — "link if you want" not "buy now"');
  }

  return {
    hookMechanics: {
      eyeContact: analysis.eyeContactPercentage > 0.7 ? 'direct' : analysis.eyeContactPercentage > 0.3 ? 'indirect' : 'none',
      openingType: analysis.firstWordType === 'question' ? 'question' : 'statement',
      energyLevel: analysis.energyLevel,
      trustSignal: analysis.hasHesitation ? 'Natural hesitation signals authenticity' : 'Confident but not overly polished'
    },
    authorityPattern: {
      credibilityMarker: analysis.experienceStatement || 'Personal experience shared',
      relatabilityMoment: analysis.showsSkepticism ? 'Shows initial skepticism' : 'Shares relatable context',
      specificProof: analysis.usesSpecificNumbers,
      pacingStyle: analysis.pacingVariation > 0.7 ? 'variable' : analysis.pacingVariation > 0.4 ? 'medium' : 'consistent' as any
    },
    emotionalArc: {
      productRevealTiming: analysis.productRevealTimestamp,
      demonstrationType: analysis.demonstratesProduct ? 'shows' : 'tells',
      genuineReaction: analysis.hasGenuineReaction,
      stakesCommunicated: analysis.communicatesStakes
    },
    conversionStyle: {
      ctaType: analysis.ctaStrength <= 3 ? 'soft' : analysis.ctaStrength <= 6 ? 'medium' : 'hard',
      urgencyType: analysis.hasScarcity ? 'explicit' : 'implied',
      exitEnergy: analysis.endsConfidently ? 'confident' : 'casual',
      overPromising: analysis.makesUnrealisticPromises
    },
    transferablePatterns,
    trustArchetype
  };
}

// ============================================================================
// TREND TIMING ENGINE
// ============================================================================

/**
 * Determine trend phase and optimal action
 * The moat is NOT detection — it's timing
 */
export function analyzeTrendTiming(
  trend: {
    name: string;
    usageCount: number;
    usageCountYesterday: number;
    brandsUsing: number;
    daysActive: number;
    engagementRate: number;
    engagementRateYesterday: number;
    hasParodyContent: boolean;
    hasMainstreamBrands: boolean;
    pressConverage: boolean;
  },
  brand: {
    positioning: 'premium' | 'mass' | 'value';
    category: string;
    energyLevel: 'low' | 'medium' | 'high';
  }
): TrendTiming {
  // Determine phase
  let phase: TrendPhase;
  const growthRate = (trend.usageCount - trend.usageCountYesterday) / Math.max(trend.usageCountYesterday, 1);
  const engagementDecline = trend.engagementRateYesterday - trend.engagementRate;

  if (trend.usageCount < 1000 && trend.brandsUsing === 0) {
    phase = 'emerge';
  } else if (trend.usageCount < 50000 && growthRate > 0.2 && trend.brandsUsing < 10) {
    phase = 'rise';
  } else if (trend.usageCount < 500000 && !trend.hasParodyContent) {
    phase = 'peak';
  } else if (engagementDecline > 0.1 || trend.hasParodyContent) {
    phase = 'decline';
  } else if (trend.hasMainstreamBrands && trend.daysActive > 42) {
    phase = 'cringe';
  } else {
    phase = 'plateau';
  }

  // Calculate brand fit
  let brandFit = 50;

  // Premium brands should avoid high-energy chaotic trends
  if (brand.positioning === 'premium') {
    if (brand.energyLevel === 'low') brandFit += 20;
    if (brand.energyLevel === 'high') brandFit -= 30;
  }

  // Category fit would be calculated from historical data
  const categoryFit = 70; // Placeholder

  // Determine action
  let action: TrendTiming['action'];
  let reasoning: string;
  let estimatedDaysRemaining: number;

  switch (phase) {
    case 'emerge':
      action = 'monitor';
      reasoning = 'Too early — low confidence in commercial viability. Monitor for rise phase.';
      estimatedDaysRemaining = 30;
      break;
    case 'rise':
      if (brandFit >= 60) {
        action = 'enter_now';
        reasoning = `Optimal entry window. ${trend.usageCount.toLocaleString()} uses, only ${trend.brandsUsing} brands. High novelty, validated momentum.`;
      } else {
        action = 'monitor';
        reasoning = 'Rising trend but brand fit is low. May damage positioning.';
      }
      estimatedDaysRemaining = 14;
      break;
    case 'peak':
      action = 'enter_cautiously';
      reasoning = 'Still works but losing novelty. Enter only with strong differentiation.';
      estimatedDaysRemaining = 7;
      break;
    case 'plateau':
      action = 'avoid';
      reasoning = 'Saturated. CPM rising, conversion dropping. Diminishing returns.';
      estimatedDaysRemaining = 3;
      break;
    case 'decline':
      action = 'exit_now';
      reasoning = 'Audience fatigue confirmed. Exit immediately to preserve brand.';
      estimatedDaysRemaining = 0;
      break;
    case 'cringe':
      action = 'never';
      reasoning = 'Late adoption signals you\'re behind. Brand damage risk.';
      estimatedDaysRemaining = 0;
      break;
  }

  return {
    phase,
    usageCount: trend.usageCount,
    brandsUsing: trend.brandsUsing,
    daysInPhase: trend.daysActive,
    estimatedDaysRemaining,
    categoryFit,
    brandFit,
    action,
    reasoning
  };
}

// ============================================================================
// COMMENT INTELLIGENCE (DEEP)
// ============================================================================

/**
 * Extract deep purchase psychology from comment
 * Not just sentiment — full behavioral analysis
 */
export function analyzeCommentDeep(
  comment: string,
  classification: {
    category: 'objection' | 'desire' | 'praise' | 'question' | 'frustration' | 'use_case' | 'other';
    sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
    emotionalTriggers: string[];
  }
): CommentIntelligence {
  const lowerComment = comment.toLowerCase();

  // Detect purchase signals
  const purchaseSignals = [
    'where to buy', 'link', 'price', 'how much', 'need this', 'want this',
    'ordering', 'bought', 'getting this', 'take my money'
  ];
  const hasPurchaseIntent = purchaseSignals.some(s => lowerComment.includes(s));

  // Detect objections
  const objectionPatterns = [
    { pattern: /expensive|pric(e|y)|cost|worth|afford/, objection: 'price' },
    { pattern: /size|fit|sizing|too (big|small)/, objection: 'sizing' },
    { pattern: /fake|scam|fraud|legit|real/, objection: 'trust' },
    { pattern: /quality|cheap|last|durable/, objection: 'quality' },
    { pattern: /ship|deliver|arrive|time/, objection: 'shipping' },
    { pattern: /return|refund|exchange/, objection: 'returns' }
  ];

  let activeObjection: string | null = null;
  let purchaseBlocker: string | null = null;

  for (const op of objectionPatterns) {
    if (op.pattern.test(lowerComment)) {
      activeObjection = op.objection;
      if (classification.category === 'objection' || classification.category === 'question') {
        purchaseBlocker = `${op.objection} uncertainty`;
      }
      break;
    }
  }

  // Determine intent
  let intent: CommentIntelligence['intent'];
  if (hasPurchaseIntent && !activeObjection) {
    intent = 'ready_to_buy';
  } else if (hasPurchaseIntent && activeObjection) {
    intent = 'consideration';
  } else if (activeObjection) {
    intent = 'objection';
  } else if (classification.category === 'question') {
    intent = 'curiosity';
  } else {
    intent = 'validation';
  }

  // Determine conversion probability
  let conversionProbability: CommentIntelligence['purchasePsychology']['conversionProbability'];
  if (intent === 'ready_to_buy') {
    conversionProbability = 'high';
  } else if (intent === 'consideration') {
    conversionProbability = purchaseBlocker ? 'medium' : 'high';
  } else if (intent === 'objection') {
    conversionProbability = 'blocked';
  } else {
    conversionProbability = 'low';
  }

  // Determine emotional state
  let emotionalState = 'neutral';
  if (classification.sentiment === 'positive' && hasPurchaseIntent) {
    emotionalState = 'excited-to-buy';
  } else if (classification.sentiment === 'mixed') {
    emotionalState = 'want-but-hesitant';
  } else if (classification.sentiment === 'negative') {
    emotionalState = 'frustrated-or-skeptical';
  } else if (classification.category === 'praise') {
    emotionalState = 'validated-and-happy';
  }

  // Generate strategy output
  let hookSuggestion = '';
  let proofNeeded: string[] = [];
  let emotionalArc = '';

  if (activeObjection) {
    switch (activeObjection) {
      case 'price':
        hookSuggestion = '"Is it worth the price?" Let me show you...';
        proofNeeded = ['Value demonstration', 'Cost-per-use calculation', 'Quality longevity'];
        emotionalArc = 'Skepticism → Value Realization → Confidence';
        break;
      case 'sizing':
        hookSuggestion = '"Will it actually fit?" Here\'s the truth...';
        proofNeeded = ['Sizing guide', 'Fit guarantee', 'Customer fit photos'];
        emotionalArc = 'Uncertainty → Clarity → Confidence';
        break;
      case 'trust':
        hookSuggestion = '"Is this legit?" I had the same doubt...';
        proofNeeded = ['Unboxing video', 'Customer testimonials', 'Brand story'];
        emotionalArc = 'Fear → Reassurance → Trust';
        break;
      case 'quality':
        hookSuggestion = '"Is the quality actually good?" Let me prove it...';
        proofNeeded = ['Close-up shots', 'Durability test', 'Material details'];
        emotionalArc = 'Doubt → Demonstration → Belief';
        break;
      default:
        hookSuggestion = `"${activeObjection}" — here\'s what you need to know...`;
        proofNeeded = ['Direct answer', 'Proof point', 'Guarantee'];
        emotionalArc = 'Concern → Answer → Resolution';
    }
  } else if (hasPurchaseIntent) {
    hookSuggestion = 'Remove friction — lead with CTA';
    proofNeeded = ['Clear purchase path', 'Price visibility', 'Availability'];
    emotionalArc = 'Desire → Validation → Action';
  }

  return {
    sentiment: classification.sentiment,
    intent,
    purchasePsychology: {
      desireConfirmed: hasPurchaseIntent || classification.sentiment === 'positive',
      desireStrength: hasPurchaseIntent ? 8 : classification.sentiment === 'positive' ? 6 : 3,
      activeObjection,
      purchaseBlocker,
      emotionalState,
      conversionProbability
    },
    strategyOutput: {
      hookSuggestion,
      proofNeeded,
      emotionalArc
    }
  };
}

// ============================================================================
// ADAPTATION PIPELINE
// ============================================================================

export type AdaptationFormat = 'meta_video' | 'ugc_script' | 'founder_ad' | 'static' | 'whatsapp' | 'landing_page' | 'email' | 'retention';

/**
 * Determine adaptation formats based on content characteristics
 */
export function determineAdaptations(
  content: {
    hookWorksIn3Seconds: boolean;
    trustRequiresCreator: boolean;
    requiresDemonstration: boolean;
    emotionalArcLength: number; // seconds
    addressesObjections: boolean;
    hasVisualProofMoment: boolean;
  }
): { formats: AdaptationFormat[]; primaryFormat: AdaptationFormat; adaptationNotes: string } {
  const formats: AdaptationFormat[] = [];
  let notes = '';

  // Video formats
  if (content.hookWorksIn3Seconds) {
    formats.push('meta_video');
    notes += 'Hook works for cold audiences — video ad viable. ';
  }

  // UGC vs Founder
  if (content.trustRequiresCreator) {
    formats.push('ugc_script');
    notes += 'Trust needs similar creator — extract as UGC brief. ';
  } else {
    formats.push('ugc_script', 'founder_ad');
    notes += 'Trust mechanics transferable — founder or UGC both work. ';
  }

  // Static formats
  if (!content.requiresDemonstration && content.hasVisualProofMoment) {
    formats.push('static', 'whatsapp');
    notes += 'Key moment can become static image. ';
  }

  // Extended formats
  if (content.emotionalArcLength > 30 || content.addressesObjections) {
    formats.push('landing_page', 'email');
    notes += 'Narrative depth suits expanded formats. ';
  }

  // Retargeting
  if (content.addressesObjections) {
    formats.push('retention');
    notes += 'Objection handling — use in retargeting sequence. ';
  }

  // Primary format determination
  let primaryFormat: AdaptationFormat;
  if (content.requiresDemonstration) {
    primaryFormat = 'meta_video';
  } else if (content.trustRequiresCreator) {
    primaryFormat = 'ugc_script';
  } else if (content.hookWorksIn3Seconds) {
    primaryFormat = 'meta_video';
  } else {
    primaryFormat = 'static';
  }

  return { formats, primaryFormat, adaptationNotes: notes.trim() };
}

// ============================================================================
// EXPORT MAIN ANALYZER
// ============================================================================

export async function analyzeOrganicContent(
  contentUrl: string,
  contentData: {
    userId?: string; // For closed-loop recommendations
    platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook';
    comments: { text: string; category: string; sentiment: string; emotionalTriggers: string[] }[];
    creatorAnalysis?: Parameters<typeof extractCreatorDNA>[0];
    trendData?: Parameters<typeof analyzeTrendTiming>[0];
    brandContext: Parameters<typeof analyzeTrendTiming>[1];
    contentFeatures: {
      hasDesireCreation: boolean;
      hasObjectionHandling: boolean;
      hasUrgency: boolean;
      hasProductValueClarity: boolean;
      trustCreatorDependent: boolean;
      hasProofDemonstration: boolean;
      survivesSponsored: boolean;
      hookWorksWithoutContext: boolean;
      storyIsSelfContained: boolean;
      hasInsiderReferences: boolean;
      structureReplicable: boolean;
      multiFormatPotential: boolean;
      crossCategoryPotential: boolean;
      hookWorksIn3Seconds: boolean;
      requiresDemonstration: boolean;
      emotionalArcLength: number;
    };
  }
): Promise<OrganicContentAnalysis> {
  // Calculate purchase intent rate from comments
  const purchaseIntentComments = contentData.comments.filter(c =>
    c.text.toLowerCase().match(/where|link|price|need|want|buy|order/)
  ).length;
  const purchaseIntentRate = contentData.comments.length > 0
    ? purchaseIntentComments / contentData.comments.length
    : 0;

  const objectionComments = contentData.comments.filter(c =>
    c.category === 'objection' || c.category === 'frustration'
  ).length;
  const objectionRate = contentData.comments.length > 0
    ? objectionComments / contentData.comments.length
    : 0;

  const hasEmotionalValidation = contentData.comments.some(c =>
    c.category === 'praise' || c.emotionalTriggers.length > 0
  );

  // Score CCP
  const ccpScore = scoreCCP({
    ...contentData.contentFeatures,
    purchaseIntentCommentRate: purchaseIntentRate,
    objectionCommentRate: objectionRate,
    emotionalValidationComments: hasEmotionalValidation
  });

  // Extract creator DNA if analysis provided
  const creatorDNA = contentData.creatorAnalysis
    ? extractCreatorDNA(contentData.creatorAnalysis)
    : null;

  // Analyze trend timing if trend data provided
  const trendTiming = contentData.trendData
    ? analyzeTrendTiming(contentData.trendData, contentData.brandContext)
    : null;

  // Deep comment analysis
  const commentIntelligence = contentData.comments.slice(0, 20).map(c =>
    analyzeCommentDeep(c.text, {
      category: c.category as any,
      sentiment: c.sentiment as any,
      emotionalTriggers: c.emotionalTriggers
    })
  );

  // Commercial viability filter
  const commercialViability = filterCommercialViability({
    createsProductDesire: contentData.contentFeatures.hasDesireCreation,
    trustIndependentOfCreator: !contentData.contentFeatures.trustCreatorDependent,
    emotionalArcCreatesPurchaseUrgency: contentData.contentFeatures.hasUrgency,
    structureWorksForColdAudience: contentData.contentFeatures.hookWorksWithoutContext,
    entertainmentOnly: !contentData.contentFeatures.hasProductValueClarity && !contentData.contentFeatures.hasDesireCreation,
    creatorDependent: contentData.contentFeatures.trustCreatorDependent,
    trendDependent: false, // Would be determined from trend analysis
    audienceSpecific: contentData.contentFeatures.hasInsiderReferences
  });

  // Adaptation potential
  const adaptationPotential = determineAdaptations({
    hookWorksIn3Seconds: contentData.contentFeatures.hookWorksIn3Seconds,
    trustRequiresCreator: contentData.contentFeatures.trustCreatorDependent,
    requiresDemonstration: contentData.contentFeatures.requiresDemonstration,
    emotionalArcLength: contentData.contentFeatures.emotionalArcLength,
    addressesObjections: contentData.contentFeatures.hasObjectionHandling,
    hasVisualProofMoment: contentData.contentFeatures.hasProofDemonstration
  });

  // Wire into closed-loop system
  if (contentData.userId) {
    // High CCP score - recommend creating adaptation
    if (ccpScore.verdict === 'immediate_priority') {
      agentRecommend(contentData.userId, 'organic_paid_intelligence', {
        type: 'test_creative',
        entityType: 'creative',
        entityId: `organic_${Date.now()}`,
        entityName: `Organic Content: ${contentUrl.slice(0, 50)}`,
        action: `Adapt high-potential organic content (CCP: ${ccpScore.total}/100)`,
        reasoning: ccpScore.reasoning,
        evidence: [
          `CCP Score: ${ccpScore.total}/100`,
          `Verdict: ${ccpScore.verdict}`,
          `Purchase Psychology: ${ccpScore.breakdown.purchasePsychology}/25`,
          `Trust Transferability: ${ccpScore.breakdown.trustTransferability}/25`,
          `Primary Format: ${adaptationPotential.primaryFormat}`,
        ],
        confidence: 85,
        predictedSavings: 50000, // Estimated value of successful creative
      });
    }

    // Trend timing shows optimal entry
    if (trendTiming && trendTiming.action === 'enter_now') {
      agentRecommend(contentData.userId, 'organic_paid_intelligence', {
        type: 'test_creative',
        entityType: 'creative',
        entityId: `trend_${Date.now()}`,
        entityName: `Trend Opportunity: ${trendTiming.phase}`,
        action: `Enter trend now - ${trendTiming.estimatedDaysRemaining} days remaining`,
        reasoning: trendTiming.reasoning,
        evidence: [
          `Trend Phase: ${trendTiming.phase}`,
          `Usage Count: ${trendTiming.usageCount.toLocaleString()}`,
          `Brands Using: ${trendTiming.brandsUsing}`,
          `Brand Fit: ${trendTiming.brandFit}/100`,
          `Days Remaining: ${trendTiming.estimatedDaysRemaining}`,
        ],
        confidence: 75,
        predictedSavings: 30000, // Early trend entry value
      });
    }

    // Commercial viability with strong objection handling
    const objectionComments = commentIntelligence.filter(c => c.intent === 'objection');
    if (objectionComments.length >= 3) {
      const topObjection = objectionComments[0];
      agentRecommend(contentData.userId, 'organic_paid_intelligence', {
        type: 'refresh_creative',
        entityType: 'creative',
        entityId: `objection_${Date.now()}`,
        entityName: `Objection Pattern: ${topObjection.purchasePsychology.activeObjection}`,
        action: `Create objection-handling creative for "${topObjection.purchasePsychology.activeObjection}"`,
        reasoning: `${objectionComments.length} comments show same objection pattern. Creating targeted content could unblock conversions.`,
        evidence: [
          `Objection Type: ${topObjection.purchasePsychology.activeObjection}`,
          `Comments with objection: ${objectionComments.length}`,
          `Suggested Hook: ${topObjection.strategyOutput.hookSuggestion}`,
          `Emotional Arc: ${topObjection.strategyOutput.emotionalArc}`,
        ],
        confidence: 70,
        predictedSavings: 25000, // Conversion improvement value
      });
    }

    // === STRATEGIC MEMORY: Record episode for organic intelligence findings ===
    if (ccpScore.verdict === 'immediate_priority' || ccpScore.verdict === 'test_with_mods') {
      recordEpisode(
        contentData.userId,
        'content',
        `Organic Intel: Found ${ccpScore.verdict} content (CCP: ${ccpScore.total}/100) - ${contentUrl.slice(0, 50)}`,
        JSON.stringify({ ccpScore: ccpScore.total, verdict: ccpScore.verdict, platform: contentData.platform }),
        'pending'
      ).catch(epErr => logger.warn({ err: epErr }, '[OrganicPaid] Episode recording failed'));
    }
  }

  return {
    id: uuidv4(),
    sourceUrl: contentUrl,
    platform: contentData.platform,
    ccpScore,
    creatorDNA,
    commentIntelligence,
    trendTiming,
    commercialViability,
    adaptationPotential,
    analyzedAt: new Date().toISOString()
  };
}
