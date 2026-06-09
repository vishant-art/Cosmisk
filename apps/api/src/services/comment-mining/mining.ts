/**
 * Comment Mining Agent — main orchestration entry point.
 */

import { getDbAdapter } from '../../db/adapter.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import {
  collectMetaAdComments,
  collectInstagramComments,
  collectShopifyReviews,
} from './collection.js';
import { classifyComments } from './classification.js';
import { extractPatterns } from './patterns.js';
import { generateCreativeConcepts } from './concepts.js';
import { generateWhatToCreateNext } from './recommendations.js';
import type {
  CommentCategory,
  CommentMiningReport,
  RawComment,
} from './types.js';

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
