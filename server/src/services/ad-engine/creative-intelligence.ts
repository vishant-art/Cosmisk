/**
 * Creative Intelligence Service
 * Learns premium patterns from references and generates creative concepts
 */

import { logger } from '../../utils/logger.js';
import type { ProductBrief, TemplateType, AdFormat } from './types.js';

// ============================================================================
// Premium Pattern Library (Learned from Reference Ads)
// ============================================================================

export interface CreativeConcept {
  name: string;
  description: string;
  visualStyle: string;
  textPlacement: 'minimal' | 'bottom-third' | 'integrated' | 'none';
  colorScheme: 'dark' | 'light' | 'brand' | 'product-matched';
  suitableFor: string[]; // product categories
  examplePrompt: string;
  generationMethod?: 'gemini' | 'template' | 'composite'; // Which rendering approach to use
}

/**
 * Premium creative concepts learned from high-performing D2C ads
 * Source: BPerfect, Heights, 47 Skin, Zenius references
 */
/**
 * Concepts are tagged with generationMethod:
 * - 'gemini': Use Imagen for full AI generation (good for conceptual/metaphor ads)
 * - 'sharp': Use Sharp templates with real product photos (good for product-focused ads)
 */
export const PREMIUM_CONCEPTS: CreativeConcept[] = [
  {
    name: 'playing-card',
    description: 'Product variants arranged like playing cards fanning out, gamification metaphor',
    visualStyle: 'Dark background, gold/white text, cards at angles, "+3" or similar game reference',
    textPlacement: 'bottom-third',
    colorScheme: 'dark',
    suitableFor: ['supplements', 'skincare-sets', 'bundles', 'multi-variant'],
    examplePrompt: 'Three supplement bottles arranged like playing cards fanning out against black background, white "+3" text, gold accents, "THIS IS WORTH IT" headline, clean premium feel, no human faces',
    generationMethod: 'gemini' as const, // Only works for supplements/skincare, not fashion
  },
  {
    name: 'phone-call-ui',
    description: 'Incoming call screen UI with Decline/Accept buttons, product as caller',
    visualStyle: 'Phone UI mockup, green Accept / red Decline buttons, product floating above',
    textPlacement: 'integrated',
    colorScheme: 'light',
    suitableFor: ['supplements', 'wellness', 'skincare', 'lifestyle'],
    examplePrompt: 'iPhone incoming call screen, product floating above with pills spilling out, "A life with more energy is calling" text, green Accept button and red Decline button at bottom, clean white background',
  },
  {
    name: 'whatsapp-authentic',
    description: 'Real WhatsApp conversation about the product, authentic social proof',
    visualStyle: 'WhatsApp UI with green/white bubbles, timestamps, blue ticks, beige background',
    textPlacement: 'integrated',
    colorScheme: 'light',
    suitableFor: ['fashion', 'beauty', 'lifestyle', 'any'],
    examplePrompt: 'WhatsApp chat screenshot, left bubble "your outfit is SO pretty!! where is it from??" with emoji, right bubble contains product photo and reply "sending you the link rn", authentic timestamps',
  },
  {
    name: 'ingredient-mascots',
    description: 'Cute 3D rendered characters representing ingredients, playful but informative',
    visualStyle: '3D rendered cute characters with faces, ingredient labels, light background',
    textPlacement: 'bottom-third',
    colorScheme: 'light',
    suitableFor: ['skincare', 'supplements', 'health', 'beauty'],
    examplePrompt: 'Two cute 3D rendered ingredient mascots - silver droplet character and egg-shaped character - standing together, speech bubbles with benefits, "10% OFF" badge, Trustpilot stars at bottom',
  },
  {
    name: 'product-pour',
    description: 'Premium product photography with dripping/pouring textures showing product quality',
    visualStyle: 'Products tilted with contents dripping out, multiple variants, neutral background',
    textPlacement: 'minimal',
    colorScheme: 'product-matched',
    suitableFor: ['lipstick', 'skincare', 'oils', 'serums', 'liquid-products'],
    examplePrompt: 'Three lip oil tubes tilted and dripping colored oils (red, pink, silver), arranged diagonally, beige background, minimal text "LIP LIBRARY" and price, premium cosmetics photography',
  },
  {
    name: 'problem-visualization',
    description: '3D rendered visualization of the problem the product solves',
    visualStyle: '3D render of body part or problem, product as solution, empathetic tone',
    textPlacement: 'minimal',
    colorScheme: 'light',
    suitableFor: ['supplements', 'health', 'wellness', 'skincare'],
    examplePrompt: '3D rendered cartoon stomach looking bloated and uncomfortable against pink background, supplement product floating nearby as solution, "When your stomach feels stretched all day" headline',
  },
  {
    name: 'free-gift-bundle',
    description: 'Clear value proposition with free gift highlight, bundle deal layout',
    visualStyle: 'Products arranged cleanly with "GET ME FREE" callout on bonus item',
    textPlacement: 'bottom-third',
    colorScheme: 'light',
    suitableFor: ['bundles', 'skincare', 'beauty', 'any-with-offer'],
    examplePrompt: 'Product tube and free gloves arranged on textured beige background, circular "GET ME FREE" badge on gloves, "FREE GIFT" headline at top, price and value comparison at bottom',
  },
  {
    name: 'minimal-product-hero',
    description: 'Ultra-clean product shot with minimal text, premium luxury feel',
    visualStyle: 'Single product, lots of whitespace, tiny text, premium photography',
    textPlacement: 'minimal',
    colorScheme: 'light',
    suitableFor: ['luxury', 'premium', 'any'],
    examplePrompt: 'Single product bottle centered on pure white background, brand name small at top, price small at bottom, 80% whitespace, luxury minimalist aesthetic',
  },
];

// ============================================================================
// Concept Selection Logic
// ============================================================================

export interface ConceptMatch {
  concept: CreativeConcept;
  score: number;
  reason: string;
}

/**
 * Select the best creative concept for a product
 *
 * Key insight: Imagen works for conceptual ads (supplements, skincare) but NOT fashion.
 * Fashion products need real product photos via Sharp templates.
 */
export function selectConcept(
  product: ProductBrief,
  usedConcepts: string[] = []
): ConceptMatch {
  // Infer product category from title
  const titleLower = product.title.toLowerCase();
  const inferredCategories = inferCategories(titleLower);

  // CRITICAL: Fashion products should use Sharp templates, not Imagen
  // Imagen generates generic fashion that won't match the actual product
  const isFashion = inferredCategories.some(cat =>
    ['fashion', 'bundles'].includes(cat) ||
    titleLower.includes('dress') ||
    titleLower.includes('kurta') ||
    titleLower.includes('co-ord') ||
    titleLower.includes('pant') ||
    titleLower.includes('set')
  );

  if (isFashion) {
    // For fashion: Return a "use-sharp" signal with best Sharp template
    const sharpConcept: CreativeConcept = {
      name: 'sharp-product-hero',
      description: 'Use Sharp template with real product photo',
      visualStyle: 'Real product photo with elegant overlay',
      textPlacement: 'bottom-third',
      colorScheme: 'dark',
      suitableFor: ['fashion', 'any'],
      examplePrompt: '', // Not used for Sharp
    };

    logger.info(
      { product: product.title, categories: inferredCategories },
      '[CreativeIntel] Fashion product - using Sharp template'
    );

    return {
      concept: sharpConcept,
      score: 100,
      reason: 'Fashion product requires real product photo (Sharp template)',
    };
  }

  // For non-fashion: Use Imagen with premium concepts
  const candidates: ConceptMatch[] = [];

  for (const concept of PREMIUM_CONCEPTS) {
    // Skip if already used for variety
    if (usedConcepts.includes(concept.name) && usedConcepts.length < PREMIUM_CONCEPTS.length - 2) {
      continue;
    }

    let score = 50; // Base score
    let reason = '';

    // Category match
    const categoryMatch = concept.suitableFor.some(cat =>
      inferredCategories.includes(cat) || cat === 'any'
    );
    if (categoryMatch) {
      score += 30;
      reason = `Matches category: ${inferredCategories.join(', ')}`;
    }

    // Discount → urgency concepts
    if (product.discountPercent >= 30) {
      if (concept.name === 'free-gift-bundle' || concept.name === 'playing-card') {
        score += 20;
        reason = `High discount (${product.discountPercent}%) suits ${concept.name}`;
      }
    }

    // Social proof → whatsapp
    if (product.copy.socialProof && concept.name === 'whatsapp-authentic') {
      score += 15;
      reason = 'Has social proof, suits WhatsApp format';
    }

    // Bestseller → problem-visualization or phone-call
    if (product.salesRank <= 3) {
      if (concept.name === 'phone-call-ui' || concept.name === 'problem-visualization') {
        score += 15;
        reason = `Top seller (#${product.salesRank}), premium concept`;
      }
    }

    candidates.push({ concept, score, reason });
  }

  // Sort by score and return best
  candidates.sort((a, b) => b.score - a.score);

  const selected = candidates[0];
  logger.info(
    { product: product.title, concept: selected.concept.name, score: selected.score },
    '[CreativeIntel] Selected concept'
  );

  return selected;
}

/**
 * Infer product categories from title
 * CRITICAL: Fashion/apparel products MUST use real product photos, not AI generation
 */
function inferCategories(title: string): string[] {
  const categories: string[] = [];

  // Fashion keywords - comprehensive list for Indian D2C
  const fashionKeywords = [
    'dress', 'kurta', 'kurti', 'shirt', 'pant', 'trouser', 'jeans',
    'top', 'blouse', 'tunic', 'jacket', 'blazer', 'coat', 'sweater',
    'saree', 'sari', 'lehenga', 'salwar', 'suit', 'palazzo', 'dupatta',
    'co-ord', 'coord', 'set', 'outfit', 'ensemble',
    'cotton', 'silk', 'linen', 'crepe', 'chiffon', 'georgette', 'rayon',
    'printed', 'embroidered', 'embroidery', 'ethnic', 'western',
    'skirt', 'shorts', 'joggers', 'leggings', 'culottes',
    'gown', 'maxi', 'midi', 'mini', 'kaftan', 'cape',
    'wear', 'attire', 'garment', 'apparel', 'clothing',
  ];

  const isFashion = fashionKeywords.some(kw => title.includes(kw));
  if (isFashion) {
    categories.push('fashion');
  }

  // Bundles/sets
  if (title.includes('co-ord') || title.includes('coord') || title.includes('set') || title.includes('combo')) {
    categories.push('bundles');
  }

  // Skincare
  if (title.includes('serum') || title.includes('cream') || title.includes('moistur') || title.includes('lotion')) {
    categories.push('skincare');
  }

  // Beauty
  if (title.includes('lipstick') || title.includes('lip') || title.includes('gloss') || title.includes('makeup')) {
    categories.push('lipstick', 'beauty');
  }

  // Supplements
  if (title.includes('supplement') || title.includes('vitamin') || title.includes('capsule') || title.includes('tablet')) {
    categories.push('supplements', 'health');
  }

  // Liquid products
  if (title.includes('oil') || title.includes('drop') && !categories.includes('fashion')) {
    categories.push('liquid-products', 'skincare');
  }

  // Default to lifestyle (but this will still trigger fashion check in selectConcept)
  if (categories.length === 0) {
    categories.push('lifestyle');
  }

  return categories;
}

// ============================================================================
// Gemini Prompt Generation
// ============================================================================

export interface GeminiPrompt {
  prompt: string;
  concept: string;
  negativePrompt: string;
  aspectRatio: string;
}

/**
 * Generate a Gemini image prompt for a product + concept
 */
export function generateGeminiPrompt(
  product: ProductBrief,
  concept: CreativeConcept,
  brandName: string,
  format: AdFormat
): GeminiPrompt {
  const aspectRatio = format === '1080x1920' ? '9:16' : format === '1200x628' ? '16:9' : '1:1';

  // Build product-specific prompt
  const price = `₹${product.price.toLocaleString('en-IN')}`;
  const discount = product.discountPercent > 0 ? `${product.discountPercent}% OFF` : '';

  let prompt = concept.examplePrompt;

  // Customize for this product
  prompt = prompt
    .replace(/supplement bottles?/gi, product.title)
    .replace(/product/gi, product.title.split(' ').slice(0, 3).join(' '));

  // Add brand and price if text placement allows
  if (concept.textPlacement !== 'none') {
    prompt += `. Brand name "${brandName}" in elegant typography.`;
    if (discount) {
      prompt += ` "${discount}" prominently displayed.`;
    }
    prompt += ` Price "${price}" shown clearly.`;
  }

  // Quality instructions
  prompt += ' High resolution, professional advertising photography, suitable for Instagram/Facebook feed ad.';

  // Negative prompt to avoid common AI issues
  const negativePrompt = 'blurry, low quality, distorted text, misspelled words, extra fingers, deformed hands, watermark, signature, amateur, clipart, stock photo feel';

  return {
    prompt,
    concept: concept.name,
    negativePrompt,
    aspectRatio,
  };
}

// ============================================================================
// Pattern Memory (Learn from validation feedback)
// ============================================================================

interface PatternMemory {
  winningConcepts: Map<string, number>; // concept -> win count
  failedConcepts: Map<string, string[]>; // concept -> failure reasons
  brandPatterns: Map<string, string[]>; // brandName -> successful patterns
}

const memory: PatternMemory = {
  winningConcepts: new Map(),
  failedConcepts: new Map(),
  brandPatterns: new Map(),
};

/**
 * Record a validation result for pattern learning
 */
export function recordValidationResult(
  concept: string,
  approved: boolean,
  score: number,
  issues: string[],
  brandName: string
): void {
  if (approved && score >= 7) {
    // Record win
    const wins = memory.winningConcepts.get(concept) || 0;
    memory.winningConcepts.set(concept, wins + 1);

    // Record for brand
    const brandPatterns = memory.brandPatterns.get(brandName) || [];
    if (!brandPatterns.includes(concept)) {
      brandPatterns.push(concept);
      memory.brandPatterns.set(brandName, brandPatterns);
    }

    logger.info({ concept, score, brandName }, '[CreativeIntel] Recorded winning pattern');
  } else {
    // Record failure reasons
    const failures = memory.failedConcepts.get(concept) || [];
    failures.push(...issues.slice(0, 3));
    memory.failedConcepts.set(concept, failures.slice(-10)); // Keep last 10

    logger.info({ concept, score, issues: issues.slice(0, 2) }, '[CreativeIntel] Recorded failed pattern');
  }
}

/**
 * Get winning concepts sorted by performance
 */
export function getWinningConcepts(): string[] {
  const entries: Array<[string, number]> = [];
  memory.winningConcepts.forEach((value, key) => {
    entries.push([key, value]);
  });

  const sorted = entries
    .sort((a, b) => b[1] - a[1])
    .map(([concept]) => concept);

  return sorted;
}

/**
 * Check if a concept has known issues
 */
export function getConceptIssues(concept: string): string[] {
  return memory.failedConcepts.get(concept) || [];
}

// ============================================================================
// Exports
// ============================================================================

export {
  inferCategories,
  PatternMemory,
  memory as patternMemory,
};
