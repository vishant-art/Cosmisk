/**
 * Self-Improving Cognition System — Factory Functions
 */

import { SelfImprovingCognitionEngine } from './engine.js';

// ============================================================================
// Factory Functions
// ============================================================================

export function createSelfImprovingCognitionEngine(
  clientId: string,
): SelfImprovingCognitionEngine {
  return new SelfImprovingCognitionEngine(clientId);
}
