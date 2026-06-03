/**
 * Strategic Intelligence Engine — "What Should We Create Next?" v2
 *
 * NOT a recommendation engine.
 * A strategic interpretation system that synthesizes:
 * - WHY audience behavior is changing
 * - WHAT underlying systems are shifting
 * - WHAT strategic direction should happen next
 *
 * Evolves from: OBSERVATION → INTERPRETATION → STRATEGIC DIRECTION
 *
 * NOTE: This file is now a thin barrel. The implementation lives in the
 * ./strategic-intelligence-engine/ sub-directory. Public surface is unchanged.
 */

import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// Re-export public types
export type {
  AudienceState,
  StrategicRisk,
  StrategicOpportunity,
  AudiencePsychologyReport,
  CategoryIntelligence,
  StrategicIntelligenceOutput
} from './strategic-intelligence-engine/types.js';

// Re-export public functions
export { analyzeAudiencePsychology } from './strategic-intelligence-engine/audience-psychology.js';
export { detectStrategicRisks } from './strategic-intelligence-engine/risk-detection.js';
export { detectStrategicOpportunities } from './strategic-intelligence-engine/opportunity-detection.js';
export { generateStrategicIntelligence } from './strategic-intelligence-engine/generate.js';
export { generateStrategicIntelligenceHTML } from './strategic-intelligence-engine/html-report.js';
