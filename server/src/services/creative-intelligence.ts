/**
 * Creative Intelligence System — Cosmisk
 *
 * A continuously learning creative intelligence system capable of producing
 * premium, differentiated, strategically sophisticated, high-converting,
 * non-generic operator-grade creatives.
 *
 * NOT automated creative production.
 * ACTUAL GOAL: Autonomous creative evolution with taste.
 *
 * Core Principles:
 * - Never generate generic creatives
 * - Never output cheap-looking templates
 * - Never create AI-looking ad structures
 * - Creative quality is visible proof of intelligence quality
 * - Optimize for sophistication, not quantity
 */

import { logger } from '../utils/logger.js';
import { getDbAdapter } from '../db/adapter.js';

// ============================================================================
// 1. CREATIVE QUALITY PHILOSOPHY
// ============================================================================

/**
 * Automatic rejection conditions — if any of these are true, reject the creative
 */
export const AUTO_REJECTION_CONDITIONS = [
  'canva_looking',
  'predictable_ai_output',
  'weak_typography',
  'repetitive_hooks',
  'template_based_layout',
  'generic_ugc_structure',
  'low_effort_static',
  'low_taste_visual',
  'junior_level_execution',
] as const;

export type RejectionCondition = typeof AUTO_REJECTION_CONDITIONS[number];

/**
 * Core quality question: "Would this creative impress a top-tier D2C founder?"
 */
export interface CreativeQualityCheck {
  creativeId: string;
  passesFounderTest: boolean;  // Would a top-tier D2C founder be impressed?
  sophisticationScore: number;  // 0-100
  rejectionConditions: RejectionCondition[];
  qualityVerdict: 'approve' | 'revise' | 'reject';
  verdictReason: string;
}

// ============================================================================
// 2. CREATIVE REASONING ENGINE
// ============================================================================

/**
 * The reasoning engine must understand these before generating
 */
export interface CreativeReasoningContext {
  clientId: string;

  // Strategic understanding
  whatCreativeShouldExistNext: string;
  emotionalAngleToTest: string;
  formatForAudience: string;
  typographyStyle: string;

  // Pattern awareness
  saturatingHooks: string[];
  shiftingAudiencePsychology: string[];
  emergingCompetitorPatterns: string[];
  productsDeservingAttention: string[];

  // Evidence backing
  evidenceSources: string[];
  confidenceLevel: number;
}

/**
 * Cross-agent intelligence synthesis — creatives receive intelligence from all agents
 */
export interface CrossAgentCreativeContext {
  clientId: string;
  lastUpdated: string;

  // Agent signals
  fatigueSignals: {
    fatiguedCreatives: string[];
    daysToFatigue: number;
    urgentRefreshNeeded: boolean;
  };

  ltvSignals: {
    highLtvHookTypes: string[];
    lowLtvHookTypes: string[];
    ltvMultiplierByFormat: Record<string, number>;
  };

  cohortSignals: {
    repeatBuyerCreatives: string[];
    onePurchaseTrapCreatives: string[];
    bestCohortFormats: string[];
  };

  competitorSignals: {
    competitorGaps: string[];
    emergingAngles: string[];
    saturatedAngles: string[];
  };

  audienceSignals: {
    shiftingPreferences: string[];
    emergingDemographics: string[];
    decliningSentiments: string[];
  };

  retentionSignals: {
    highRetentionHooks: string[];
    lowRetentionHooks: string[];
  };

  emotionalSignals: {
    resonatingEmotions: string[];
    failingEmotions: string[];
    untestedEmotions: string[];
  };

  pricingSignals: {
    effectivePriceFraming: string[];
    failingPriceFraming: string[];
  };

  productSignals: {
    trendingProducts: string[];
    understockedProducts: string[];
    highMarginProducts: string[];
  };

  performanceSignals: {
    winningPatterns: string[];
    losingPatterns: string[];
    untestedCombinations: string[];
  };

  // Synthesized recommendation
  synthesisOutput: {
    nextCreativeRecommendation: string;
    confidence: number;
    reasoning: string;
  };
}

/**
 * Build cross-agent creative context from all intelligence sources
 */
export async function buildCreativeContext(
  clientId: string,
  agentData: {
    fatigue?: any;
    ltv?: any;
    cohort?: any;
    competitor?: any;
    audience?: any;
    retention?: any;
    emotional?: any;
    pricing?: any;
    product?: any;
    performance?: any;
  }
): Promise<CrossAgentCreativeContext> {
  const context: CrossAgentCreativeContext = {
    clientId,
    lastUpdated: new Date().toISOString(),

    fatigueSignals: {
      fatiguedCreatives: agentData.fatigue?.fatiguedCreatives || [],
      daysToFatigue: agentData.fatigue?.avgDaysToFatigue || 14,
      urgentRefreshNeeded: agentData.fatigue?.urgentRefreshNeeded || false,
    },

    ltvSignals: {
      highLtvHookTypes: agentData.ltv?.highLtvHookTypes || [],
      lowLtvHookTypes: agentData.ltv?.lowLtvHookTypes || [],
      ltvMultiplierByFormat: agentData.ltv?.multiplierByFormat || {},
    },

    cohortSignals: {
      repeatBuyerCreatives: agentData.cohort?.repeatBuyerCreatives || [],
      onePurchaseTrapCreatives: agentData.cohort?.onePurchaseTrapCreatives || [],
      bestCohortFormats: agentData.cohort?.bestFormats || [],
    },

    competitorSignals: {
      competitorGaps: agentData.competitor?.gaps || [],
      emergingAngles: agentData.competitor?.emergingAngles || [],
      saturatedAngles: agentData.competitor?.saturatedAngles || [],
    },

    audienceSignals: {
      shiftingPreferences: agentData.audience?.shiftingPreferences || [],
      emergingDemographics: agentData.audience?.emergingDemographics || [],
      decliningSentiments: agentData.audience?.decliningSentiments || [],
    },

    retentionSignals: {
      highRetentionHooks: agentData.retention?.highRetentionHooks || [],
      lowRetentionHooks: agentData.retention?.lowRetentionHooks || [],
    },

    emotionalSignals: {
      resonatingEmotions: agentData.emotional?.resonating || [],
      failingEmotions: agentData.emotional?.failing || [],
      untestedEmotions: agentData.emotional?.untested || [],
    },

    pricingSignals: {
      effectivePriceFraming: agentData.pricing?.effective || [],
      failingPriceFraming: agentData.pricing?.failing || [],
    },

    productSignals: {
      trendingProducts: agentData.product?.trending || [],
      understockedProducts: agentData.product?.understocked || [],
      highMarginProducts: agentData.product?.highMargin || [],
    },

    performanceSignals: {
      winningPatterns: agentData.performance?.winning || [],
      losingPatterns: agentData.performance?.losing || [],
      untestedCombinations: agentData.performance?.untested || [],
    },

    synthesisOutput: {
      nextCreativeRecommendation: '',
      confidence: 0,
      reasoning: '',
    },
  };

  // Synthesize the recommendation
  context.synthesisOutput = synthesizeCreativeRecommendation(context);

  // Save to DB
  await saveCreativeContext(context);

  return context;
}

/**
 * Synthesize creative recommendation from all signals
 */
function synthesizeCreativeRecommendation(
  context: CrossAgentCreativeContext
): CrossAgentCreativeContext['synthesisOutput'] {
  const recommendations: Array<{ rec: string; confidence: number; reason: string }> = [];

  // Priority 1: Urgent fatigue refresh
  if (context.fatigueSignals.urgentRefreshNeeded) {
    const highLtvHook = context.ltvSignals.highLtvHookTypes[0];
    const competitorGap = context.competitorSignals.competitorGaps[0];

    recommendations.push({
      rec: `Urgent creative refresh needed. Use ${highLtvHook || 'proven'} hook with ${competitorGap || 'differentiated'} angle.`,
      confidence: 85,
      reason: 'Fatigue detected + high-LTV hooks available',
    });
  }

  // Priority 2: High-LTV untested combination
  if (context.performanceSignals.untestedCombinations.length > 0 &&
      context.ltvSignals.highLtvHookTypes.length > 0) {
    const untested = context.performanceSignals.untestedCombinations[0];
    recommendations.push({
      rec: `Test untested combination: ${untested} — historical data suggests high LTV potential.`,
      confidence: 75,
      reason: 'Untested pattern with correlated high-LTV signals',
    });
  }

  // Priority 3: Competitor gap opportunity
  if (context.competitorSignals.competitorGaps.length > 0 &&
      !context.competitorSignals.saturatedAngles.includes(context.competitorSignals.competitorGaps[0])) {
    const gap = context.competitorSignals.competitorGaps[0];
    recommendations.push({
      rec: `Competitor gap: "${gap}" is uncontested. Test with ${context.cohortSignals.bestCohortFormats[0] || 'UGC'} format.`,
      confidence: 70,
      reason: 'Uncontested competitor territory',
    });
  }

  // Priority 4: Emotional angle shift
  if (context.emotionalSignals.untestedEmotions.length > 0) {
    const emotion = context.emotionalSignals.untestedEmotions[0];
    recommendations.push({
      rec: `Test untested emotional angle: "${emotion}" — avoiding ${context.emotionalSignals.failingEmotions.slice(0, 2).join(', ') || 'saturated'} emotions.`,
      confidence: 65,
      reason: 'Fresh emotional territory available',
    });
  }

  // Select top recommendation
  recommendations.sort((a, b) => b.confidence - a.confidence);
  const top = recommendations[0];

  if (!top) {
    return {
      nextCreativeRecommendation: 'Maintain current creative strategy. No urgent signals detected.',
      confidence: 50,
      reasoning: 'No strong signals from any agent',
    };
  }

  return {
    nextCreativeRecommendation: top.rec,
    confidence: top.confidence,
    reasoning: top.reason,
  };
}

// ============================================================================
// 3. CREATIVE QUALITY VALIDATION
// ============================================================================

/**
 * Quality validation layers
 */
export interface QualityValidation {
  creativeId: string;
  validatedAt: string;

  // Validation scores (0-100)
  typographyScore: number;
  sophisticationScore: number;
  premiumAestheticScore: number;
  emotionalImpactScore: number;
  brandConsistencyScore: number;
  aiArtifactScore: number;  // Lower is better (0 = no AI artifacts)
  layoutIntelligenceScore: number;
  competitorBenchmarkScore: number;

  // Overall
  overallQualityScore: number;
  qualityTier: 'premium' | 'acceptable' | 'needs_work' | 'reject';

  // Rejection
  autoRejected: boolean;
  rejectionReasons: RejectionCondition[];

  // Benchmark
  comparedToBrands: string[];
  percentileVsBenchmark: number;
}

/**
 * Benchmark sources for quality validation
 */
const BENCHMARK_BRANDS = [
  // Elite D2C brands
  'Glossier',
  'Allbirds',
  'Warby Parker',
  'Away',
  'Casper',
  // Indian D2C
  'Mamaearth',
  'boAt',
  'Lenskart',
  'Sugar Cosmetics',
  'Sleepy Owl',
];

/**
 * Validate creative quality
 */
export async function validateCreativeQuality(
  creativeId: string,
  creativeAnalysis: {
    typography: any;
    layout: any;
    colors: any;
    hooks: any;
    format: string;
  },
  brandContext: {
    brandName: string;
    category: string;
    pricePoint: 'budget' | 'mid' | 'premium' | 'luxury';
  }
): Promise<QualityValidation> {
  const now = new Date().toISOString();

  // Score each dimension
  const typographyScore = scoreTypography(creativeAnalysis.typography, brandContext);
  const sophisticationScore = scoreSophistication(creativeAnalysis, brandContext);
  const premiumAestheticScore = scorePremiumAesthetic(creativeAnalysis, brandContext);
  const emotionalImpactScore = scoreEmotionalImpact(creativeAnalysis.hooks);
  const brandConsistencyScore = scoreBrandConsistency(creativeAnalysis, brandContext);
  const aiArtifactScore = detectAiArtifacts(creativeAnalysis);
  const layoutIntelligenceScore = scoreLayoutIntelligence(creativeAnalysis.layout);
  const competitorBenchmarkScore = scoreBenchmark(creativeAnalysis, brandContext.category);

  // Calculate overall score (weighted)
  const overallQualityScore = Math.round(
    typographyScore * 0.15 +
    sophisticationScore * 0.20 +
    premiumAestheticScore * 0.15 +
    emotionalImpactScore * 0.15 +
    brandConsistencyScore * 0.10 +
    (100 - aiArtifactScore) * 0.10 +  // Invert AI artifact score
    layoutIntelligenceScore * 0.10 +
    competitorBenchmarkScore * 0.05
  );

  // Check rejection conditions
  const rejectionReasons = checkRejectionConditions(
    creativeAnalysis,
    { typographyScore, sophisticationScore, aiArtifactScore, layoutIntelligenceScore }
  );

  const autoRejected = rejectionReasons.length > 0;

  // Determine quality tier
  let qualityTier: QualityValidation['qualityTier'] = 'acceptable';
  if (autoRejected) {
    qualityTier = 'reject';
  } else if (overallQualityScore >= 80) {
    qualityTier = 'premium';
  } else if (overallQualityScore >= 60) {
    qualityTier = 'acceptable';
  } else {
    qualityTier = 'needs_work';
  }

  const validation: QualityValidation = {
    creativeId,
    validatedAt: now,
    typographyScore,
    sophisticationScore,
    premiumAestheticScore,
    emotionalImpactScore,
    brandConsistencyScore,
    aiArtifactScore,
    layoutIntelligenceScore,
    competitorBenchmarkScore,
    overallQualityScore,
    qualityTier,
    autoRejected,
    rejectionReasons,
    comparedToBrands: BENCHMARK_BRANDS.slice(0, 3),
    percentileVsBenchmark: overallQualityScore,
  };

  // Save to DB
  await saveQualityScore(validation);

  logger.debug({ creativeId, qualityTier, score: overallQualityScore }, '[Creative] Quality validated');

  return validation;
}

/**
 * Score typography quality
 */
function scoreTypography(
  typography: any,
  brandContext: { pricePoint: string }
): number {
  let score = 50;  // Base score

  // Check for weak typography indicators
  if (typography?.fontFamily) {
    const weakFonts = ['comic sans', 'papyrus', 'impact', 'arial black'];
    if (weakFonts.some(f => typography.fontFamily.toLowerCase().includes(f))) {
      score -= 30;
    }

    const premiumFonts = ['helvetica', 'futura', 'garamond', 'bodoni', 'avenir', 'proxima'];
    if (premiumFonts.some(f => typography.fontFamily.toLowerCase().includes(f))) {
      score += 20;
    }
  }

  // Check hierarchy
  if (typography?.hasHierarchy) score += 15;
  if (typography?.properSpacing) score += 10;
  if (typography?.readableContrast) score += 5;

  // Premium expectation
  if (brandContext.pricePoint === 'luxury' || brandContext.pricePoint === 'premium') {
    // Higher standards for premium brands
    score = Math.min(score, 70);  // Cap unless truly premium
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Score sophistication level
 */
function scoreSophistication(creativeAnalysis: any, brandContext: any): number {
  let score = 50;

  // Visual sophistication indicators
  if (creativeAnalysis.layout?.useOfWhitespace) score += 15;
  if (creativeAnalysis.colors?.limitedPalette) score += 10;  // Not too many colors
  if (creativeAnalysis.layout?.alignmentConsistent) score += 10;
  if (creativeAnalysis.layout?.visualBalance) score += 10;

  // Negative indicators
  if (creativeAnalysis.layout?.cluttered) score -= 20;
  if (creativeAnalysis.colors?.clashing) score -= 15;
  if (creativeAnalysis.layout?.templateLooking) score -= 25;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score premium aesthetic
 */
function scorePremiumAesthetic(creativeAnalysis: any, brandContext: any): number {
  let score = 50;

  // Premium indicators
  if (creativeAnalysis.colors?.mutedTones) score += 10;
  if (creativeAnalysis.colors?.cohesivePalette) score += 10;
  if (creativeAnalysis.layout?.minimalDesign) score += 15;
  if (creativeAnalysis.layout?.highQualityImagery) score += 15;

  // Budget indicators
  if (creativeAnalysis.layout?.stockLooking) score -= 20;
  if (creativeAnalysis.colors?.neonColors) score -= 10;
  if (creativeAnalysis.layout?.busyBackground) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score emotional impact
 */
function scoreEmotionalImpact(hooks: any): number {
  let score = 50;

  if (!hooks) return score;

  // Strong emotional hooks
  if (hooks.type === 'curiosity') score += 15;
  if (hooks.type === 'social_proof') score += 10;
  if (hooks.type === 'urgency') score += 10;
  if (hooks.type === 'transformation') score += 20;

  // Weak hooks
  if (hooks.type === 'generic') score -= 20;
  if (hooks.isRepetitive) score -= 15;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score brand consistency
 */
function scoreBrandConsistency(creativeAnalysis: any, brandContext: any): number {
  // Would need brand guidelines to properly score
  // For now, use heuristics
  let score = 60;

  if (creativeAnalysis.colors?.matchesBrandColors) score += 20;
  if (creativeAnalysis.typography?.matchesBrandFonts) score += 15;
  if (creativeAnalysis.layout?.matchesBrandStyle) score += 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Detect AI artifacts (lower is better)
 */
function detectAiArtifacts(creativeAnalysis: any): number {
  let artifactScore = 0;

  // AI tells
  if (creativeAnalysis.layout?.perfectSymmetry) artifactScore += 15;  // Too perfect
  if (creativeAnalysis.layout?.obviousAiGeneration) artifactScore += 40;
  if (creativeAnalysis.typography?.genericPlacement) artifactScore += 10;
  if (creativeAnalysis.colors?.defaultAiPalette) artifactScore += 15;

  // Stock/template tells
  if (creativeAnalysis.layout?.stockElements) artifactScore += 20;

  return Math.min(100, artifactScore);
}

/**
 * Score layout intelligence
 */
function scoreLayoutIntelligence(layout: any): number {
  let score = 50;

  if (!layout) return score;

  if (layout.clearFocalPoint) score += 15;
  if (layout.properFlow) score += 10;
  if (layout.mobileOptimized) score += 10;
  if (layout.ctaProminent) score += 10;
  if (layout.ruleOfThirds) score += 5;

  if (layout.confusingHierarchy) score -= 15;
  if (layout.ctaBuried) score -= 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score against benchmark brands
 */
function scoreBenchmark(creativeAnalysis: any, category: string): number {
  // This would ideally compare against a database of benchmark creatives
  // For now, use category-based heuristics
  const categoryExpectations: Record<string, number> = {
    fashion: 75,
    beauty: 80,
    jewelry: 85,
    skincare: 80,
    food: 70,
    electronics: 65,
    default: 70,
  };

  const expectedScore = categoryExpectations[category.toLowerCase()] || categoryExpectations['default'];

  // Assume the creative is at expected level, adjust based on analysis
  let score = expectedScore;

  if (creativeAnalysis.layout?.premiumExecution) score += 10;
  if (creativeAnalysis.layout?.budgetExecution) score -= 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Check for automatic rejection conditions
 */
function checkRejectionConditions(
  creativeAnalysis: any,
  scores: {
    typographyScore: number;
    sophisticationScore: number;
    aiArtifactScore: number;
    layoutIntelligenceScore: number;
  }
): RejectionCondition[] {
  const rejections: RejectionCondition[] = [];

  // Check each condition
  if (creativeAnalysis.layout?.canvaLooking) rejections.push('canva_looking');
  if (scores.aiArtifactScore > 40) rejections.push('predictable_ai_output');
  if (scores.typographyScore < 40) rejections.push('weak_typography');
  if (creativeAnalysis.hooks?.isRepetitive) rejections.push('repetitive_hooks');
  if (creativeAnalysis.layout?.templateBased) rejections.push('template_based_layout');
  if (creativeAnalysis.format === 'ugc' && creativeAnalysis.layout?.genericStructure) {
    rejections.push('generic_ugc_structure');
  }
  if (creativeAnalysis.format === 'static' && scores.sophisticationScore < 50) {
    rejections.push('low_effort_static');
  }
  if (scores.sophisticationScore < 40 && scores.layoutIntelligenceScore < 40) {
    rejections.push('low_taste_visual');
  }
  if (scores.sophisticationScore < 35) rejections.push('junior_level_execution');

  return rejections;
}

// ============================================================================
// 4. CREATIVE EVOLUTION SYSTEM
// ============================================================================

/**
 * Dimensions that evolve over time
 */
export type EvolutionDimension =
  | 'hooks'
  | 'layouts'
  | 'messaging'
  | 'emotional_structures'
  | 'visual_identity'
  | 'creative_formats'
  | 'audience_targeting'
  | 'creative_pacing';

/**
 * An evolution event
 */
export interface CreativeEvolution {
  id: string;
  clientId: string;
  recordedAt: string;
  dimension: EvolutionDimension;
  previousState: string;
  newState: string;
  triggerSignals: string[];
  confidence: number;
  applied: boolean;
  outcome?: 'positive' | 'neutral' | 'negative';
}

/**
 * Track creative evolution
 */
export async function recordEvolution(
  clientId: string,
  dimension: EvolutionDimension,
  previousState: string,
  newState: string,
  triggerSignals: string[],
  confidence: number
): Promise<CreativeEvolution> {
  const evolution: CreativeEvolution = {
    id: `evo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clientId,
    recordedAt: new Date().toISOString(),
    dimension,
    previousState,
    newState,
    triggerSignals,
    confidence,
    applied: false,
  };

  // Save to DB
  await getDbAdapter().run(`
    INSERT INTO creative_evolution (
      id, client_id, recorded_at, dimension, previous_state, new_state,
      trigger_signals, confidence, applied, outcome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    evolution.id,
    evolution.clientId,
    evolution.recordedAt,
    evolution.dimension,
    evolution.previousState,
    evolution.newState,
    JSON.stringify(evolution.triggerSignals),
    evolution.confidence,
    evolution.applied ? 1 : 0,
    evolution.outcome ?? null,
  ]);

  logger.info({ clientId, dimension, confidence }, '[Creative] Evolution recorded');

  return evolution;
}

/**
 * Get evolution history for a dimension
 */
export async function getEvolutionHistory(
  clientId: string,
  dimension?: EvolutionDimension
): Promise<CreativeEvolution[]> {
  let query = 'SELECT * FROM creative_evolution WHERE client_id = ?';
  const params: any[] = [clientId];

  if (dimension) {
    query += ' AND dimension = ?';
    params.push(dimension);
  }

  query += ' ORDER BY recorded_at DESC LIMIT 50';

  const rows = await getDbAdapter().all(query, params) as any[];
  return rows.map(row => ({
    id: row.id,
    clientId: row.client_id,
    recordedAt: row.recorded_at,
    dimension: row.dimension,
    previousState: row.previous_state,
    newState: row.new_state,
    triggerSignals: JSON.parse(row.trigger_signals || '[]'),
    confidence: row.confidence,
    applied: row.applied === 1,
    outcome: row.outcome,
  }));
}

// ============================================================================
// 5. CATEGORY-SPECIFIC INTELLIGENCE
// ============================================================================

/**
 * Category-specific creative knowledge
 */
export interface CategoryKnowledge {
  category: string;
  updatedAt: string;
  aestheticPatterns: string[];
  typographyPatterns: string[];
  hookPatterns: string[];
  emotionalTriggers: string[];
  pricingPsychology: Record<string, string>;
  trustStructures: string[];
  visualHierarchy: string[];
  benchmarkBrands: string[];
  antiPatterns: string[];
}

/**
 * Default category knowledge (built-in)
 */
const DEFAULT_CATEGORY_KNOWLEDGE: Record<string, Partial<CategoryKnowledge>> = {
  fashion: {
    aestheticPatterns: ['lifestyle imagery', 'model-centric', 'minimal backgrounds', 'editorial style'],
    typographyPatterns: ['serif for luxury', 'sans-serif for modern', 'thin weights for elegance'],
    hookPatterns: ['transformation', 'occasion-based', 'social proof', 'FOMO'],
    emotionalTriggers: ['aspiration', 'confidence', 'belonging', 'self-expression'],
    pricingPsychology: { anchor: 'higher first', discount: 'percentage for high, flat for low' },
    trustStructures: ['reviews', 'UGC', 'size guides', 'returns policy'],
    antiPatterns: ['cluttered layouts', 'poor model photography', 'generic stock'],
  },
  beauty: {
    aestheticPatterns: ['close-up texture', 'before/after', 'ingredient focus', 'clean minimal'],
    typographyPatterns: ['clean sans-serif', 'lowercase for friendly', 'spaced tracking'],
    hookPatterns: ['problem-solution', 'science-backed', 'ingredient hero', 'routine integration'],
    emotionalTriggers: ['self-care', 'transformation', 'confidence', 'ritual'],
    pricingPsychology: { bundle: 'routine bundles', trial: 'mini sizes' },
    trustStructures: ['dermatologist tested', 'ingredient transparency', 'before/after'],
    antiPatterns: ['over-filtered', 'unrealistic claims', 'cluttered ingredient lists'],
  },
  jewelry: {
    aestheticPatterns: ['detail shots', 'lifestyle worn', 'luxury lighting', 'minimal props'],
    typographyPatterns: ['elegant serifs', 'thin weights', 'generous spacing'],
    hookPatterns: ['gifting occasion', 'everyday luxury', 'personal meaning', 'craftsmanship'],
    emotionalTriggers: ['love', 'milestone', 'self-reward', 'heritage'],
    pricingPsychology: { value: 'craftsmanship story', luxury: 'exclusive positioning' },
    trustStructures: ['certification', 'craftsmanship', 'returns', 'packaging'],
    antiPatterns: ['cheap stock', 'busy backgrounds', 'discount-heavy'],
  },
  skincare: {
    aestheticPatterns: ['texture close-up', 'ingredient hero', 'clean clinical', 'routine context'],
    typographyPatterns: ['clean modern', 'scientific feel', 'readable claims'],
    hookPatterns: ['concern-specific', 'ingredient education', 'routine fit', 'results timeline'],
    emotionalTriggers: ['confidence', 'self-investment', 'routine ritual', 'visible results'],
    pricingPsychology: { value: 'cost per use', bundle: 'complete routine' },
    trustStructures: ['clinical studies', 'ingredient purity', 'dermatologist'],
    antiPatterns: ['overpromise', 'generic glow', 'unsubstantiated claims'],
  },
};

/**
 * Get or create category knowledge
 */
export async function getCategoryKnowledge(category: string): Promise<CategoryKnowledge> {
  const row = await getDbAdapter().get('SELECT * FROM creative_category_knowledge WHERE category = ?', [category.toLowerCase()]) as any;

  if (row) {
    return {
      category: row.category,
      updatedAt: row.updated_at,
      aestheticPatterns: JSON.parse(row.aesthetic_patterns || '[]'),
      typographyPatterns: JSON.parse(row.typography_patterns || '[]'),
      hookPatterns: JSON.parse(row.hook_patterns || '[]'),
      emotionalTriggers: JSON.parse(row.emotional_triggers || '[]'),
      pricingPsychology: JSON.parse(row.pricing_psychology || '{}'),
      trustStructures: JSON.parse(row.trust_structures || '[]'),
      visualHierarchy: JSON.parse(row.visual_hierarchy || '[]'),
      benchmarkBrands: JSON.parse(row.benchmark_brands || '[]'),
      antiPatterns: JSON.parse(row.anti_patterns || '[]'),
    };
  }

  // Return default if exists
  const defaultKnowledge = DEFAULT_CATEGORY_KNOWLEDGE[category.toLowerCase()];
  if (defaultKnowledge) {
    return {
      category: category.toLowerCase(),
      updatedAt: new Date().toISOString(),
      aestheticPatterns: defaultKnowledge.aestheticPatterns || [],
      typographyPatterns: defaultKnowledge.typographyPatterns || [],
      hookPatterns: defaultKnowledge.hookPatterns || [],
      emotionalTriggers: defaultKnowledge.emotionalTriggers || [],
      pricingPsychology: defaultKnowledge.pricingPsychology || {},
      trustStructures: defaultKnowledge.trustStructures || [],
      visualHierarchy: [],
      benchmarkBrands: [],
      antiPatterns: defaultKnowledge.antiPatterns || [],
    };
  }

  // Return empty
  return {
    category: category.toLowerCase(),
    updatedAt: new Date().toISOString(),
    aestheticPatterns: [],
    typographyPatterns: [],
    hookPatterns: [],
    emotionalTriggers: [],
    pricingPsychology: {},
    trustStructures: [],
    visualHierarchy: [],
    benchmarkBrands: [],
    antiPatterns: [],
  };
}

// ============================================================================
// 6. HUMAN REVIEW LAYER
// ============================================================================

/**
 * Human review request
 */
export interface HumanReviewRequest {
  id: string;
  clientId: string;
  createdAt: string;
  reviewType: 'approval' | 'escalation' | 'strategic_override' | 'premium_review' | 'brand_protection' | 'high_risk';
  creativeId: string;
  reason: string;
  aiRecommendation: string;
  aiConfidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  reviewerNotes?: string;
  reviewedAt?: string;
}

/**
 * Request human review
 */
export function requestHumanReview(
  clientId: string,
  creativeId: string,
  reviewType: HumanReviewRequest['reviewType'],
  reason: string,
  aiRecommendation: string,
  aiConfidence: number
): HumanReviewRequest {
  const request: HumanReviewRequest = {
    id: `review_${Date.now()}`,
    clientId,
    createdAt: new Date().toISOString(),
    reviewType,
    creativeId,
    reason,
    aiRecommendation,
    aiConfidence,
    status: 'pending',
  };

  logger.info({ clientId, reviewType, creativeId }, '[Creative] Human review requested');

  return request;
}

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

async function saveCreativeContext(context: CrossAgentCreativeContext): Promise<void> {
  await getDbAdapter().run(`
    INSERT INTO creative_intelligence_context (
      client_id, last_updated, fatigue_signals, ltv_signals, cohort_signals,
      competitor_signals, audience_signals, retention_signals, emotional_signals,
      pricing_signals, product_signals, performance_signals, synthesis_output,
      next_creative_recommendation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      last_updated = excluded.last_updated,
      fatigue_signals = excluded.fatigue_signals,
      ltv_signals = excluded.ltv_signals,
      cohort_signals = excluded.cohort_signals,
      competitor_signals = excluded.competitor_signals,
      audience_signals = excluded.audience_signals,
      retention_signals = excluded.retention_signals,
      emotional_signals = excluded.emotional_signals,
      pricing_signals = excluded.pricing_signals,
      product_signals = excluded.product_signals,
      performance_signals = excluded.performance_signals,
      synthesis_output = excluded.synthesis_output,
      next_creative_recommendation = excluded.next_creative_recommendation
  `, [
    context.clientId,
    context.lastUpdated,
    JSON.stringify(context.fatigueSignals),
    JSON.stringify(context.ltvSignals),
    JSON.stringify(context.cohortSignals),
    JSON.stringify(context.competitorSignals),
    JSON.stringify(context.audienceSignals),
    JSON.stringify(context.retentionSignals),
    JSON.stringify(context.emotionalSignals),
    JSON.stringify(context.pricingSignals),
    JSON.stringify(context.productSignals),
    JSON.stringify(context.performanceSignals),
    JSON.stringify(context.synthesisOutput),
    context.synthesisOutput.nextCreativeRecommendation,
  ]);
}

async function saveQualityScore(validation: QualityValidation): Promise<void> {
  const id = `quality_${validation.creativeId}_${Date.now()}`;
  await getDbAdapter().run(`
    INSERT INTO creative_quality_scores (
      id, client_id, creative_id, scored_at, sophistication_score, typography_score,
      emotional_impact_score, brand_consistency_score, ai_artifact_score,
      layout_intelligence_score, competitor_benchmark_score, overall_quality_score,
      auto_rejected, rejection_reasons, benchmark_creative_ids, human_override, human_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    '',  // Would need client context
    validation.creativeId,
    validation.validatedAt,
    validation.sophisticationScore,
    validation.typographyScore,
    validation.emotionalImpactScore,
    validation.brandConsistencyScore,
    validation.aiArtifactScore,
    validation.layoutIntelligenceScore,
    validation.competitorBenchmarkScore,
    validation.overallQualityScore,
    validation.autoRejected ? 1 : 0,
    JSON.stringify(validation.rejectionReasons),
    JSON.stringify(validation.comparedToBrands),
    0,
    null,
  ]);
}

// ============================================================================
// Logging
// ============================================================================

logger.info('[CreativeIntelligence] Systems loaded — Quality, Reasoning, Evolution, Category Knowledge');
