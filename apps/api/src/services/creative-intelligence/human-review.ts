// ============================================================================
// 6. HUMAN REVIEW LAYER
// ============================================================================

import { logger } from '../../utils/logger.js';
import type { HumanReviewRequest } from './types.js';

/**
 * Request human review
 */
export function requestHumanReview(
  clientId: string,
  creativeId: string,
  reviewType: HumanReviewRequest['reviewType'],
  reason: string,
  aiRecommendation: string,
  aiConfidence: number
): HumanReviewRequest {
  const request: HumanReviewRequest = {
    id: `review_${Date.now()}`,
    clientId,
    createdAt: new Date().toISOString(),
    reviewType,
    creativeId,
    reason,
    aiRecommendation,
    aiConfidence,
    status: 'pending',
  };

  logger.info({ clientId, reviewType, creativeId }, '[Creative] Human review requested');

  return request;
}
