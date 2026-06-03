// ============================================================================
// 5. CATEGORY-SPECIFIC INTELLIGENCE
// ============================================================================

import { getDbAdapter } from '../../db/adapter.js';
import type { CategoryKnowledge } from './types.js';

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
