/**
 * Learning Engine — TIER 2: Human Review Escalation
 */

import { getDbAdapter } from '../../db/adapter.js';
import { logger } from '../../utils/logger.js';
import type { HumanReviewItem } from './types.js';

/**
 * Create a human review item
 */
export async function createHumanReviewItem(
  item: Omit<HumanReviewItem, 'id' | 'createdAt' | 'status'>,
): Promise<HumanReviewItem> {
  const db = getDbAdapter();
  const id = `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const reviewItem: HumanReviewItem = {
    ...item,
    id,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  try {
    await db.run(`
      INSERT INTO human_reviews (id, client_id, type, title, description, severity,
        related_entity_id, related_entity_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `, [
      id, item.clientId, item.type, item.title, item.description, item.severity,
      item.relatedEntityId || null, item.relatedEntityType || null
    ]);
  } catch (err) {
    logger.debug({ err }, '[LearningEngine] human_reviews table not found');
  }

  logger.info({
    reviewId: id,
    type: item.type,
    severity: item.severity,
  }, '[LearningEngine] Human review item created');

  return reviewItem;
}

/**
 * Get pending human review items for a client
 */
export async function getPendingReviews(clientId: string): Promise<HumanReviewItem[]> {
  const db = getDbAdapter();

  try {
    return await db.all(`
      SELECT
        id, client_id as clientId, type, title, description, severity,
        related_entity_id as relatedEntityId, related_entity_type as relatedEntityType,
        created_at as createdAt, status
      FROM human_reviews
      WHERE client_id = ? AND status = 'pending'
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        created_at DESC
    `, [clientId]) as HumanReviewItem[];
  } catch {
    return [];
  }
}

/**
 * Resolve a human review item
 */
export async function resolveReview(
  reviewId: string,
  resolution: string,
  reviewedBy?: string,
): Promise<void> {
  const db = getDbAdapter();

  try {
    await db.run(`
      UPDATE human_reviews
      SET status = 'reviewed', resolution = ?, reviewed_by = ?, reviewed_at = datetime('now')
      WHERE id = ?
    `, [resolution, reviewedBy || 'system', reviewId]);

    logger.info({ reviewId, resolution }, '[LearningEngine] Review resolved');
  } catch {
    logger.debug('[LearningEngine] Could not resolve review');
  }
}

/**
 * Get critical reviews that need immediate attention
 */
export async function getCriticalReviews(clientId: string): Promise<HumanReviewItem[]> {
  return (await getPendingReviews(clientId)).filter(r =>
    r.severity === 'critical' || r.severity === 'high'
  );
}

/**
 * Auto-create review items from quality gate results
 */
export async function createReviewsFromQualityGate(
  clientId: string,
  requiresHumanReview: Array<{ targetName?: string; reasoning?: string; type?: string }>,
): Promise<HumanReviewItem[]> {
  const items: HumanReviewItem[] = [];

  for (const item of requiresHumanReview.slice(0, 5)) { // Limit to 5
    const reviewItem = await createHumanReviewItem({
      clientId,
      type: 'low_confidence_decision',
      title: `Review needed: ${item.type || 'Decision'} for "${item.targetName || 'Unknown'}"`,
      description: item.reasoning || 'Low confidence decision requires manual review',
      severity: 'medium',
      relatedEntityId: item.targetName,
      relatedEntityType: item.type,
    });
    items.push(reviewItem);
  }

  return items;
}
