/**
 * Intelligence Integration — connective tissue between the Watchdog /
 * Report agents and the (future) strategic-intelligence core.
 *
 * The real version translates raw account snapshots into structured
 * "signals", asks the strategic-cognition cluster for context, and rewrites
 * the agent's prompt + output to remove generic insights. Until the cluster
 * is wired up, the helpers here are graceful no-ops:
 *   - converters return empty arrays
 *   - prompt builder returns an empty string (Watchdog still works)
 *   - enhancer echoes its input back unchanged
 * Callers already wrap these in try/catch and log on failure (see
 * ad-watchdog.ts:264 + report-agent.ts:233), so the no-op path is the
 * least-surprising fallback.
 */

import { logger } from '../utils/logger.js';

// ============================================================================
// Signal types
// ============================================================================

export interface Signal {
  source: string;
  kind: string;
  value: number | string;
  context?: Record<string, unknown>;
}

// ============================================================================
// Watchdog ↔ Intelligence
// ============================================================================

export function watchdogSnapshotToSignals(snapshot: unknown): Signal[] {
  logger.debug('[intelligence-integration] watchdogSnapshotToSignals stub');
  void snapshot;
  return [];
}

export async function buildStrategicPromptSection(
  clientId: string,
  signals: Signal[],
): Promise<string> {
  logger.debug(
    { clientId, signalCount: signals.length },
    '[intelligence-integration] buildStrategicPromptSection stub — empty section',
  );
  return '';
}

export interface WatchdogDecisionLike {
  type: string;
  targetId: string;
  targetName: string;
  reasoning: string;
  confidence: 'high' | 'moderate' | 'low';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  suggestedAction: string;
  estimatedImpact: string;
}

export async function enhanceWatchdogDecisions<T extends WatchdogDecisionLike>(
  decisions: T[],
  clientId: string,
  signals: Signal[],
): Promise<T[]> {
  logger.debug(
    { clientId, count: decisions.length, signalCount: signals.length },
    '[intelligence-integration] enhanceWatchdogDecisions stub — passthrough',
  );
  return decisions;
}

// ============================================================================
// Report ↔ Intelligence
// ============================================================================

export function reportDataToSignals(reportData: unknown): Signal[] {
  logger.debug('[intelligence-integration] reportDataToSignals stub');
  void reportData;
  return [];
}

export interface EnhancedReportOutput {
  strategicAnalysis: string;
  keyInsights: string[];
  recommendations: string[];
  qualityCheck: {
    genericInsightsFiltered: number;
  };
}

export async function enhanceReportOutput(
  input: { strategicAnalysis: string; keyInsights: string[]; recommendations: string[] },
  clientId: string,
  signals: Signal[],
): Promise<EnhancedReportOutput> {
  logger.debug(
    { clientId, signalCount: signals.length },
    '[intelligence-integration] enhanceReportOutput stub — passthrough',
  );
  return {
    strategicAnalysis: input.strategicAnalysis,
    keyInsights: input.keyInsights,
    recommendations: input.recommendations,
    qualityCheck: { genericInsightsFiltered: 0 },
  };
}

export function isStrategicEnough(text: string): boolean {
  logger.debug({ length: text.length }, '[intelligence-integration] isStrategicEnough stub');
  return true;
}
