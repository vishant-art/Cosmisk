/**
 * Validator — shared constants (single source of truth).
 *
 * These values are imported (never re-declared) by the other validator
 * modules so all consumers share identical thresholds, prompts, and the
 * Gemini model fallback chain.
 */

import type { TemplateType } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

export const QUALITY_THRESHOLD = 5.0; // Lowered from 7.0 - Pratapsons has AI-generated product photos
export const MAX_ITERATIONS = 3;

export const VALIDATION_PROMPT = `You are a senior art director and premium brand designer reviewing a static ad for Meta (Facebook/Instagram).

Be BRUTALLY CRITICAL. Your job is to catch weak creatives BEFORE they waste ad spend.

Analyze this ad image and score it on these 13 dimensions (0-10 each):

1. **Visual Quality** - Is the image crisp, well-lit, professional? No compression artifacts, blur, or noise?
2. **Premium Feel** - Does it look like a premium brand, not a cheap template? Would a luxury brand use this?
3. **Readability** - Is all text legible at mobile size (especially in feed)? Proper contrast and sizing?
4. **Emotional Impact** - Does it evoke desire, urgency, or curiosity? Would you stop scrolling?
5. **Conversion Clarity** - Is the CTA clear? Does the viewer know what action to take?
6. **Product Visibility** - Is the product clearly visible and attractive? Is it the hero?
7. **Hook Strength** - Does the headline/hook grab attention in 1 second?
8. **Composition Balance** - Is the layout balanced? Proper visual hierarchy? No cramped elements?
9. **Mobile-Feed Performance** - Will this work at small sizes in a fast-scrolling feed?
10. **Originality** - Does it stand out from typical template ads? Or does it look generic/AI-generated?
11. **Strategy Alignment** - Does the creative match the product positioning and price point?
12. **Brand Consistency** - Does it look like a cohesive brand identity, not a random graphic?
13. **Competitor Benchmark** - Would this compete with top D2C brand ads in the category?

COMMON FAILURES TO CHECK:
- AI-generated artifacts or uncanny visuals
- Generic stock-photo feel
- Weak typography (too small, bad font choices, poor hierarchy)
- Template-like appearance
- Bad spacing or cramped layout
- Text that's hard to read on mobile
- Unclear value proposition
- Missing or weak CTA

Return your analysis as JSON:
{
  "overall": <number 0-10>,
  "dimensions": {
    "visualQuality": <number>,
    "premiumFeel": <number>,
    "readability": <number>,
    "emotionalImpact": <number>,
    "conversionClarity": <number>,
    "productVisibility": <number>,
    "hookStrength": <number>,
    "compositionBalance": <number>,
    "mobileFeedPerformance": <number>,
    "originality": <number>,
    "strategyAlignment": <number>,
    "brandConsistency": <number>,
    "competitorBenchmark": <number>
  },
  "issues": ["list of specific problems found"],
  "suggestions": ["list of specific improvements needed"],
  "critique": "2-3 sentence brutal honest assessment"
}

Be harsh. A score of 7+ means "ready to run ads immediately". Most creatives should NOT pass.`;

// Model fallback chain - try these in order (vision-capable models)
export const GEMINI_MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-pro-latest',
];

export const FIXABLE_MIN = 5.0; // Below this, not worth retrying
export const FIXABLE_MAX = 7.0; // Above this, already approved

/**
 * Template fallback strategy based on weak dimensions
 */
export const TEMPLATE_FALLBACKS: Record<TemplateType, TemplateType[]> = {
  'whatsapp-conversation': ['product-hero', 'social-proof'],
  'product-hero': ['urgency-sale', 'social-proof'],
  'testimonial': ['social-proof', 'product-hero'],
  'urgency-sale': ['product-hero', 'comparison'],
  'social-proof': ['testimonial', 'product-hero'],
  'comparison': ['urgency-sale', 'product-hero'],
};
