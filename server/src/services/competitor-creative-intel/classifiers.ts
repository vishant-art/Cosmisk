/**
 * Competitor Creative Intelligence — Rule-Based Classifiers & Filters
 *
 * Pure helpers: campaign-type classification, boost-post filtering,
 * rule-based hook/offer/format classifiers, type normalization, and
 * AI-result parsing.
 */

import { logger } from '../../utils/logger.js';
import type { AdLibraryAd, CampaignType, CreativeAnalysis } from './types.js';

// Valid types for normalization
export const VALID_HOOK_TYPES = ['problem_first', 'social_proof', 'discount_lead', 'curiosity', 'fear', 'aspiration', 'transformation', 'testimonial', 'question', 'statistic', 'story', 'other'];
export const VALID_OFFER_TYPES = ['percentage_discount', 'flat_discount', 'free_shipping', 'bundle', 'trial', 'gift', 'bogo', 'none', 'other'];
export const VALID_CTA_TYPES = ['urgency', 'benefit', 'curiosity', 'social_proof', 'scarcity', 'free_offer', 'discount', 'learn_more', 'shop_now', 'other'];
export const VALID_FORMAT_TYPES = ['ugc_video', 'studio_video', 'static_image', 'carousel', 'gif', 'catalog_dpa', 'other'];

// CTAs that indicate conversion-focused campaigns (actual sales intent)
const CONVERSION_CTAS = [
  'shop now', 'shop_now', 'buy now', 'buy_now', 'order now', 'order_now',
  'get offer', 'get_offer', 'get quote', 'get_quote', 'sign up', 'sign_up',
  'subscribe', 'book now', 'book_now', 'download', 'install now', 'install_now',
  'apply now', 'apply_now', 'get started', 'get_started', 'claim offer',
  'add to cart', 'add_to_cart', 'buy', 'purchase', 'checkout'
];

// CTAs that indicate engagement/boost posts (not real conversion campaigns)
const ENGAGEMENT_CTAS = [
  'visit instagram', 'visit_instagram_profile', 'send message', 'send_message',
  'send whatsapp', 'send_whatsapp_message', 'like page', 'like_page',
  'follow', 'watch more', 'watch_more', 'see more', 'see_more',
  'comment', 'share', 'react', 'view profile', 'view_profile'
];

// Domains/patterns in captions that indicate boosted posts (NOT conversion ads)
// The ad_creative_link_captions field shows the domain the ad links to
const ENGAGEMENT_CAPTION_PATTERNS = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'wa.me',
  'whatsapp.com',
  'messenger.com',
  'm.me',
];

/**
 * Check if an ad is a boosted post based on its link caption
 *
 * Meta Ad Library shows the destination domain in ad_creative_link_captions:
 * - Boosted posts show: "instagram.com", "facebook.com"
 * - Conversion ads show: "brandname.com", "shopify.com/store", etc.
 *
 * Note: ad_creative_link_destinations is NOT returned by Ad Library API
 */
export function isBoostedPost(ad: AdLibraryAd): boolean {
  const caption = (ad.ad_creative_link_captions?.[0] || '').toLowerCase().trim();

  // No caption = might be a simple image boost, but give benefit of doubt
  if (!caption) {
    return false;
  }

  // Check if caption shows an engagement platform domain
  for (const pattern of ENGAGEMENT_CAPTION_PATTERNS) {
    if (caption.includes(pattern)) {
      return true; // Links to social platform = boosted post
    }
  }

  // Has a caption but it's not a social platform = conversion ad
  return false;
}

/**
 * Filter out boosted posts from ad results
 * Returns only conversion-focused ads (linking to external websites)
 */
export function filterConversionAds(ads: AdLibraryAd[]): AdLibraryAd[] {
  const filtered = ads.filter(ad => !isBoostedPost(ad));
  const removedCount = ads.length - filtered.length;

  if (removedCount > 0) {
    logger.info(`[CreativeIntel] Filtered ${removedCount} boosted posts, keeping ${filtered.length} conversion ads`);
  }

  return filtered;
}

// Classify campaign type based on CTA and content
export function classifyCampaignType(ctaText: string, primaryText: string, headline: string): CampaignType {
  const allText = `${ctaText} ${primaryText} ${headline}`.toLowerCase();
  const ctaLower = ctaText.toLowerCase();

  // Check for conversion CTAs
  for (const cta of CONVERSION_CTAS) {
    if (ctaLower.includes(cta) || allText.includes(cta)) {
      return 'conversion';
    }
  }

  // Check for engagement CTAs (boost posts)
  for (const cta of ENGAGEMENT_CTAS) {
    if (ctaLower.includes(cta) || allText.includes(cta)) {
      return 'engagement';
    }
  }

  // Check content for conversion signals
  if (/(?:shop|buy|order|₹|rs\.|inr|price|discount|%\s*off|free shipping|add to cart|checkout)/i.test(allText)) {
    return 'conversion';
  }

  // Check content for engagement signals
  if (/(?:follow us|dm for|comment below|tag a friend|share this|link in bio)/i.test(allText)) {
    return 'engagement';
  }

  // Learn more could be either - check context
  if (/learn more|learn_more/i.test(ctaLower)) {
    // If has pricing/offer language, it's conversion
    if (/(?:₹|rs\.|price|offer|discount|sale|buy|shop)/i.test(allText)) {
      return 'conversion';
    }
    return 'awareness';
  }

  return 'unknown';
}

// Normalize AI response to valid type
export function normalizeType(value: string | undefined, validTypes: string[], fallback: string): string {
  if (!value) return fallback;
  const normalized = value.toLowerCase().replace(/[^a-z_]/g, '').replace(/ /g, '_');
  if (validTypes.includes(normalized)) return normalized;
  // Try partial match
  for (const valid of validTypes) {
    if (normalized.includes(valid) || valid.includes(normalized)) return valid;
  }
  return fallback;
}

// Rule-based hook classifier (fallback when AI returns unknown)
export function classifyHookByRules(text: string): string {
  const lower = text.toLowerCase();

  // Problem-first: pain points, struggles, frustrations
  if (/(?:tired of|sick of|struggling|problem|hate|can't|won't|doesn't work|stop wasting|frustrated|annoying|hard to)/i.test(lower)) {
    return 'problem_first';
  }

  // Question hooks
  if (/^(?:do you|are you|have you|want to|looking for|need|what if|why do|how do|ever wonder)/i.test(lower)) {
    return 'question';
  }

  // Social proof: numbers, testimonials, reviews
  if (/(?:\d+[,\d]*\+?\s*(?:customers?|users?|people|women|men|reviews?|sold|happy)|trusted by|as seen|featured in|rated|#1|best seller|everyone)/i.test(lower)) {
    return 'social_proof';
  }

  // Testimonial: quotes, personal stories
  if (/(?:^[""]|^i was|^i used|^my skin|^my hair|^after using|^before i|^this product|^i've been|^finally found|^game changer|^life changing)/i.test(lower)) {
    return 'testimonial';
  }

  // Transformation: before/after, results
  if (/(?:transform|before.{0,20}after|results in|days? to|weeks? to|in just|within \d|see the difference|visible results|real results|glow up)/i.test(lower)) {
    return 'transformation';
  }

  // Discount lead: starts with offer
  if (/^(?:flat|extra|\d+%|save|free|bogo|buy \d|limited time|today only|sale|offer|deal|discount)/i.test(lower)) {
    return 'discount_lead';
  }

  // Curiosity: secrets, reveals, surprising
  if (/(?:secret|nobody tells|they don't want|little known|surprising|shocking|unbelievable|discover|revealed|truth about|the real reason|what nobody|you won't believe)/i.test(lower)) {
    return 'curiosity';
  }

  // Fear/urgency
  if (/(?:don't miss|last chance|running out|limited stock|selling fast|almost gone|hurry|act now|before it's|ends soon|final hours)/i.test(lower)) {
    return 'fear';
  }

  // Aspiration: dreams, goals
  if (/(?:dream|achieve|become|unlock|level up|elevate|premium|luxury|deserve|treat yourself|self.?care|pamper|indulge|glow|radiant|flawless)/i.test(lower)) {
    return 'aspiration';
  }

  // Statistic: numbers and data
  if (/(?:\d+%\s+(?:of|more|less|better|faster|improvement)|clinical|proven|study|research|dermatologist|doctor)/i.test(lower)) {
    return 'statistic';
  }

  // Story: narrative structure
  if (/(?:^when i|^last year|^one day|^it all started|my journey|my story|^i never thought|^years ago)/i.test(lower)) {
    return 'story';
  }

  return 'other';
}

// Rule-based offer classifier
export function classifyOfferByRules(text: string): string {
  const lower = text.toLowerCase();

  if (/\d+%\s*off/i.test(lower)) return 'percentage_discount';
  if (/(?:flat|₹|rs\.?|inr)\s*\d+\s*off/i.test(lower)) return 'flat_discount';
  if (/free\s*(?:shipping|delivery)/i.test(lower)) return 'free_shipping';
  if (/(?:buy\s*\d|bundle|combo|pack of|set of)/i.test(lower)) return 'bundle';
  if (/(?:free\s*(?:trial|sample)|try\s*(?:free|for))/i.test(lower)) return 'trial';
  if (/(?:free\s*gift|gift\s*(?:with|on)|bonus|freebie)/i.test(lower)) return 'gift';
  if (/(?:buy\s*\d+\s*get|bogo|b\d+g\d+)/i.test(lower)) return 'bogo';

  // Check if there's any offer mention
  if (/(?:offer|deal|discount|save|sale|off|free)/i.test(lower)) return 'other';

  return 'none';
}

// Rule-based format classifier
export function classifyFormatByRules(platforms: string[], text: string): string {
  const lower = text.toLowerCase();

  // Check for catalog indicators
  if (/(?:shop now|view product|add to cart|see more)/i.test(lower) && platforms.includes('facebook')) {
    return 'catalog_dpa';
  }

  // Default to static for text-heavy content
  return 'static_image';
}

export function parseAnalysisResult(parsed: Record<string, unknown>, adContent?: { text: string; platforms: string[] }): Partial<CreativeAnalysis> {
  let hookType = normalizeType(parsed['hookType'] as string, VALID_HOOK_TYPES, 'unknown');
  let offerType = normalizeType(parsed['offerType'] as string, VALID_OFFER_TYPES, 'none');
  let creativeFormat = normalizeType(parsed['creativeFormat'] as string, VALID_FORMAT_TYPES, 'unknown');

  // Apply rule-based fallbacks when AI returns unknown/other
  if (adContent?.text) {
    if (hookType === 'unknown' || hookType === 'other') {
      hookType = classifyHookByRules(adContent.text);
    }
    if (offerType === 'none' || offerType === 'other') {
      const ruleOffer = classifyOfferByRules(adContent.text);
      if (ruleOffer !== 'none') offerType = ruleOffer;
    }
    if (creativeFormat === 'unknown' || creativeFormat === 'other') {
      creativeFormat = classifyFormatByRules(adContent.platforms, adContent.text);
    }
  }

  return {
    hookType,
    hookText: (parsed['hookText'] as string) || '',
    ctaType: normalizeType(parsed['ctaType'] as string, VALID_CTA_TYPES, 'unknown'),
    ctaText: (parsed['ctaText'] as string) || '',
    offerType,
    offerDetails: (parsed['offerDetails'] as string) || '',
    creativeFormat,
    emotionalTriggers: (parsed['emotionalTriggers'] as string[]) || [],
    targetAudience: (parsed['targetAudience'] as string) || 'unknown',
  };
}
