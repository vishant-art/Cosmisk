/**
 * Comment Mining Agent — Cosmisk
 *
 * Extracts ad concepts from customer comments, reviews, and feedback.
 * Turns customer language into hooks, objection-handlers, and social proof.
 *
 * Sources: Meta ad comments, Instagram post comments, Shopify reviews
 */

import { getDb } from '../db/index.js';
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

export interface CreativeConceptFromComments {
  id: string;
  type: 'objection_handler' | 'social_proof' | 'aspiration' | 'differentiation' | 'scenario';
  hook: string;
  hookSource: 'exact_quote' | 'derived' | 'synthesized';
  sourceComments: string[]; // IDs of comments that inspired this
  visualDirection: string;
  copyPoints: string[];
  targetEmotion: string;
  confidence: number;
  estimatedImpact: string;
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
// CREATIVE CONCEPT GENERATION
// ============================================================================

/**
 * Generate creative concepts from comment patterns
 */
export async function generateCreativeConcepts(
  patterns: CommentPattern[],
  language: CustomerLanguage,
  brandContext: { name: string; category: string }
): Promise<CreativeConceptFromComments[]> {

  const concepts: CreativeConceptFromComments[] = [];

  // 1. Social proof concepts from top praise patterns
  const topPraise = patterns
    .filter(p => p.category === 'praise' && p.frequency >= 3)
    .slice(0, 3);

  for (const praise of topPraise) {
    concepts.push({
      id: uuidv4(),
      type: 'social_proof',
      hook: `"${praise.pattern}" — what ${praise.frequency}+ customers are saying`,
      hookSource: 'exact_quote',
      sourceComments: praise.exampleComments.slice(0, 3),
      visualDirection: 'Customer photos/screenshots with quote overlay',
      copyPoints: [
        `Real customer quote: "${praise.pattern}"`,
        'Show variety of customers',
        'Include product in lifestyle context'
      ],
      targetEmotion: 'trust',
      confidence: Math.min(95, 60 + praise.frequency * 5),
      estimatedImpact: praise.frequency >= 5 ? 'High — proven resonance' : 'Medium — emerging pattern'
    });
  }

  // 2. Objection-handling concepts
  const topObjections = patterns
    .filter(p => p.category === 'objection' && p.frequency >= 2)
    .slice(0, 3);

  for (const objection of topObjections) {
    concepts.push({
      id: uuidv4(),
      type: 'objection_handler',
      hook: generateObjectionHook(objection.pattern),
      hookSource: 'derived',
      sourceComments: objection.exampleComments.slice(0, 3),
      visualDirection: 'Before/after or side-by-side comparison',
      copyPoints: [
        `Address the concern: "${objection.pattern}"`,
        'Provide concrete answer/proof',
        'End with satisfied customer example'
      ],
      targetEmotion: 'reassurance',
      confidence: Math.min(90, 55 + objection.frequency * 5),
      estimatedImpact: `${objection.frequency} customers asked this — worth addressing`
    });
  }

  // 3. Scenario/use-case concepts
  const topUseCases = patterns
    .filter(p => p.category === 'use_case')
    .slice(0, 2);

  for (const useCase of topUseCases) {
    const occasion = language.useCases.find(u => u.phrase === useCase.pattern)?.occasion;
    concepts.push({
      id: uuidv4(),
      type: 'scenario',
      hook: `Perfect for ${occasion || 'every occasion'}`,
      hookSource: 'synthesized',
      sourceComments: useCase.exampleComments.slice(0, 3),
      visualDirection: `Real customer wearing to ${occasion || 'real life scenario'}`,
      copyPoints: [
        `Show product in ${occasion} context`,
        'Feature real customer story',
        'Highlight versatility'
      ],
      targetEmotion: 'aspiration',
      confidence: 65,
      estimatedImpact: 'Expands perceived use cases'
    });
  }

  // 4. Synthesized hook from top emotional descriptors
  if (language.emotionalDescriptors.length >= 3) {
    const topPhrases = language.emotionalDescriptors.slice(0, 3);
    const combinedHook = topPhrases.map(p => p.phrase).join(', ');

    concepts.push({
      id: uuidv4(),
      type: 'social_proof',
      hook: combinedHook,
      hookSource: 'synthesized',
      sourceComments: [],
      visualDirection: 'Compilation of customer reactions',
      copyPoints: [
        `Uses top 3 customer phrases: ${combinedHook}`,
        'Each phrase mentioned ${topPhrases[0].count}+ times',
        'Authentic customer language'
      ],
      targetEmotion: 'trust',
      confidence: 80,
      estimatedImpact: 'High — combines proven phrases'
    });
  }

  return concepts;
}

function generateObjectionHook(objection: string): string {
  const lower = objection.toLowerCase();

  if (lower.includes('price') || lower.includes('expensive') || lower.includes('worth')) {
    return `Is it worth ₹X? Here's the honest answer...`;
  }
  if (lower.includes('fit') || lower.includes('size')) {
    return `"Will it fit me?" Let's talk sizing...`;
  }
  if (lower.includes('quality') || lower.includes('authentic') || lower.includes('real')) {
    return `Is this the real deal? Let me show you...`;
  }
  if (lower.includes('return') || lower.includes('exchange')) {
    return `What if you don't love it? Here's our promise...`;
  }
  if (lower.includes('shipping') || lower.includes('delivery')) {
    return `When will it arrive? Let's be transparent...`;
  }

  return `"${objection}" — here's the truth...`;
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
  const db = getDb();
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

  // Generate creative concepts
  const creatives = await generateCreativeConcepts(
    patterns,
    language,
    {
      name: options.brandName || 'Brand',
      category: options.brandCategory || 'fashion'
    }
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
    urgentInsights
  };

  // Persist report
  try {
    db.prepare(`
      INSERT INTO comment_mining_reports (id, client_id, report, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(uuidv4(), clientId, JSON.stringify(report));
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
export function getLatestReport(clientId: string): CommentMiningReport | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT report FROM comment_mining_reports
    WHERE client_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(clientId) as { report: string } | undefined;

  if (!row) return null;
  return JSON.parse(row.report);
}

/**
 * Generate HTML report for client delivery
 */
export function generateHTMLReport(report: CommentMiningReport, brandName: string): string {
  const topPraise = report.topPatterns.filter(p => p.category === 'praise').slice(0, 5);
  const topObjections = report.topPatterns.filter(p => p.category === 'objection').slice(0, 5);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Comment Intelligence Report — ${brandName}</title>
  <style>
    body { font-family: 'Inter', -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 20px; margin-top: 40px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .subtitle { color: #666; margin-bottom: 30px; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat { background: #f5f5f5; padding: 20px; border-radius: 8px; }
    .stat-value { font-size: 32px; font-weight: 700; }
    .stat-label { color: #666; font-size: 13px; margin-top: 4px; }
    .pattern { background: #fff; border: 1px solid #e0e0e0; padding: 16px; margin: 12px 0; border-radius: 8px; }
    .pattern-phrase { font-size: 18px; font-weight: 600; }
    .pattern-meta { color: #666; font-size: 13px; margin-top: 4px; }
    .concept { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; margin: 16px 0; border-radius: 12px; }
    .concept h3 { margin: 0 0 12px 0; font-size: 18px; }
    .concept-hook { font-size: 24px; font-weight: 700; margin: 8px 0; }
    .concept-details { opacity: 0.9; font-size: 14px; margin-top: 12px; }
    .urgent { background: #fee2e2; border-left: 4px solid #ef4444; padding: 16px; margin: 12px 0; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Comment Intelligence Report</h1>
  <p class="subtitle">${brandName} — Generated ${new Date(report.minedAt).toLocaleDateString()}</p>

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
      <div class="stat-value">${report.categories.objection}</div>
      <div class="stat-label">Objections</div>
    </div>
    <div class="stat">
      <div class="stat-value">${report.creativeConcepts.length}</div>
      <div class="stat-label">Ad Concepts Ready</div>
    </div>
  </div>

  ${report.urgentInsights.length > 0 ? `
  <h2>Urgent Insights</h2>
  ${report.urgentInsights.map(i => `<div class="urgent">${i}</div>`).join('')}
  ` : ''}

  <h2>Top Customer Praise (Use as Social Proof)</h2>
  ${topPraise.map(p => `
    <div class="pattern">
      <div class="pattern-phrase">"${p.pattern}"</div>
      <div class="pattern-meta">Mentioned ${p.frequency} times</div>
    </div>
  `).join('')}

  <h2>Top Objections (Create Handling Ads)</h2>
  ${topObjections.map(p => `
    <div class="pattern">
      <div class="pattern-phrase">"${p.pattern}"</div>
      <div class="pattern-meta">${p.frequency} customers asked this</div>
    </div>
  `).join('')}

  <h2>Ready-to-Use Ad Concepts</h2>
  ${report.creativeConcepts.slice(0, 5).map(c => `
    <div class="concept">
      <h3>${c.type.replace('_', ' ').toUpperCase()}</h3>
      <div class="concept-hook">${c.hook}</div>
      <div class="concept-details">
        ${c.copyPoints.join(' • ')}<br>
        Confidence: ${c.confidence}% | ${c.estimatedImpact}
      </div>
    </div>
  `).join('')}

  <div class="footer">
    Generated by Smashed Agency Intelligence Platform<br>
    Contact: team@smashed.agency
  </div>
</body>
</html>
  `.trim();
}
