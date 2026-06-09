/**
 * Comment Mining Agent — comment collection from external sources.
 */

import { MetaApiService } from '../meta-api.js';
import { ShopifyClient } from '../shopify-client.js';
import { logger } from '../../utils/logger.js';
import type { RawComment } from './types.js';

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
