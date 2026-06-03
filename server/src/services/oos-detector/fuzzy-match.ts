/**
 * OOS Detector - Fuzzy Matching helpers
 *
 * Name-based matching of ad text to product titles.
 */

// ============ FUZZY MATCHING ============

/**
 * Fuzzy match ad text to product title
 * Ported from Agency-automation-smashed/services/lib/cross-analyzer.mjs
 */
export function fuzzyMatch(adText: string | null | undefined, productTitle: string): { matches: boolean; confidence: 'high' | 'medium' | 'low'; reason: string } {
  if (!adText || !productTitle) {
    return { matches: false, confidence: 'low', reason: 'missing_text' };
  }

  const adLower = adText.toLowerCase().trim();
  const prodLower = productTitle.toLowerCase().trim();

  // Exact substring match = high confidence
  if (adLower.includes(prodLower) || prodLower.includes(adLower)) {
    return { matches: true, confidence: 'high', reason: 'exact_substring' };
  }

  // Word-based matching
  const prodWords = prodLower
    .split(/\s+/)
    .filter(w => w.length > 3) // Skip short words like "the", "and"
    .filter(w => !['with', 'for', 'from', 'pack', 'size'].includes(w)); // Skip common fillers

  if (prodWords.length === 0) {
    return { matches: false, confidence: 'low', reason: 'no_significant_words' };
  }

  const matchCount = prodWords.filter(w => adLower.includes(w)).length;
  const matchRatio = matchCount / prodWords.length;

  // High confidence: 80%+ words match
  if (matchRatio >= 0.8) {
    return { matches: true, confidence: 'high', reason: `word_match_${matchCount}/${prodWords.length}` };
  }

  // Medium confidence: 50%+ words match or at least 2 words
  if (matchRatio >= 0.5 || matchCount >= 2) {
    return { matches: true, confidence: 'medium', reason: `word_match_${matchCount}/${prodWords.length}` };
  }

  // Low confidence: single keyword match for single-word products
  if (prodWords.length === 1 && matchCount === 1) {
    return { matches: true, confidence: 'low', reason: 'single_word_match' };
  }

  return { matches: false, confidence: 'low', reason: 'insufficient_match' };
}

/**
 * Extract product-related text from ad data
 */
export function extractAdText(ad: any): string {
  const parts: string[] = [];

  // Ad name often contains product info
  if (ad.name) parts.push(ad.name);

  // Creative body/title if available
  if (ad.creative?.title) parts.push(ad.creative.title);
  if (ad.creative?.body) parts.push(ad.creative.body);

  // Object story spec for link ads
  if (ad.creative?.object_story_spec?.link_data?.message) {
    parts.push(ad.creative.object_story_spec.link_data.message);
  }
  if (ad.creative?.object_story_spec?.link_data?.name) {
    parts.push(ad.creative.object_story_spec.link_data.name);
  }

  return parts.join(' ');
}
