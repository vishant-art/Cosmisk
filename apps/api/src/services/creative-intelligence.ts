/**
 * Creative Intelligence System — Cosmisk
 *
 * A continuously learning creative intelligence system capable of producing
 * premium, differentiated, strategically sophisticated, high-converting,
 * non-generic operator-grade creatives.
 *
 * NOT automated creative production.
 * ACTUAL GOAL: Autonomous creative evolution with taste.
 *
 * Core Principles:
 * - Never generate generic creatives
 * - Never output cheap-looking templates
 * - Never create AI-looking ad structures
 * - Creative quality is visible proof of intelligence quality
 * - Optimize for sophistication, not quantity
 *
 * ---
 * This file is a thin barrel that re-exports the public surface of the
 * creative-intelligence modules. Implementation lives in ./creative-intelligence/*.
 */

import { logger } from '../utils/logger.js';

// 1. Creative quality philosophy
export { AUTO_REJECTION_CONDITIONS } from './creative-intelligence/rejection-conditions.js';

// Shared types & interfaces
export type {
  RejectionCondition,
  CreativeQualityCheck,
  CreativeReasoningContext,
  CrossAgentCreativeContext,
  QualityValidation,
  EvolutionDimension,
  CreativeEvolution,
  CategoryKnowledge,
  HumanReviewRequest,
} from './creative-intelligence/types.js';

// 2. Creative reasoning engine
export { buildCreativeContext } from './creative-intelligence/reasoning.js';

// 3. Creative quality validation
export { validateCreativeQuality } from './creative-intelligence/quality-validation.js';

// 4. Creative evolution system
export { recordEvolution, getEvolutionHistory } from './creative-intelligence/evolution.js';

// 5. Category-specific intelligence
export { getCategoryKnowledge } from './creative-intelligence/category-knowledge.js';

// 6. Human review layer
export { requestHumanReview } from './creative-intelligence/human-review.js';

// ============================================================================
// Logging
// ============================================================================

logger.info('[CreativeIntelligence] Systems loaded — Quality, Reasoning, Evolution, Category Knowledge');
