// ============================================================================
// 3. CREATIVE QUALITY VALIDATION
// ============================================================================

import { logger } from '../../utils/logger.js';
import type { QualityValidation, RejectionCondition } from './types.js';
import { saveQualityScore } from './persistence.js';

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
