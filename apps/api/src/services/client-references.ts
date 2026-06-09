/**
 * Client References — pattern + guidance lookup (stub).
 *
 * The validator and learning-engine both expect a per-client reference
 * library. The production version reads from `client_references` (table)
 * and synthesises `ExtractedPatterns` from competitor scans + winning-ad
 * history. Until that lands, these two helpers return safe null/empty
 * shapes so callers fall through to their existing "no patterns yet"
 * branches without crashing.
 */

import { logger } from '../utils/logger.js';
import type { ExtractedPatterns } from './pattern-extractor.js';

export function getClientPatterns(clientId: string): ExtractedPatterns | null {
  logger.debug({ clientId }, '[client-references] getClientPatterns stub — returning null');
  return null;
}

export interface GenerationGuidance {
  preferredTemplates: string[];
  avoidPatterns: string[];
  brandNotes: string;
}

export function getGenerationGuidance(clientId: string): GenerationGuidance {
  logger.debug({ clientId }, '[client-references] getGenerationGuidance stub — returning empty guidance');
  return {
    preferredTemplates: [],
    avoidPatterns: [],
    brandNotes: '',
  };
}
