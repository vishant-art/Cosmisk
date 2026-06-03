/**
 * Comment Mining Agent — Cosmisk
 *
 * Extracts ad concepts from customer comments, reviews, and feedback.
 * Turns customer language into hooks, objection-handlers, and social proof.
 *
 * Sources: Meta ad comments, Instagram post comments, Shopify reviews
 *
 * NOTE: This file is a thin barrel. The implementation has been decomposed into
 * focused modules under ./comment-mining/. It re-exports the original public
 * surface unchanged so existing importers keep working.
 */

// Shared module-level state (Anthropic singleton constructed once at load,
// exactly as before — kept in one module, imported here for its load-time
// side effect). Not re-exported: it was module-local in the original file.
import './comment-mining/state.js';

// Types
export type {
  RawComment,
  ClassifiedComment,
  CommentCategory,
  CommentPattern,
  CustomerLanguage,
  ConceptType,
  AdFormat,
  CreativeConceptFromComments,
  WhatToCreateNext,
  CommentMiningReport,
} from './comment-mining/types.js';

// Comment collection
export {
  collectMetaAdComments,
  collectInstagramComments,
  collectShopifyReviews,
} from './comment-mining/collection.js';

// Classification
export { classifyComments } from './comment-mining/classification.js';

// Pattern extraction
export { extractPatterns } from './comment-mining/patterns.js';

// Creative concept generation
export { generateCreativeConcepts } from './comment-mining/concepts.js';

// Report retrieval & HTML rendering
export { getLatestReport, generateHTMLReport } from './comment-mining/report.js';

// Main entry point
export { runCommentMining } from './comment-mining/mining.js';
