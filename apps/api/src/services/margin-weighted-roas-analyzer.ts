/**
 * Margin-Weighted ROAS Analyzer (stub).
 *
 * Production version computes true profitability by adjusting reported
 * ROAS with product-level margins. unified-agent-runner reads
 *   .hiddenLosses, .accountStandardROAS, .accountMarginWeightedROAS.
 *
 * NOTE on the JS/TS extension drift: the import in unified-agent-runner.ts
 * is `from './margin-weighted-roas-analyzer.js'` which, under ESM-TS in
 * this repo (rootDir=src, module=ESNext, moduleResolution=bundler), maps to
 * a SOURCE file with `.ts` extension that emits `.js`. So this file is
 * `.ts` even though the import string ends in `.js`. That is the
 * canonical pattern across the codebase — no source-side `.js` file is
 * required or desired.
 */

import { logger } from '../utils/logger.js';

export interface MarginWeightedAnalysis {
  accountStandardROAS: number;
  accountMarginWeightedROAS: number;
  hiddenLosses: number;
}

export async function analyzeMarginWeightedROAS(userId: string): Promise<MarginWeightedAnalysis | null> {
  logger.debug({ userId }, '[margin-weighted-roas-analyzer] stub — returning null');
  return null;
}
