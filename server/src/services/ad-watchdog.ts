/**
 * Ad Watchdog — Cosmisk
 *
 * Elite performance-intelligence agent that monitors Meta Ads accounts,
 * reasons about performance via the LLM gateway, integrates OOS / discount
 * leakage / cohort-LTV / comment-mining / strategic-intelligence checks,
 * gates output quality, and surfaces strategic recommendations.
 *
 * ----------------------------------------------------------------------------
 * BARREL: This file was decomposed into focused modules under ./ad-watchdog/.
 * It re-exports the exact original public surface so importers are unaffected.
 * ----------------------------------------------------------------------------
 */

// Public type
export type { ClientWatchdogReport } from './ad-watchdog/types.js';

// Creative analysis
export { gatherCreativeAnalysis } from './ad-watchdog/creative-analysis.js';

// Decision execution + outcome checks
export { executeDecision, checkOutcomes } from './ad-watchdog/execution.js';

// Main run loop
export { runWatchdog } from './ad-watchdog/run-watchdog.js';

// Client-aware watchdog + HTML report
export { runWatchdogForClient, generateWatchdogHTMLReport } from './ad-watchdog/client-watchdog.js';
