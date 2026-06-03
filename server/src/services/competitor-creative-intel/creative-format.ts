/**
 * Competitor Creative Intelligence — Creative Format Classification
 */

import type { CreativeFormatDetailed } from './types.js';

/**
 * Classify creative format based on text content
 */
export function classifyCreativeFormat(primaryText: string, headline: string, caption: string): CreativeFormatDetailed {
  const allText = `${primaryText} ${headline} ${caption}`.toLowerCase();

  // Before/After transformation
  if (/(?:before.{0,20}after|transformation|results? in|days? challenge|week.{0,10}journey|progress|glow up)/i.test(allText)) {
    return 'before_after';
  }

  // Founder story
  if (/(?:founder|i started|my journey|why i created|built this|our story|from my kitchen|small batch)/i.test(allText)) {
    return 'founder_story';
  }

  // Podcast/interview style
  if (/(?:podcast|episode|interview|conversation with|talked to|speaking with|guest|listen to)/i.test(allText)) {
    return 'podcast_interview';
  }

  // Testimonial/review
  if (/(?:^[""]|customer.{0,10}say|review|testimonial|real results|honest opinion|my experience|i've been using|changed my life)/i.test(allText)) {
    return 'ugc_testimonial';
  }

  // UGC talking head
  if (/(?:pov:|literally|omg|obsessed|need this|game changer|no cap|not sponsored|honest review)/i.test(allText)) {
    return 'ugc_talking_head';
  }

  // Product demo
  if (/(?:how to use|apply|step by step|watch how|see how|demonstration|in action|works like)/i.test(allText)) {
    return 'product_demo';
  }

  // Unboxing
  if (/(?:unbox|what's inside|package|arrived|mail day|haul|got my order)/i.test(allText)) {
    return 'unboxing';
  }

  // Comparison
  if (/(?:vs\.|versus|compared to|better than|unlike|difference between|why we're different|other brands)/i.test(allText)) {
    return 'comparison';
  }

  // Tutorial/how-to
  if (/(?:tutorial|how to|guide|tips for|routine|steps to|hack|trick)/i.test(allText)) {
    return 'tutorial_howto';
  }

  // Meme/relatable
  if (/(?:when you|me when|nobody:|that feeling|relatable|tag someone|who else|anyone else)/i.test(allText)) {
    return 'meme_relatable';
  }

  // Influencer
  if (/(?:collab|partnered|ambassador|featuring|with @|ft\.|sponsored by)/i.test(allText)) {
    return 'influencer';
  }

  // Lifestyle/aspirational
  if (/(?:lifestyle|living|vibe|aesthetic|mood|energy|feeling|dream|goals|luxury|premium)/i.test(allText)) {
    return 'lifestyle';
  }

  // Static product (default for product-focused copy)
  if (/(?:shop now|buy now|order|available|launch|new arrival|collection|limited)/i.test(allText)) {
    return 'static_product';
  }

  return 'unknown';
}
