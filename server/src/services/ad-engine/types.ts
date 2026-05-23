/**
 * Ad-Engine — shared types.
 *
 * Stub surface satisfying every `./types.js` import inside the ad-engine
 * cluster (strategy.ts, creative-intelligence.ts, gemini-generator.ts,
 * validator.ts). Field shapes are reverse-engineered from the actual
 * property accesses in those source files.
 *
 * Design notes:
 *   - Where the source code reads a field WITHOUT a null-check (e.g.
 *     `product.price > 0`), the field is declared as required.
 *   - Where the source legitimately allows null (e.g.
 *     `compareAtPrice: number | null`), the type permits it.
 *   - Where the source uses an alias (e.g. ProductBrief uses both `id` and
 *     `productId`), both names are accepted.
 *   - An index signature is added on object types that the source code
 *     constructs ad-hoc with varying field sets — this avoids brittle
 *     property-name churn during the M2 milestone build-out.
 *
 * Tightening these types is appropriate after the M2 milestone implements
 * the underlying pipeline. Until then, build-clean trumps compile-time
 * precision. See dev_reports/19_05/INDEX.md.
 */

// ============================================================================
// Format & template
// ============================================================================

export type AdFormat = '1080x1080' | '1080x1920' | '1200x628';

// `string` to allow strategy.ts's selectTemplate() to introduce template ids
// (e.g. 'whatsapp-conversation', 'urgency-sale') without exhaustive enum
// maintenance. Real type tightening belongs in the M2 milestone.
export type TemplateType = string;

// ============================================================================
// Ad copy
// ============================================================================

export interface AdCopy {
  hook: string;
  headline?: string;
  body?: string;
  cta: string;
  offer?: string;
  socialProof?: string;
  urgency?: string;
}

// ============================================================================
// Product
// ============================================================================

export interface ProductBrief {
  id: string;
  productId?: string;
  title: string;
  handle?: string;
  description?: string;
  price: number;
  originalPrice: number | null;
  discountPercent: number;
  imageUrl?: string;
  category?: string;
  bestsellers?: boolean;
  variants?: string[];
  template: TemplateType;
  copy: AdCopy;
  salesRank: number;
  // permissive — strategy.ts builds these objects ad-hoc with varying fields.
  [key: string]: unknown;
}

// ============================================================================
// Shopify
// ============================================================================

export interface ShopifyCredentials {
  domain: string;
  token: string;
  shopDomain?: string;
  accessToken?: string;
  apiVersion?: string;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  handle?: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number;
  inventory?: number;
  inventoryQuantity?: number;
  salesCount?: number;
  bestsellerRank?: number;
  salesRank?: number;
  imageUrl?: string;
  [key: string]: unknown;
}

// ============================================================================
// Strategy I/O
// ============================================================================

export interface StrategyInput {
  clientId: string;
  count?: number;
}

export interface StrategyOutput {
  clientId: string;
  brandName?: string;
  products: ProductBrief[];
  briefs?: ProductBrief[];           // legacy alias
  templates?: TemplateType[];
  copy?: AdCopy[];
  winningPatterns?: unknown[];
  competitorGaps?: unknown[];
  generatedAt?: string;
}

// ============================================================================
// Validation I/O
// ============================================================================

export interface QualityScore {
  overall: number;
  dimensions: {
    visualQuality: number;
    premiumFeel: number;
    readability: number;
    emotionalImpact: number;
    conversionClarity: number;
    productVisibility: number;
    hookStrength: number;
    compositionBalance: number;
    mobileFeedPerformance: number;
    originality: number;
    strategyAlignment: number;
    brandConsistency: number;
    competitorBenchmark: number;
  };
  issues: string[];
  suggestions: string[];
}

export interface ValidationInput {
  imagePath: string;
  productBrief: ProductBrief;       // required (destructured + accessed without null check)
  brief?: ProductBrief;             // legacy alias
  template?: TemplateType;
  format: AdFormat;
  brandName: string;
  outputDir?: string;
  clientId?: string;
}

export interface ValidationRound {
  iteration: number;
  score: number;
  template?: TemplateType;
  issues: string[];
  imagePath?: string;
  improvedPrompt?: string;
}

export interface ImprovementInstructions {
  changes?: string[];
  prioritizedDimensions?: string[];
  rewrittenPrompt?: string;
  switchTemplate?: TemplateType;
  adjustments?: string[];
  priority?: 'low' | 'medium' | 'high';
}

export interface ValidationOutput {
  score: QualityScore;
  approved: boolean;
  iteration: number;
  imagePath: string;
  critique?: string;
  roundHistory?: ValidationRound[];

  // Legacy aliases retained for older consumers.
  finalScore?: QualityScore;
  rounds?: ValidationRound[];
  passed?: boolean;
  finalImagePath?: string;
}

// ============================================================================
// Render output
// ============================================================================

export interface RenderOutput {
  filePath: string;
  imagePath?: string;
  format: AdFormat;
  template: TemplateType;
  prompt?: string;
  modelUsed?: string;
  productId?: string;
  fileSize?: number;
  generatedAt?: string;
}
