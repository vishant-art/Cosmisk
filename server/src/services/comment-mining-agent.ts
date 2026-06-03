/**
 * Comment Mining Agent — Cosmisk
 *
 * Extracts ad concepts from customer comments, reviews, and feedback.
 * Turns customer language into hooks, objection-handlers, and social proof.
 *
 * Sources: Meta ad comments, Instagram post comments, Shopify reviews
 */

import { getDbAdapter } from '../db/adapter.js';
import { MetaApiService } from './meta-api.js';
import { ShopifyClient } from './shopify-client.js';
import { config } from '../config.js';
import Anthropic from '@anthropic-ai/sdk';
import { extractText } from '../utils/claude-helpers.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { decryptToken } from './token-crypto.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

// ============================================================================
// TYPES
// ============================================================================

export interface RawComment {
  id: string;
  source: 'meta_ad' | 'meta_page' | 'instagram_post' | 'shopify_review' | 'support_ticket';
  sourceId: string; // ad ID, post ID, product ID, ticket ID
  text: string;
  author?: string;
  timestamp: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  engagement?: {
    likes?: number;
    replies?: number;
  };
}

export interface ClassifiedComment extends RawComment {
  category: CommentCategory;
  subcategory?: string;
  emotionalTriggers: string[];
  keyPhrases: string[];
  intensity: 'low' | 'medium' | 'high';
  creativeRelevance: number; // 0-100
}

export type CommentCategory =
  | 'objection'      // "Is this worth the price?" → objection-handling ads
  | 'desire'         // "I need this for my wedding" → aspiration ads
  | 'praise'         // "Best purchase ever" → social proof ads
  | 'comparison'     // "Better than Brand X" → differentiation ads
  | 'use_case'       // "Wore to sister's engagement" → scenario ads
  | 'question'       // "Does this come in blue?" → FAQ content
  | 'frustration'    // "Shipping took forever" → process improvement
  | 'other';

export interface CommentPattern {
  pattern: string;
  frequency: number;
  category: CommentCategory;
  exampleComments: string[];
  emotionalWeight: number;
  creativeAngle?: string;
}

export interface CustomerLanguage {
  emotionalDescriptors: Array<{ phrase: string; count: number }>;
  painPointsSolved: Array<{ phrase: string; count: number }>;
  purchaseTriggers: Array<{ phrase: string; count: number }>;
  comparisons: Array<{ phrase: string; competitor?: string; count: number }>;
  useCases: Array<{ phrase: string; occasion?: string; count: number }>;
}

export type ConceptType =
  | 'objection_handler'  // "Is it worth ₹X?" → answer the doubt
  | 'social_proof'       // "Best purchase ever" → show others agree
  | 'aspiration'         // "I want to look like..." → dream state
  | 'differentiation'    // "Better than X" → competitive angle
  | 'scenario'           // "Wore to my wedding" → use case
  | 'fear_reversal'      // "What if it doesn't fit?" → eliminate risk
  | 'desire_amplifier'   // "I NEED this" → intensify want
  | 'urgency_trigger'    // "Almost sold out" → scarcity
  | 'transformation'     // "Before/after" → change story
  | 'community';         // "Everyone's wearing" → belonging

export type AdFormat = 'ugc_script' | 'static_image' | 'carousel' | 'video_hook' | 'story_ad';

export interface CreativeConceptFromComments {
  id: string;
  type: ConceptType;
  hook: string;
  hookSource: 'exact_quote' | 'derived' | 'synthesized';
  sourceComments: string[]; // IDs of comments that inspired this
  visualDirection: string;
  copyPoints: string[];
  targetEmotion: string;
  confidence: number;
  estimatedImpact: string;
  // Enhanced fields
  adFormats: AdFormat[];
  primaryCopy: string;
  secondaryCopy?: string;
  cta: string;
  ugcScript?: string;
  priority: number; // 1-10, higher = create first
  emotionalArc?: string;
}

export interface WhatToCreateNext {
  priority: number; // 1 = create first
  conceptType: ConceptType;
  reason: string;
  dataPoints: number; // how many comments support this
  estimatedROI: 'high' | 'medium' | 'low';
  suggestedFormats: AdFormat[];
  deadline?: string; // "This week", "ASAP", etc.
}

export interface CommentMiningReport {
  clientId: string;
  minedAt: string;
  totalComments: number;
  classifiedComments: number;
  categories: Record<CommentCategory, number>;
  topPatterns: CommentPattern[];
  customerLanguage: CustomerLanguage;
  creativeConcepts: CreativeConceptFromComments[];
  urgentInsights: string[];
  // Enhanced fields
  whatToCreateNext: WhatToCreateNext[];
  emotionalHeatmap: Record<string, number>; // emotion → count
  objectionMap: Array<{ objection: string; frequency: number; currentlyAddressed: boolean }>;
}

// ============================================================================
// COMMENT COLLECTION
// ============================================================================

/**
 * Collect comments from Meta ads
 */
export async function collectMetaAdComments(
  metaToken: string,
  accountId: string,
  options: { days?: number; limit?: number } = {}
): Promise<RawComment[]> {
  const { days = 30, limit = 1000 } = options;
  const meta = new MetaApiService(metaToken);
  const comments: RawComment[] = [];

  try {
    // First, get all Pages the user manages with their Page Access Tokens (with pagination)
    const pageTokenMap = new Map<string, string>();
    let nextUrl: string | null = null;
    let pageCount = 0;

    // First request
    const pagesResp = await meta.get<any>('/me/accounts', {
      fields: 'id,name,access_token',
      limit: '100'
    });

    for (const page of pagesResp.data || []) {
      if (page.access_token) {
        pageTokenMap.set(page.id, page.access_token);
        pageCount++;
      }
    }
    nextUrl = pagesResp.paging?.next;

    // Paginate through remaining pages
    while (nextUrl && pageCount < 500) {
      try {
        const nextResp = await fetch(nextUrl);
        const nextData = await nextResp.json();
        for (const page of nextData.data || []) {
          if (page.access_token) {
            pageTokenMap.set(page.id, page.access_token);
            pageCount++;
          }
        }
        nextUrl = nextData.paging?.next || null;
      } catch {
        break;
      }
    }

    logger.info({ accountId, pagesFound: pageTokenMap.size }, '[CommentMining] Found pages with tokens');

    // Get active, paused, AND archived ads to capture all historical comments
    const adsResp = await meta.get<any>(`/${accountId}/ads`, {
      fields: 'id,name,effective_status',
      filtering: JSON.stringify([
        { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ARCHIVED'] }
      ]),
      limit: '200'
    });

    const ads = adsResp.data || [];
    logger.info({ accountId, adsFound: ads.length }, '[CommentMining] Found ads (active+paused+archived)');

    let adsWithPosts = 0;
    let adsWithComments = 0;
    const accountPageIds = new Set<string>(); // Track pages used by this account's ads

    for (const ad of ads.slice(0, 50)) { // Process up to 50 ads
      try {
        // First get the ad creative to find the post ID
        const adDetails = await meta.get<any>(`/${ad.id}`, {
          fields: 'creative{object_story_id,effective_object_story_id}'
        });

        const postId = adDetails.creative?.effective_object_story_id || adDetails.creative?.object_story_id;
        if (!postId) {
          logger.debug({ adId: ad.id, adName: ad.name }, '[CommentMining] Ad has no post ID (likely catalog ad)');
          continue;
        }
        adsWithPosts++;

        // Extract page ID from post ID (format: pageId_postId)
        const pageId = postId.split('_')[0];
        accountPageIds.add(pageId); // Track this page as belonging to this account
        const pageToken = pageTokenMap.get(pageId);

        if (!pageToken) {
          logger.info({ adId: ad.id, postId, pageId, availablePages: Array.from(pageTokenMap.keys()).slice(0, 5) }, '[CommentMining] No page token for this post');
          continue;
        }
        // Use Page Access Token to get comments
        const pageMeta = new MetaApiService(pageToken);
        const commentsResp = await pageMeta.get<any>(`/${postId}/comments`, {
          fields: 'id,message,from,created_time,like_count,comment_count',
          limit: '50'
        });

        const postComments = commentsResp.data || [];
        logger.info({ adId: ad.id, postId, rawCommentCount: postComments.length }, '[CommentMining] Fetched comments for post');

        if (postComments.length > 0) {
          adsWithComments++;
        }

        for (const comment of postComments) {
          if (comment.message && comment.message.length > 5) {
            comments.push({
              id: comment.id,
              source: 'meta_ad',
              sourceId: ad.id,
              text: comment.message,
              author: comment.from?.name,
              timestamp: comment.created_time,
              engagement: {
                likes: comment.like_count || 0,
                replies: comment.comment_count || 0
              }
            });
          }
        }
      } catch (err: any) {
        logger.debug({ adId: ad.id, error: err.message }, '[CommentMining] Failed to get comments for ad');
        continue;
      }

      if (comments.length >= limit) break;
    }

    logger.info({ accountId, adsFound: ads.length, adsWithPosts, adsWithComments, commentsCollected: comments.length }, '[CommentMining] Collected Meta ad comments');

    // Also collect from organic page posts (where real customer feedback often lives)
    // Only collect from pages that are actually used by this account's ads
    if (comments.length < limit && accountPageIds.size > 0) {
      logger.info({ accountId, accountPages: Array.from(accountPageIds) }, '[CommentMining] Collecting from account-specific pages only');

      for (const pageId of accountPageIds) {
        const pageToken = pageTokenMap.get(pageId);
        if (!pageToken || comments.length >= limit) continue;

        try {
          const pageMeta = new MetaApiService(pageToken);
          let pagePostComments = 0;
          let feedNextUrl: string | null = null;
          let pageNumber = 0;
          const maxPages = 30; // Paginate through up to 30 pages of feed to get older posts with comments

          // First request
          const feedResp = await pageMeta.get<any>(`/${pageId}/feed`, {
            fields: 'id,message,comments.limit(100){id,message,from,created_time,like_count,comment_count}',
            limit: '100'
          });

          const processPostComments = (posts: any[]) => {
            for (const post of posts) {
              const postComments = post.comments?.data || [];
              for (const comment of postComments) {
                if (comment.message && comment.message.length > 5 && comments.length < limit) {
                  comments.push({
                    id: comment.id,
                    source: 'meta_page',
                    sourceId: post.id,
                    text: comment.message,
                    author: comment.from?.name,
                    timestamp: comment.created_time,
                    engagement: {
                      likes: comment.like_count || 0,
                      replies: comment.comment_count || 0
                    }
                  });
                  pagePostComments++;
                }
              }
            }
          };

          processPostComments(feedResp.data || []);
          feedNextUrl = feedResp.paging?.next;
          pageNumber++;

          // Paginate through more feed posts
          while (feedNextUrl && comments.length < limit && pageNumber < maxPages) {
            try {
              const nextResp = await fetch(feedNextUrl);
              const nextData = await nextResp.json();
              processPostComments(nextData.data || []);
              feedNextUrl = nextData.paging?.next || null;
              pageNumber++;
            } catch {
              break;
            }
          }

          if (pagePostComments > 0) {
            logger.info({ pageId, pagePostComments, pagesScanned: pageNumber }, '[CommentMining] Collected comments from page feed');
          }
        } catch (err: any) {
          logger.debug({ pageId, error: err.message }, '[CommentMining] Failed to get page feed comments');
        }
      }
    }

    logger.info({ accountId, totalComments: comments.length }, '[CommentMining] Final Meta comments collected');
    return comments;

  } catch (err) {
    logger.error({ err, accountId }, '[CommentMining] Failed to collect Meta comments');
    return [];
  }
}

/**
 * Collect comments from Instagram posts (requires Instagram Graph API)
 */
export async function collectInstagramComments(
  accessToken: string,
  instagramAccountId: string,
  options: { limit?: number } = {}
): Promise<RawComment[]> {
  const { limit = 300 } = options;
  const comments: RawComment[] = [];

  try {
    // Get recent media
    const mediaResp = await fetch(
      `https://graph.facebook.com/v19.0/${instagramAccountId}/media?fields=id,caption,timestamp,comments_count&limit=25&access_token=${accessToken}`
    );
    const mediaData = await mediaResp.json();

    for (const media of mediaData.data || []) {
      if (media.comments_count > 0) {
        try {
          const commentsResp = await fetch(
            `https://graph.facebook.com/v19.0/${media.id}/comments?fields=id,text,timestamp,username,like_count&limit=50&access_token=${accessToken}`
          );
          const commentsData = await commentsResp.json();

          for (const comment of commentsData.data || []) {
            if (comment.text && comment.text.length > 5) {
              comments.push({
                id: comment.id,
                source: 'instagram_post',
                sourceId: media.id,
                text: comment.text,
                author: comment.username,
                timestamp: comment.timestamp,
                engagement: {
                  likes: comment.like_count || 0
                }
              });
            }
          }
        } catch (err) {
          continue;
        }
      }

      if (comments.length >= limit) break;
    }

    logger.info({ instagramAccountId, count: comments.length }, '[CommentMining] Collected Instagram comments');
    return comments;

  } catch (err) {
    logger.error({ err }, '[CommentMining] Failed to collect Instagram comments');
    return [];
  }
}

/**
 * Collect reviews from Shopify
 */
export async function collectShopifyReviews(
  shopDomain: string,
  shopifyToken: string,
  options: { limit?: number } = {}
): Promise<RawComment[]> {
  const { limit = 200 } = options;
  const comments: RawComment[] = [];

  try {
    const client = new ShopifyClient(shopDomain, shopifyToken);

    // Get products - note: Native Shopify doesn't have reviews API
    // Real implementation would integrate with Judge.me, Yotpo, etc.
    // For now, we extract from product tags/titles that might contain review signals

    const products = await client.getProducts(5); // Limit pages for performance

    for (const product of products) {
      // Check for review signals in tags (tags is comma-separated string)
      const tagArray = (product.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      const reviewTags = tagArray.filter(tag =>
        tag.toLowerCase().includes('bestseller') ||
        tag.toLowerCase().includes('popular') ||
        tag.toLowerCase().includes('trending')
      );

      if (reviewTags.length > 0) {
        comments.push({
          id: `shopify_${product.id}_tag`,
          source: 'shopify_review',
          sourceId: String(product.id),
          text: `Customer favorite: ${product.title} (${reviewTags.join(', ')})`,
          timestamp: new Date().toISOString()
        });
      }
    }

    logger.info({ shopDomain, count: comments.length }, '[CommentMining] Collected Shopify reviews');
    return comments;

  } catch (err) {
    logger.error({ err }, '[CommentMining] Failed to collect Shopify reviews');
    return [];
  }
}

// ============================================================================
// COMMENT CLASSIFICATION
// ============================================================================

/**
 * Classify comments using Gemini (fallback from Claude)
 */
export async function classifyComments(
  comments: RawComment[]
): Promise<ClassifiedComment[]> {
  if (comments.length === 0) return [];

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const gemini = new GoogleGenerativeAI(config.geminiApiKey || '');
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Process in batches of 30 for Gemini
  const batchSize = 30;
  const classified: ClassifiedComment[] = [];

  for (let i = 0; i < comments.length; i += batchSize) {
    const batch = comments.slice(i, i + batchSize);

    const commentList = batch.map((c, idx) =>
      `${idx + 1}. [${c.source}] "${c.text}"`
    ).join('\n');

    try {
      const prompt = `Classify these customer comments from a D2C brand. For each, provide:
- category: objection | desire | praise | comparison | use_case | question | frustration | other
- emotionalTriggers: emotions expressed (max 3)
- keyPhrases: memorable phrases that could be ad copy (max 3)
- intensity: low | medium | high (how strong is the emotion/intent?)
- creativeRelevance: 0-100 (how useful for creating ads?)

Comments:
${commentList}

Return ONLY valid JSON array, no markdown:
[{"index": 1, "category": "praise", "emotionalTriggers": ["joy", "satisfaction"], "keyPhrases": ["fits like a dream"], "intensity": "high", "creativeRelevance": 85}]`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const results = JSON.parse(jsonStr);

      for (const r of results) {
        const originalComment = batch[r.index - 1];
        if (originalComment) {
          classified.push({
            ...originalComment,
            category: r.category || 'other',
            emotionalTriggers: r.emotionalTriggers || [],
            keyPhrases: r.keyPhrases || [],
            intensity: r.intensity || 'low',
            creativeRelevance: r.creativeRelevance || 0
          });
        }
      }

      logger.info({ batchIndex: i, classified: results.length }, '[CommentMining] Classified batch with Gemini');

    } catch (err: any) {
      logger.warn({ err: err.message, batchIndex: i }, '[CommentMining] Classification batch failed');
      // Add unclassified
      for (const comment of batch) {
        classified.push({
          ...comment,
          category: 'other',
          emotionalTriggers: [],
          keyPhrases: [],
          intensity: 'low',
          creativeRelevance: 0
        });
      }
    }
  }

  return classified;
}

// ============================================================================
// PATTERN EXTRACTION
// ============================================================================

/**
 * Extract patterns and customer language from classified comments
 */
export function extractPatterns(
  comments: ClassifiedComment[]
): { patterns: CommentPattern[]; language: CustomerLanguage } {

  // Count phrase frequencies
  const phraseCount = new Map<string, { count: number; category: CommentCategory; examples: string[] }>();

  for (const comment of comments) {
    for (const phrase of comment.keyPhrases) {
      const normalized = phrase.toLowerCase().trim();
      const existing = phraseCount.get(normalized);
      if (existing) {
        existing.count++;
        if (existing.examples.length < 3) {
          existing.examples.push(comment.text);
        }
      } else {
        phraseCount.set(normalized, {
          count: 1,
          category: comment.category,
          examples: [comment.text]
        });
      }
    }
  }

  // Build patterns from frequent phrases
  const patterns: CommentPattern[] = [];
  for (const [phrase, data] of phraseCount.entries()) {
    if (data.count >= 2) { // At least 2 mentions
      patterns.push({
        pattern: phrase,
        frequency: data.count,
        category: data.category,
        exampleComments: data.examples,
        emotionalWeight: data.count * 10, // Simple weighting
        creativeAngle: deriveCreativeAngle(phrase, data.category)
      });
    }
  }

  // Sort by frequency
  patterns.sort((a, b) => b.frequency - a.frequency);

  // Extract customer language by category
  const language: CustomerLanguage = {
    emotionalDescriptors: [],
    painPointsSolved: [],
    purchaseTriggers: [],
    comparisons: [],
    useCases: []
  };

  // Aggregate emotional descriptors from praise
  const praiseComments = comments.filter(c => c.category === 'praise');
  const emotionalMap = new Map<string, number>();
  for (const c of praiseComments) {
    for (const phrase of c.keyPhrases) {
      emotionalMap.set(phrase, (emotionalMap.get(phrase) || 0) + 1);
    }
  }
  language.emotionalDescriptors = Array.from(emotionalMap.entries())
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Pain points from objections/frustrations resolved in praise
  const objectionPhrases = comments
    .filter(c => c.category === 'objection' || c.category === 'frustration')
    .flatMap(c => c.keyPhrases);
  const painMap = new Map<string, number>();
  for (const phrase of objectionPhrases) {
    painMap.set(phrase, (painMap.get(phrase) || 0) + 1);
  }
  language.painPointsSolved = Array.from(painMap.entries())
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Comparisons
  const comparisonComments = comments.filter(c => c.category === 'comparison');
  for (const c of comparisonComments) {
    for (const phrase of c.keyPhrases) {
      language.comparisons.push({
        phrase,
        count: 1,
        competitor: extractCompetitorName(c.text)
      });
    }
  }

  // Use cases
  const useCaseComments = comments.filter(c => c.category === 'use_case');
  for (const c of useCaseComments) {
    for (const phrase of c.keyPhrases) {
      language.useCases.push({
        phrase,
        count: 1,
        occasion: extractOccasion(c.text)
      });
    }
  }

  return { patterns, language };
}

function deriveCreativeAngle(phrase: string, category: CommentCategory): string {
  switch (category) {
    case 'praise':
      return `Social proof ad with hook: "${phrase}"`;
    case 'objection':
      return `Objection-handling ad addressing: "${phrase}"`;
    case 'desire':
      return `Aspiration ad targeting: "${phrase}"`;
    case 'comparison':
      return `Differentiation ad highlighting: "${phrase}"`;
    case 'use_case':
      return `Scenario ad featuring: "${phrase}"`;
    default:
      return `Content addressing: "${phrase}"`;
  }
}

function extractCompetitorName(text: string): string | undefined {
  // Simple pattern matching for competitor mentions
  const patterns = [
    /better than (\w+)/i,
    /switched from (\w+)/i,
    /unlike (\w+)/i,
    /compared to (\w+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

function extractOccasion(text: string): string | undefined {
  const occasions = [
    'wedding', 'engagement', 'party', 'office', 'work', 'date',
    'festival', 'diwali', 'eid', 'holi', 'birthday', 'anniversary',
    'travel', 'vacation', 'interview', 'meeting', 'casual', 'daily'
  ];

  const lower = text.toLowerCase();
  for (const occasion of occasions) {
    if (lower.includes(occasion)) return occasion;
  }
  return undefined;
}

// ============================================================================
// CREATIVE CONCEPT GENERATION (AI-Powered)
// ============================================================================

/**
 * Generate creative concepts from comment patterns using AI
 * This is the core "Comment → Creative Concept Generator"
 */
export async function generateCreativeConcepts(
  patterns: CommentPattern[],
  language: CustomerLanguage,
  brandContext: { name: string; category: string },
  classifiedComments?: ClassifiedComment[]
): Promise<CreativeConceptFromComments[]> {

  const concepts: CreativeConceptFromComments[] = [];

  // Phase 1: Rule-based concepts for guaranteed coverage
  const ruleBasedConcepts = generateRuleBasedConcepts(patterns, language, brandContext);
  concepts.push(...ruleBasedConcepts);

  // Phase 2: AI-generated concepts for creative depth
  if (patterns.length >= 5) {
    try {
      const aiConcepts = await generateAIConceptsFromPatterns(patterns, language, brandContext, classifiedComments);
      concepts.push(...aiConcepts);
    } catch (err) {
      logger.warn({ err }, '[CommentMining] AI concept generation failed, using rule-based only');
    }
  }

  // Phase 2.5: Generate UGC scripts for concepts that need them (batch AI call)
  const conceptsNeedingScripts = concepts.filter(c =>
    c.adFormats?.includes('ugc_script') && !c.ugcScript
  );
  if (conceptsNeedingScripts.length > 0) {
    try {
      await generateUGCScriptsBatch(conceptsNeedingScripts, brandContext);
    } catch (err) {
      logger.warn({ err }, '[CommentMining] Batch script generation failed');
    }
  }

  // Phase 3: Deduplicate and prioritize
  const uniqueConcepts = deduplicateConcepts(concepts);
  const prioritizedConcepts = prioritizeConcepts(uniqueConcepts, patterns);

  return prioritizedConcepts;
}

/**
 * Rule-based concept generation (fast, reliable)
 */
function generateRuleBasedConcepts(
  patterns: CommentPattern[],
  language: CustomerLanguage,
  brandContext: { name: string; category: string }
): CreativeConceptFromComments[] {
  const concepts: CreativeConceptFromComments[] = [];

  // 1. Social proof from praise (highest confidence)
  const topPraise = patterns
    .filter(p => p.category === 'praise' && p.frequency >= 2)
    .slice(0, 4);

  for (const praise of topPraise) {
    concepts.push({
      id: uuidv4(),
      type: 'social_proof',
      hook: `"${praise.pattern}" — ${praise.frequency}+ customers agree`,
      hookSource: 'exact_quote',
      sourceComments: praise.exampleComments.slice(0, 3),
      visualDirection: 'Customer photos/screenshots with quote overlay, product in lifestyle context',
      copyPoints: [
        `Real customer quote: "${praise.pattern}"`,
        'Show diversity of happy customers',
        'Include purchase count or review count'
      ],
      targetEmotion: 'trust',
      confidence: Math.min(95, 60 + praise.frequency * 5),
      estimatedImpact: praise.frequency >= 5 ? 'High — proven resonance' : 'Medium — emerging pattern',
      adFormats: ['static_image', 'carousel', 'ugc_script'],
      primaryCopy: `${praise.frequency}+ customers said "${praise.pattern}"`,
      secondaryCopy: `Join thousands who already love ${brandContext.name}`,
      cta: 'Shop Now',
      priority: calculatePriority(praise.frequency, 'praise')
    });
  }

  // 2. Objection handlers (high ROI - removes purchase barriers)
  const topObjections = patterns
    .filter(p => p.category === 'objection' && p.frequency >= 2)
    .slice(0, 4);

  for (const objection of topObjections) {
    const hook = generateObjectionHook(objection.pattern);
    concepts.push({
      id: uuidv4(),
      type: 'objection_handler',
      hook,
      hookSource: 'derived',
      sourceComments: objection.exampleComments.slice(0, 3),
      visualDirection: 'Split screen: concern on left, proof/answer on right. End with happy customer.',
      copyPoints: [
        `Acknowledge the concern: "${objection.pattern}"`,
        'Provide concrete proof (sizing chart, return policy, etc.)',
        'Feature customer who had same concern and was satisfied'
      ],
      targetEmotion: 'reassurance',
      confidence: Math.min(90, 55 + objection.frequency * 5),
      estimatedImpact: `${objection.frequency} potential customers have this doubt — address it`,
      adFormats: ['ugc_script', 'video_hook', 'static_image'],
      primaryCopy: hook,
      secondaryCopy: `We hear you. Here's the truth about ${brandContext.name}`,
      cta: 'See For Yourself',
      priority: calculatePriority(objection.frequency, 'objection') + 2 // Boost objection handlers
    });
  }

  // 3. Desire amplifiers from desire comments
  const topDesires = patterns
    .filter(p => p.category === 'desire' && p.frequency >= 2)
    .slice(0, 3);

  for (const desire of topDesires) {
    concepts.push({
      id: uuidv4(),
      type: 'desire_amplifier',
      hook: `That feeling when ${desire.pattern.toLowerCase()}...`,
      hookSource: 'derived',
      sourceComments: desire.exampleComments.slice(0, 3),
      visualDirection: 'Aspirational lifestyle shot. Customer living the dream. Slow motion reveal.',
      copyPoints: [
        `Tap into the desire: "${desire.pattern}"`,
        'Show the transformation/result',
        'Make it feel attainable'
      ],
      targetEmotion: 'desire',
      confidence: Math.min(85, 50 + desire.frequency * 5),
      estimatedImpact: 'Converts window shoppers to buyers',
      adFormats: ['video_hook', 'story_ad', 'carousel'],
      primaryCopy: `You've been wanting this. Now make it happen.`,
      secondaryCopy: desire.pattern,
      cta: 'Get Yours',
      priority: calculatePriority(desire.frequency, 'desire')
    });
  }

  // 4. Scenario ads from use cases
  const topUseCases = patterns
    .filter(p => p.category === 'use_case')
    .slice(0, 3);

  for (const useCase of topUseCases) {
    const occasion = language.useCases.find(u => u.phrase === useCase.pattern)?.occasion || 'any occasion';
    concepts.push({
      id: uuidv4(),
      type: 'scenario',
      hook: `Perfect for ${occasion}`,
      hookSource: 'synthesized',
      sourceComments: useCase.exampleComments.slice(0, 3),
      visualDirection: `Real customer in ${occasion} setting. Before/during/after the event. Show reactions from others.`,
      copyPoints: [
        `Position product for ${occasion}`,
        'Show real customer story',
        'Highlight compliments received'
      ],
      targetEmotion: 'aspiration',
      confidence: 70,
      estimatedImpact: 'Expands perceived use cases, reaches new audiences',
      adFormats: ['carousel', 'ugc_script', 'video_hook'],
      primaryCopy: `Made for ${occasion}. Loved by customers.`,
      secondaryCopy: `"${useCase.pattern}" — real customer`,
      cta: 'Shop The Look',
      priority: calculatePriority(useCase.frequency, 'use_case')
    });
  }

  // 5. Fear reversal from frustration/questions
  const topFears = patterns
    .filter(p => (p.category === 'frustration' || p.category === 'question') && p.frequency >= 2)
    .slice(0, 2);

  for (const fear of topFears) {
    concepts.push({
      id: uuidv4(),
      type: 'fear_reversal',
      hook: `What if ${fear.pattern.toLowerCase()}? Here's our promise...`,
      hookSource: 'derived',
      sourceComments: fear.exampleComments.slice(0, 3),
      visualDirection: 'Start with the fear/concern, transition to solution, end with guarantee.',
      copyPoints: [
        `Name the fear: "${fear.pattern}"`,
        'Show how you solve it',
        'Offer guarantee or proof'
      ],
      targetEmotion: 'relief',
      confidence: 65,
      estimatedImpact: 'Removes final barrier to purchase',
      adFormats: ['ugc_script', 'static_image'],
      primaryCopy: `Worried about ${fear.pattern.toLowerCase()}?`,
      secondaryCopy: `We've got you covered. Here's our promise.`,
      cta: 'Risk-Free Trial',
      priority: calculatePriority(fear.frequency, 'frustration') + 1
    });
  }

  // 6. Comparison/differentiation from comparison comments
  const topComparisons = patterns
    .filter(p => p.category === 'comparison')
    .slice(0, 2);

  for (const comp of topComparisons) {
    const competitor = language.comparisons.find(c => c.phrase === comp.pattern)?.competitor;
    concepts.push({
      id: uuidv4(),
      type: 'differentiation',
      hook: competitor ? `Why customers switched from ${competitor}` : `Why customers chose us`,
      hookSource: 'synthesized',
      sourceComments: comp.exampleComments.slice(0, 3),
      visualDirection: 'Side-by-side comparison. Focus on our advantage. Customer testimonial about switching.',
      copyPoints: [
        'Highlight key differentiator',
        'Show customer who made the switch',
        'Don\'t bash competitor, elevate yourself'
      ],
      targetEmotion: 'confidence',
      confidence: 60,
      estimatedImpact: 'Converts competitor\'s customers',
      adFormats: ['carousel', 'ugc_script'],
      primaryCopy: `"${comp.pattern}" — real customer review`,
      cta: 'Make The Switch',
      priority: calculatePriority(comp.frequency, 'comparison')
    });
  }

  // 7. Synthesized hook from top emotional descriptors
  if (language.emotionalDescriptors.length >= 3) {
    const topPhrases = language.emotionalDescriptors.slice(0, 3);
    const combinedHook = topPhrases.map(p => p.phrase).join(' • ');

    concepts.push({
      id: uuidv4(),
      type: 'community',
      hook: combinedHook,
      hookSource: 'synthesized',
      sourceComments: [],
      visualDirection: 'Montage of customer reactions. Quick cuts. End with product.',
      copyPoints: [
        'Rapid-fire customer phrases',
        'Show diversity of happy customers',
        'Energy and excitement'
      ],
      targetEmotion: 'belonging',
      confidence: 80,
      estimatedImpact: 'High — combines proven emotional triggers',
      adFormats: ['video_hook', 'carousel', 'story_ad'],
      primaryCopy: combinedHook,
      secondaryCopy: `Join ${topPhrases.reduce((sum, p) => sum + p.count, 0)}+ happy customers`,
      cta: 'Join The Community',
      priority: 7
    });
  }

  return concepts;
}

/**
 * AI-generated concepts for creative depth
 */
async function generateAIConceptsFromPatterns(
  patterns: CommentPattern[],
  language: CustomerLanguage,
  brandContext: { name: string; category: string },
  classifiedComments?: ClassifiedComment[]
): Promise<CreativeConceptFromComments[]> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const gemini = new GoogleGenerativeAI(config.geminiApiKey || '');
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Build context for AI
  const patternSummary = patterns.slice(0, 15).map(p =>
    `- "${p.pattern}" (${p.category}, mentioned ${p.frequency}x)`
  ).join('\n');

  const emotionalSummary = language.emotionalDescriptors.slice(0, 5)
    .map(e => `"${e.phrase}" (${e.count}x)`).join(', ');

  const painPoints = language.painPointsSolved.slice(0, 5)
    .map(p => `"${p.phrase}" (${p.count}x)`).join(', ');

  // Get raw high-engagement comments for authentic voice
  const highEngagement = classifiedComments
    ?.filter(c => c.creativeRelevance >= 70)
    .slice(0, 10)
    .map(c => `"${c.text}" [${c.category}]`)
    .join('\n') || '';

  const prompt = `You are a senior D2C creative strategist. Based on real customer comments, generate 3 unique ad concepts.

BRAND: ${brandContext.name} (${brandContext.category})

TOP COMMENT PATTERNS:
${patternSummary}

EMOTIONAL LANGUAGE CUSTOMERS USE:
${emotionalSummary}

PAIN POINTS MENTIONED:
${painPoints}

${highEngagement ? `HIGH-VALUE COMMENTS (exact quotes):
${highEngagement}` : ''}

Generate 3 ad concepts that:
1. Use EXACT customer language (not marketing speak)
2. Address real concerns or amplify real desires
3. Feel authentic, not salesy
4. Could work as UGC, static, or video

UGC SCRIPT FORMAT (30-second framework):
[HOOK - 0:00-0:03] Opening line that grabs attention (use customer language)
[ADDRESS - 0:03-0:15] Story/concern acknowledgment *with B-roll directions in asterisks*
[PROOF - 0:15-0:25] Demonstrate/show product solving it *with visual cues*
[CTA - 0:25-0:30] Call to action

Return ONLY valid JSON array:
[{
  "type": "objection_handler|social_proof|desire_amplifier|transformation|fear_reversal",
  "hook": "The opening line/hook (under 10 words)",
  "primaryCopy": "Main ad copy (1-2 sentences)",
  "visualDirection": "What the visual should show",
  "ugcScript": "Full 30-second script with [HOOK], [ADDRESS], [PROOF], [CTA] sections and timing",
  "targetEmotion": "primary emotion to trigger",
  "whyThisWorks": "brief explanation",
  "priority": 1-10
}]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const aiConcepts = JSON.parse(jsonStr);

    return aiConcepts.map((c: any) => ({
      id: uuidv4(),
      type: c.type || 'social_proof',
      hook: c.hook,
      hookSource: 'synthesized' as const,
      sourceComments: [],
      visualDirection: c.visualDirection,
      copyPoints: [c.whyThisWorks],
      targetEmotion: c.targetEmotion,
      confidence: 75,
      estimatedImpact: c.whyThisWorks,
      adFormats: ['ugc_script', 'static_image', 'video_hook'] as AdFormat[],
      primaryCopy: c.primaryCopy,
      cta: 'Shop Now',
      ugcScript: typeof c.ugcScript === 'string' ? c.ugcScript : undefined,
      priority: c.priority || 5
    }));

  } catch (err) {
    logger.warn({ err }, '[CommentMining] AI concept generation failed');
    return [];
  }
}

/**
 * Batch generate UGC scripts for concepts using Gemini AI
 */
async function generateUGCScriptsBatch(
  concepts: CreativeConceptFromComments[],
  brandContext: { name: string; category: string }
): Promise<void> {
  if (concepts.length === 0) return;

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const gemini = new GoogleGenerativeAI(config.geminiApiKey || '');
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const conceptSummaries = concepts.map((c, i) =>
    `${i + 1}. TYPE: ${c.type} | HOOK: "${c.hook}" | PATTERN: "${c.primaryCopy || c.hook}"`
  ).join('\n');

  const prompt = `You are a senior UGC ad scriptwriter. Generate 30-second scripts for these ad concepts.

BRAND: ${brandContext.name} (${brandContext.category})

CONCEPTS TO SCRIPT:
${conceptSummaries}

SCRIPT FORMAT (strict 30-second structure):
[HOOK - 0:00-0:03] Opening line that grabs attention, use customer language
[ADDRESS - 0:03-0:15] Story/acknowledgment *with B-roll directions in asterisks*
[PROOF - 0:15-0:25] Demonstrate product solving the concern *with visual cues*
[CTA - 0:25-0:30] Call to action

RULES:
- Conversational tone, like talking to a friend
- Use exact customer language from hooks, not marketing speak
- Include *B-roll directions* in asterisks
- Scripts must feel authentic, not salesy
- Each script must be production-ready

Return ONLY valid JSON array (same order as concepts):
[
  { "index": 1, "script": "Full formatted 30-second script with all sections" },
  ...
]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const scripts = JSON.parse(jsonStr);

    for (const s of scripts) {
      const idx = (s.index || 1) - 1;
      if (idx >= 0 && idx < concepts.length && typeof s.script === 'string') {
        concepts[idx].ugcScript = s.script;
      }
    }
  } catch (err) {
    logger.warn({ err }, '[CommentMining] Batch UGC script generation failed');
    // Concepts will just not have ugcScript - that's fine
  }
}

/**
 * Generate objection-specific hook
 */
function generateObjectionHook(objection: string): string {
  const lower = objection.toLowerCase();

  if (lower.includes('price') || lower.includes('expensive') || lower.includes('worth') || lower.includes('cost')) {
    return `"Is it worth the price?" Let me show you...`;
  }
  if (lower.includes('fit') || lower.includes('size') || lower.includes('sizing')) {
    return `"Will it actually fit?" Here's the truth...`;
  }
  if (lower.includes('quality') || lower.includes('authentic') || lower.includes('real') || lower.includes('original')) {
    return `"Is this actually good quality?" Let me prove it...`;
  }
  if (lower.includes('return') || lower.includes('exchange') || lower.includes('refund')) {
    return `"What if I need to return it?" Here's our promise...`;
  }
  if (lower.includes('shipping') || lower.includes('delivery') || lower.includes('time')) {
    return `"When will it arrive?" Let's be honest...`;
  }
  if (lower.includes('fraud') || lower.includes('scam') || lower.includes('fake')) {
    return `"Is this legit?" I had the same doubt...`;
  }

  return `"${objection}" — here's what you need to know...`;
}

/**
 * Calculate priority score for a concept
 */
function calculatePriority(frequency: number, category: CommentCategory): number {
  // Base priority by category
  const categoryBase: Record<CommentCategory, number> = {
    objection: 8,      // High priority - removes barriers
    frustration: 7,    // Address pain points
    desire: 6,         // Amplify wants
    praise: 5,         // Social proof
    use_case: 4,       // Scenario expansion
    comparison: 4,     // Competitive positioning
    question: 3,       // FAQ content
    other: 2
  };

  const base = categoryBase[category] || 3;

  // Boost by frequency
  const frequencyBoost = Math.min(2, frequency / 5);

  return Math.min(10, Math.round(base + frequencyBoost));
}

/**
 * Deduplicate similar concepts
 */
function deduplicateConcepts(concepts: CreativeConceptFromComments[]): CreativeConceptFromComments[] {
  const seen = new Set<string>();
  const unique: CreativeConceptFromComments[] = [];

  for (const concept of concepts) {
    // Create a simple fingerprint
    const fingerprint = `${concept.type}-${concept.hook.toLowerCase().slice(0, 30)}`;

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(concept);
    }
  }

  return unique;
}

/**
 * Prioritize concepts by ROI potential and renumber 1, 2, 3...
 */
function prioritizeConcepts(
  concepts: CreativeConceptFromComments[],
  patterns: CommentPattern[]
): CreativeConceptFromComments[] {
  // Sort by priority score (highest first = most important)
  const sorted = concepts.sort((a, b) => b.priority - a.priority);

  // Renumber priorities sequentially: 1, 2, 3... (1 = create first)
  sorted.forEach((concept, index) => {
    concept.priority = index + 1;
  });

  return sorted;
}

// ============================================================================
// WHAT TO CREATE NEXT ENGINE
// ============================================================================

/**
 * Generate prioritized "What To Create Next" recommendations
 * This is the strategic layer that tells the brand WHAT ads to make
 */
function generateWhatToCreateNext(
  patterns: CommentPattern[],
  categoryCount: Record<CommentCategory, number>,
  concepts: CreativeConceptFromComments[]
): WhatToCreateNext[] {
  const recommendations: WhatToCreateNext[] = [];
  const totalComments = Object.values(categoryCount).reduce((a, b) => a + b, 0);

  // 1. Check for high-frequency objections (URGENT)
  const topObjections = patterns
    .filter(p => p.category === 'objection' && p.frequency >= 3)
    .slice(0, 3);

  for (let i = 0; i < topObjections.length; i++) {
    const obj = topObjections[i];
    recommendations.push({
      priority: i + 1,
      conceptType: 'objection_handler',
      reason: `"${obj.pattern}" asked ${obj.frequency}x — potential customers are hesitating`,
      dataPoints: obj.frequency,
      estimatedROI: obj.frequency >= 5 ? 'high' : 'medium',
      suggestedFormats: ['ugc_script', 'video_hook'],
      deadline: obj.frequency >= 5 ? 'ASAP' : 'This week'
    });
  }

  // 2. Check for frustration spike (REPUTATION RISK)
  const frustrationRate = (categoryCount.frustration / totalComments) * 100;
  if (frustrationRate > 15) {
    recommendations.push({
      priority: 1,
      conceptType: 'fear_reversal',
      reason: `${Math.round(frustrationRate)}% frustration rate — address before it spreads`,
      dataPoints: categoryCount.frustration,
      estimatedROI: 'high',
      suggestedFormats: ['ugc_script', 'static_image'],
      deadline: 'ASAP'
    });
  }

  // 3. Leverage high praise for social proof
  const topPraise = patterns
    .filter(p => p.category === 'praise' && p.frequency >= 3)
    .slice(0, 2);

  for (const praise of topPraise) {
    const existingPriorities = recommendations.map(r => r.priority);
    const nextPriority = existingPriorities.length > 0 ? Math.max(...existingPriorities) + 1 : 3;

    recommendations.push({
      priority: nextPriority,
      conceptType: 'social_proof',
      reason: `"${praise.pattern}" resonates — ${praise.frequency} customers already saying it`,
      dataPoints: praise.frequency,
      estimatedROI: praise.frequency >= 5 ? 'high' : 'medium',
      suggestedFormats: ['carousel', 'static_image', 'ugc_script'],
      deadline: 'This week'
    });
  }

  // 4. Desire amplification opportunity
  if (categoryCount.desire >= 5) {
    const topDesire = patterns.find(p => p.category === 'desire');
    if (topDesire) {
      recommendations.push({
        priority: recommendations.length + 1,
        conceptType: 'desire_amplifier',
        reason: `${categoryCount.desire} desire comments — customers want this, help them commit`,
        dataPoints: categoryCount.desire,
        estimatedROI: 'medium',
        suggestedFormats: ['video_hook', 'story_ad'],
        deadline: 'Next sprint'
      });
    }
  }

  // 5. Scenario expansion for use cases
  if (categoryCount.use_case >= 3) {
    const occasions = patterns
      .filter(p => p.category === 'use_case')
      .slice(0, 2)
      .map(p => p.pattern)
      .join(', ');

    recommendations.push({
      priority: recommendations.length + 1,
      conceptType: 'scenario',
      reason: `Customers mentioning: ${occasions} — expand targeting to these occasions`,
      dataPoints: categoryCount.use_case,
      estimatedROI: 'medium',
      suggestedFormats: ['carousel', 'ugc_script'],
      deadline: 'Next sprint'
    });
  }

  // 6. Competitive differentiation
  if (categoryCount.comparison >= 2) {
    const competitors = patterns
      .filter(p => p.category === 'comparison')
      .slice(0, 2);

    recommendations.push({
      priority: recommendations.length + 1,
      conceptType: 'differentiation',
      reason: `Customers comparing to competitors — capitalize on switches`,
      dataPoints: categoryCount.comparison,
      estimatedROI: 'medium',
      suggestedFormats: ['carousel', 'static_image'],
      deadline: 'Next sprint'
    });
  }

  // 7. Community/belonging angle if high engagement
  const praiseRate = (categoryCount.praise / totalComments) * 100;
  if (praiseRate > 20 && categoryCount.praise >= 10) {
    recommendations.push({
      priority: recommendations.length + 1,
      conceptType: 'community',
      reason: `${Math.round(praiseRate)}% positive sentiment — build community angle`,
      dataPoints: categoryCount.praise,
      estimatedROI: 'medium',
      suggestedFormats: ['video_hook', 'carousel'],
      deadline: 'Next month'
    });
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority);

  // Renumber priorities to be sequential
  recommendations.forEach((r, i) => {
    r.priority = i + 1;
  });

  return recommendations.slice(0, 8); // Max 8 recommendations
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Run full comment mining for a client
 */
export async function runCommentMining(
  clientId: string,
  options: {
    metaToken?: string;
    metaAccountId?: string;
    instagramToken?: string;
    instagramAccountId?: string;
    shopifyDomain?: string;
    shopifyToken?: string;
    brandName?: string;
    brandCategory?: string;
  }
): Promise<CommentMiningReport> {
  const db = getDbAdapter();
  const startTime = Date.now();

  logger.info({ clientId }, '[CommentMining] Starting comment mining');

  // Collect from all sources
  const allComments: RawComment[] = [];

  if (options.metaToken && options.metaAccountId) {
    const metaComments = await collectMetaAdComments(
      options.metaToken,
      options.metaAccountId,
      { limit: 300 }
    );
    allComments.push(...metaComments);
  }

  if (options.instagramToken && options.instagramAccountId) {
    const igComments = await collectInstagramComments(
      options.instagramToken,
      options.instagramAccountId,
      { limit: 200 }
    );
    allComments.push(...igComments);
  }

  if (options.shopifyDomain && options.shopifyToken) {
    const shopifyReviews = await collectShopifyReviews(
      options.shopifyDomain,
      options.shopifyToken,
      { limit: 100 }
    );
    allComments.push(...shopifyReviews);
  }

  logger.info({ clientId, totalComments: allComments.length }, '[CommentMining] Comments collected');

  // Classify comments
  const classifiedComments = await classifyComments(allComments);

  // Extract patterns
  const { patterns, language } = extractPatterns(classifiedComments);

  // Generate creative concepts (pass classified comments for AI context)
  const creatives = await generateCreativeConcepts(
    patterns,
    language,
    {
      name: options.brandName || 'Brand',
      category: options.brandCategory || 'fashion'
    },
    classifiedComments
  );

  // Count by category
  const categoryCount: Record<CommentCategory, number> = {
    objection: 0,
    desire: 0,
    praise: 0,
    comparison: 0,
    use_case: 0,
    question: 0,
    frustration: 0,
    other: 0
  };
  for (const c of classifiedComments) {
    categoryCount[c.category]++;
  }

  // Build emotional heatmap
  const emotionalHeatmap: Record<string, number> = {};
  for (const c of classifiedComments) {
    for (const emotion of c.emotionalTriggers) {
      emotionalHeatmap[emotion] = (emotionalHeatmap[emotion] || 0) + 1;
    }
  }

  // Build objection map
  const objectionMap = patterns
    .filter(p => p.category === 'objection' || p.category === 'question')
    .slice(0, 10)
    .map(p => ({
      objection: p.pattern,
      frequency: p.frequency,
      currentlyAddressed: false // Could check against existing ads
    }));

  // Generate "What To Create Next" recommendations
  const whatToCreateNext = generateWhatToCreateNext(patterns, categoryCount, creatives);

  // Generate urgent insights
  const urgentInsights: string[] = [];

  const topObjection = patterns.find(p => p.category === 'objection' && p.frequency >= 5);
  if (topObjection) {
    urgentInsights.push(`${topObjection.frequency} comments mention "${topObjection.pattern}" — create objection-handling ad immediately`);
  }

  const topPraise = patterns.find(p => p.category === 'praise' && p.frequency >= 10);
  if (topPraise) {
    urgentInsights.push(`"${topPraise.pattern}" mentioned ${topPraise.frequency}+ times — strong social proof hook available`);
  }

  const frustrationCount = categoryCount.frustration;
  if (frustrationCount > classifiedComments.length * 0.1) {
    urgentInsights.push(`${frustrationCount} frustration comments (${Math.round(frustrationCount / classifiedComments.length * 100)}%) — review and address`);
  }

  // Add high-priority creation recommendations to urgent insights
  const topPriority = whatToCreateNext.find(w => w.priority === 1);
  if (topPriority) {
    urgentInsights.push(`TOP PRIORITY: Create ${topPriority.conceptType} ad — ${topPriority.reason}`);
  }

  // Build report
  const report: CommentMiningReport = {
    clientId,
    minedAt: new Date().toISOString(),
    totalComments: allComments.length,
    classifiedComments: classifiedComments.length,
    categories: categoryCount,
    topPatterns: patterns.slice(0, 15),
    customerLanguage: language,
    creativeConcepts: creatives,
    urgentInsights,
    whatToCreateNext,
    emotionalHeatmap,
    objectionMap
  };

  // Persist report
  try {
    await db.run(`
      INSERT INTO comment_mining_reports (id, client_id, report, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `, [uuidv4(), clientId, JSON.stringify(report)]);
  } catch (err) {
    logger.warn({ err }, '[CommentMining] Failed to persist report');
  }

  const duration = Date.now() - startTime;
  logger.info({
    clientId,
    comments: allComments.length,
    patterns: patterns.length,
    concepts: creatives.length,
    durationMs: duration
  }, '[CommentMining] Complete');

  return report;
}

/**
 * Get latest mining report for client
 */
export async function getLatestReport(clientId: string): Promise<CommentMiningReport | null> {
  const db = getDbAdapter();
  const row = await db.get(`
    SELECT report FROM comment_mining_reports
    WHERE client_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [clientId]) as { report: string } | undefined;

  if (!row) return null;
  return JSON.parse(row.report);
}

/**
 * Generate HTML report for client delivery
 */
export function generateHTMLReport(report: CommentMiningReport, brandName: string): string {
  const topPraise = report.topPatterns.filter(p => p.category === 'praise').slice(0, 5);
  const topObjections = report.topPatterns.filter(p => p.category === 'objection').slice(0, 5);
  const topQuestions = report.topPatterns.filter(p => p.category === 'question').slice(0, 5);
  const topFrustrations = report.topPatterns.filter(p => p.category === 'frustration').slice(0, 5);

  // Get top emotions from heatmap
  const topEmotions = Object.entries(report.emotionalHeatmap || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comment Intelligence Report — ${brandName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      line-height: 1.6;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }

    /* Header */
    .header { text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-bottom: 1px solid #333; }
    .logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; }
    h1 { font-size: 42px; font-weight: 700; background: linear-gradient(90deg, #EC8A23, #f5a623); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 16px; }
    .subtitle { font-size: 18px; color: #888; }

    /* Sections */
    .section { padding: 40px 0; border-bottom: 1px solid #222; }
    .section-title { font-size: 24px; font-weight: 600; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; color: #fff; }
    .section-title::before { content: ''; width: 4px; height: 24px; background: #EC8A23; border-radius: 2px; }

    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    @media (max-width: 768px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
    .stat { background: #151515; border: 1px solid #2a2a2a; padding: 24px; border-radius: 12px; text-align: center; }
    .stat-value { font-size: 36px; font-weight: 700; color: #EC8A23; }
    .stat-label { color: #888; font-size: 13px; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }

    /* What To Create Next */
    .create-next { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; overflow: hidden; margin: 24px 0; }
    .create-next-header { background: linear-gradient(90deg, #EC8A23, #f5a623); color: #000; padding: 16px 24px; font-weight: 700; font-size: 18px; }
    .create-item { display: flex; gap: 16px; padding: 20px 24px; border-bottom: 1px solid #2a2a2a; align-items: flex-start; }
    .create-item:last-child { border-bottom: none; }
    .create-priority { background: #EC8A23; color: #000; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
    .create-content { flex: 1; }
    .create-type { font-weight: 600; color: #fff; margin-bottom: 4px; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
    .create-reason { color: #ccc; font-size: 14px; }
    .create-meta { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; }
    .create-meta span { background: #2a2a2a; padding: 4px 10px; border-radius: 20px; color: #888; }
    .create-meta .high { color: #10b981; }
    .create-meta .asap { color: #ef4444; }

    /* Pattern Cards */
    .pattern-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 768px) { .pattern-grid { grid-template-columns: 1fr; } }
    .pattern-card { background: #151515; border: 1px solid #2a2a2a; border-radius: 12px; padding: 20px; }
    .pattern-card h3 { margin: 0 0 16px 0; font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .pattern-card.danger { border-left: 4px solid #ef4444; }
    .pattern-card.danger h3 { color: #ef4444; }
    .pattern-card.warning { border-left: 4px solid #f59e0b; }
    .pattern-card.warning h3 { color: #f59e0b; }
    .pattern-card.success { border-left: 4px solid #10b981; }
    .pattern-card.success h3 { color: #10b981; }
    .pattern { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #2a2a2a; }
    .pattern:last-child { border-bottom: none; }
    .pattern-phrase { font-weight: 500; color: #ccc; }
    .pattern-count { background: #2a2a2a; color: #EC8A23; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }

    /* Concepts */
    .concept { background: #151515; border: 1px solid #2a2a2a; border-left: 4px solid #EC8A23; padding: 24px; margin: 16px 0; border-radius: 12px; }
    .concept-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .concept-type { font-size: 12px; color: #EC8A23; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
    .concept-priority { background: #EC8A23; color: #000; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .concept-hook { font-size: 22px; font-weight: 700; margin: 8px 0; color: #fff; }
    .concept-copy { color: #aaa; font-size: 15px; margin: 12px 0; padding: 12px; background: #1a1a1a; border-radius: 8px; }
    .concept-formats { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
    .concept-formats span { background: #2a2a2a; color: #888; padding: 4px 10px; border-radius: 20px; font-size: 11px; }
    .concept-script { margin-top: 16px; padding: 16px; background: #1a1a1a; border-radius: 8px; font-family: 'Monaco', monospace; font-size: 12px; color: #aaa; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
    .concept-script-toggle { color: #EC8A23; font-size: 13px; cursor: pointer; margin-top: 12px; }

    /* Emotional Heatmap */
    .emotion-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
    .emotion-tag { background: #2a2a2a; padding: 8px 16px; border-radius: 20px; font-size: 14px; }
    .emotion-tag .count { color: #EC8A23; margin-left: 8px; font-weight: 600; }

    /* Urgent */
    .alert-box { background: #151515; border: 1px solid #2a2a2a; border-left: 4px solid #ef4444; padding: 24px; border-radius: 12px; margin: 24px 0; }
    .alert-box h3 { margin: 0 0 12px 0; font-size: 18px; color: #ef4444; }
    .alert-box ul { margin: 0; padding-left: 20px; color: #ccc; }
    .alert-box li { margin: 8px 0; }

    .footer { margin-top: 60px; padding: 40px 20px; border-top: 1px solid #222; text-align: center; color: #666; font-size: 13px; }
    .footer-logo { font-size: 14px; color: #EC8A23; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 12px; }
    .footer a { color: #EC8A23; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">The Bridge Service · Smashed Agency</div>
    <h1>Comment Intelligence Report</h1>
    <p class="subtitle">${brandName} — ${new Date(report.minedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
  </div>

  <div class="container">

  <div class="stat-grid">
    <div class="stat">
      <div class="stat-value">${report.totalComments}</div>
      <div class="stat-label">Comments Analyzed</div>
    </div>
    <div class="stat">
      <div class="stat-value">${report.categories.praise}</div>
      <div class="stat-label">Praise Comments</div>
    </div>
    <div class="stat">
      <div class="stat-value">${report.categories.objection + report.categories.question}</div>
      <div class="stat-label">Questions/Objections</div>
    </div>
    <div class="stat">
      <div class="stat-value">${report.creativeConcepts.length}</div>
      <div class="stat-label">Ad Concepts Ready</div>
    </div>
  </div>

  ${report.urgentInsights.length > 0 ? `
  <div class="alert-box">
    <h3>🚨 Urgent Actions Required</h3>
    <ul>
      ${report.urgentInsights.map(i => `<li>${i}</li>`).join('')}
    </ul>
  </div>
  ` : ''}

  ${(report.whatToCreateNext || []).length > 0 ? `
  <h2 class="section-title">What To Create Next</h2>
  <div class="create-next">
    <div class="create-next-header">Prioritized Creative Recommendations</div>
    ${(report.whatToCreateNext || []).slice(0, 5).map(w => `
      <div class="create-item">
        <div class="create-priority">${w.priority}</div>
        <div class="create-content">
          <div class="create-type">${w.conceptType.replace(/_/g, ' ')}</div>
          <div class="create-reason">${w.reason}</div>
          <div class="create-meta">
            <span>${w.dataPoints} data points</span>
            <span class="${w.estimatedROI}">ROI: ${w.estimatedROI}</span>
            ${w.deadline ? `<span class="${w.deadline === 'ASAP' ? 'asap' : ''}">${w.deadline}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <h2 class="section-title">Comment Patterns</h2>
  <div class="pattern-grid">
    ${topFrustrations.length > 0 ? `
    <div class="pattern-card danger">
      <h3>⚠️ Frustrations to Address</h3>
      ${topFrustrations.map(p => `
        <div class="pattern">
          <span class="pattern-phrase">"${p.pattern}"</span>
          <span class="pattern-count">${p.frequency}x</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${topQuestions.length > 0 ? `
    <div class="pattern-card warning">
      <h3>❓ Unanswered Questions</h3>
      ${topQuestions.map(p => `
        <div class="pattern">
          <span class="pattern-phrase">"${p.pattern}"</span>
          <span class="pattern-count">${p.frequency}x</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${topObjections.length > 0 ? `
    <div class="pattern-card warning">
      <h3>🤔 Objections to Handle</h3>
      ${topObjections.map(p => `
        <div class="pattern">
          <span class="pattern-phrase">"${p.pattern}"</span>
          <span class="pattern-count">${p.frequency}x</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${topPraise.length > 0 ? `
    <div class="pattern-card success">
      <h3>✨ Social Proof Gold</h3>
      ${topPraise.map(p => `
        <div class="pattern">
          <span class="pattern-phrase">"${p.pattern}"</span>
          <span class="pattern-count">${p.frequency}x</span>
        </div>
      `).join('')}
    </div>
    ` : ''}
  </div>

  ${topEmotions.length > 0 ? `
  <h2 class="section-title">Emotional Triggers Detected</h2>
  <div class="emotion-grid">
    ${topEmotions.map(([emotion, count]) => `
      <div class="emotion-tag">${emotion}<span class="count">${count}</span></div>
    `).join('')}
  </div>
  ` : ''}

  <h2 class="section-title">Ready-to-Use Ad Concepts</h2>
  ${report.creativeConcepts.slice(0, 8).map((c, i) => `
    <div class="concept">
      <div class="concept-header">
        <div class="concept-type">${c.type.replace(/_/g, ' ')}</div>
        <div class="concept-priority">Priority #${c.priority || (i + 1)}</div>
      </div>
      <div class="concept-hook">${c.hook}</div>
      ${c.primaryCopy ? `<div class="concept-copy">${c.primaryCopy}${c.secondaryCopy ? '<br><br>' + c.secondaryCopy : ''}</div>` : ''}
      <div class="concept-formats">
        ${(c.adFormats || ['static_image']).map(f => `<span>${f.replace(/_/g, ' ')}</span>`).join('')}
        <span>CTA: ${c.cta || 'Shop Now'}</span>
      </div>
      ${(typeof c.ugcScript === 'string' && c.ugcScript.length > 0) ? `
      <details>
        <summary class="concept-script-toggle">📹 View UGC Script</summary>
        <div class="concept-script">${c.ugcScript
          .replace(/\[HOOK/g, '\n[HOOK')
          .replace(/\[ADDRESS/g, '\n\n[ADDRESS')
          .replace(/\[STORY/g, '\n\n[STORY')
          .replace(/\[PROOF/g, '\n\n[PROOF')
          .replace(/\[CTA/g, '\n\n[CTA')
          .replace(/\[BUILD/g, '\n\n[BUILD')
          .replace(/\[REVEAL/g, '\n\n[REVEAL')
          .replace(/\[RELATE/g, '\n\n[RELATE')
          .replace(/\[RESOLVE/g, '\n\n[RESOLVE')
          .replace(/\[PAYOFF/g, '\n\n[PAYOFF')
          .trim()}</div>
      </details>
      ` : ''}
    </div>
  `).join('')}

  </div>

  <div class="footer">
    <div class="footer-logo">The Bridge Service</div>
    <p>Generated on ${new Date(report.minedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <p style="margin-top:8px"><a href="https://smashed.agency/scan">smashed.agency/scan</a> · Confidential Client Report</p>
  </div>
</body>
</html>
  `.trim();
}
