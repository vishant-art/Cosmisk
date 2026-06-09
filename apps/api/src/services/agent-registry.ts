/**
 * Agent Registry - Central Memory Wrapper
 *
 * Instead of wiring 95+ agents manually, wrap any agent with memory:
 *
 * Usage:
 * ```typescript
 * const result = await wrapWithMemory(
 *   { agentName: 'health-score', clientId, agentType: 'watchdog' },
 *   () => runHealthScore(clientId, options)
 * );
 * ```
 *
 * This automatically:
 * - Loads strategic context before execution
 * - Records episode on completion/failure
 * - Records report summary
 * - Applies learned patterns to params
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { recordEpisode } from './agent-memory.js';
import { getStrategicContextForAgent, recordReport, type ReportRecord } from './strategic-memory.js';
import type { AgentType } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AgentRunOptions {
  agentName: string;
  clientId: string;
  agentType: AgentType;
  /** Skip report recording for lightweight runs */
  skipReport?: boolean;
  /** Custom headline for the report */
  headline?: string;
  /** Key insights to include in report */
  keyInsights?: string[];
  /** Recommendations to include in report */
  recommendations?: string[];
  /** Custom metrics to snapshot */
  metrics?: Record<string, number>;
}

export interface AgentRunResult<T> {
  result: T;
  context: string | null;
  duration: number;
  episodeId: string | null;
}

// ============================================================================
// MEMORY ACTIONS - Patterns that modify agent behavior
// ============================================================================

interface MemoryAction {
  pattern: string;
  action: (params: Record<string, any>) => void;
  description: string;
}

const MEMORY_ACTIONS: MemoryAction[] = [
  {
    pattern: 'OOS products correlate with wasted spend',
    action: (params) => { params['oosCheckWeight'] = (params['oosCheckWeight'] || 1.0) * 1.5; },
    description: 'Increase OOS check priority',
  },
  {
    pattern: 'Budget increases failed',
    action: (params) => { params['budgetConfidenceThreshold'] = Math.max(params['budgetConfidenceThreshold'] || 0.7, 0.9); },
    description: 'Be more conservative with budget recommendations',
  },
  {
    pattern: 'Frequency threshold too aggressive',
    action: (params) => { params['frequencyThreshold'] = Math.min((params['frequencyThreshold'] || 4.0) + 0.5, 5.5); },
    description: 'Relax frequency threshold',
  },
  {
    pattern: 'Creative fatigue detected early',
    action: (params) => { params['fatigueCheckDays'] = Math.max((params['fatigueCheckDays'] || 7) - 2, 3); },
    description: 'Check fatigue more frequently',
  },
  {
    pattern: 'Discount codes leaked repeatedly',
    action: (params) => { params['leakageCheckFrequency'] = 'daily'; },
    description: 'Increase leakage check frequency',
  },
  {
    pattern: 'LTV gap persists across channels',
    action: (params) => { params['ltvAlertThreshold'] = Math.max((params['ltvAlertThreshold'] || 20) - 5, 10); },
    description: 'Lower LTV gap alert threshold',
  },
];

/**
 * Apply learned patterns to agent parameters
 */
export function applyMemoryActions(context: string | null, params: Record<string, any>): string[] {
  const appliedActions: string[] = [];

  if (!context) return appliedActions;

  for (const { pattern, action, description } of MEMORY_ACTIONS) {
    if (context.toLowerCase().includes(pattern.toLowerCase())) {
      action(params);
      appliedActions.push(description);
    }
  }

  if (appliedActions.length > 0) {
    logger.info({ appliedActions }, '[AgentRegistry] Applied memory actions');
  }

  return appliedActions;
}

// ============================================================================
// CORE WRAPPER
// ============================================================================

/**
 * Wrap any agent function with strategic memory
 *
 * @param options - Agent configuration
 * @param fn - The agent function to execute
 * @returns The agent result with memory metadata
 */
export async function wrapWithMemory<T>(
  options: AgentRunOptions,
  fn: () => Promise<T>
): Promise<AgentRunResult<T>> {
  const { agentName, clientId, agentType, skipReport = false } = options;
  const startTime = Date.now();
  let episodeId: string | null = null;

  // Load strategic context
  const context = await getStrategicContextForAgent(clientId);
  if (context) {
    logger.info({ agentName, clientId, contextLength: context.length }, '[AgentRegistry] Loaded strategic context');
  }

  try {
    // Execute the agent
    const result = await fn();
    const duration = Date.now() - startTime;

    // Record success episode (fire-and-forget)
    recordEpisode(
      'system',
      agentType,
      `${agentName} completed for client ${clientId}`,
      JSON.stringify({
        duration,
        resultType: typeof result,
        hasResult: result !== null && result !== undefined,
      }),
      'success'
    ).then(id => { episodeId = id; })
      .catch(err => logger.warn({ err, agentName }, '[AgentRegistry] Episode recording failed'));

    // Record report if not skipped
    if (!skipReport) {
      recordAgentReport(options, duration, 'success');
    }

    logger.info({ agentName, clientId, duration }, '[AgentRegistry] Agent completed');

    return {
      result,
      context,
      duration,
      episodeId,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record failure episode
    recordEpisode(
      'system',
      agentType,
      `${agentName} FAILED for client ${clientId}: ${errorMessage}`,
      JSON.stringify({ duration, error: errorMessage }),
      'failed'
    ).catch(() => { /* ignore */ });

    // Record failure report
    if (!skipReport) {
      recordAgentReport(options, duration, 'failed', errorMessage);
    }

    logger.error({ agentName, clientId, duration, error: errorMessage }, '[AgentRegistry] Agent failed');

    throw error;
  }
}

/**
 * Record a report for the agent run
 */
function recordAgentReport(
  options: AgentRunOptions,
  duration: number,
  status: 'success' | 'failed',
  errorMessage?: string
): void {
  const { agentName, clientId, headline, keyInsights, recommendations, metrics } = options;

  try {
    const now = new Date();
    const weekNumber = Math.ceil(
      (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)
    );

    const reportRecord: ReportRecord = {
      id: uuidv4(),
      clientId,
      reportType: agentName,
      generatedAt: now.toISOString(),
      weekNumber,
      year: now.getFullYear(),
      headline: headline || `${agentName} ${status === 'success' ? 'completed' : 'failed'}`,
      keyInsights: keyInsights || (errorMessage ? [`Error: ${errorMessage}`] : []),
      recommendations: recommendations || [],
      metricsSnapshot: { duration, ...metrics },
      qualityScore: status === 'success' ? 70 : 0,
      wasShipped: false,
      shipDecision: 'HOLD',
      deliveredVia: [],
    };

    // Fire-and-forget telemetry: recordReport is now async (DB adapter); this
    // helper stays sync void, so surface write failures via .catch rather than await.
    void recordReport(reportRecord).catch((err) => {
      logger.warn({ err, agentName }, '[AgentRegistry] Report recording failed');
    });
  } catch (err) {
    logger.warn({ err, agentName }, '[AgentRegistry] Report recording failed');
  }
}

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Quick wrapper for simple agents that don't need custom reporting
 */
export async function runWithMemory<T>(
  agentName: string,
  clientId: string,
  agentType: AgentType,
  fn: () => Promise<T>
): Promise<T> {
  const { result } = await wrapWithMemory({ agentName, clientId, agentType }, fn);
  return result;
}

/**
 * Wrapper that also applies memory actions to params
 */
export async function runWithMemoryAndActions<T>(
  agentName: string,
  clientId: string,
  agentType: AgentType,
  params: Record<string, any>,
  fn: (adjustedParams: Record<string, any>) => Promise<T>
): Promise<T> {
  // Load context and apply actions
  const context = await getStrategicContextForAgent(clientId);
  const appliedActions = applyMemoryActions(context, params);

  const { result } = await wrapWithMemory(
    {
      agentName,
      clientId,
      agentType,
      keyInsights: appliedActions.length > 0
        ? [`Applied ${appliedActions.length} memory actions: ${appliedActions.join(', ')}`]
        : undefined,
    },
    () => fn(params)
  );

  return result;
}

// ============================================================================
// AGENT CATALOG - Track which agents are registered
// ============================================================================

interface RegisteredAgent {
  name: string;
  agentType: AgentType;
  description: string;
  file: string;
}

const REGISTERED_AGENTS: RegisteredAgent[] = [
  // Core agents (already wired directly)
  { name: 'ad-watchdog', agentType: 'watchdog', description: 'Main watchdog agent', file: 'ad-watchdog.ts' },
  { name: 'comment-mining-agent', agentType: 'content', description: 'Comment analysis', file: 'comment-mining-agent.ts' },
  { name: 'strategic-intelligence-engine', agentType: 'report', description: 'Weekly intelligence', file: 'strategic-intelligence-engine.ts' },
  { name: 'fatigue-detector', agentType: 'watchdog', description: 'Creative fatigue detection', file: 'fatigue-detector.ts' },
  { name: 'oos-detector', agentType: 'inventory', description: 'Out-of-stock detection', file: 'oos-detector.ts' },
  { name: 'discount-leakage-detector', agentType: 'sales', description: 'Discount code leakage', file: 'discount-leakage-detector.ts' },
  { name: 'organic-paid-intelligence', agentType: 'content', description: 'Organic to paid conversion', file: 'organic-paid-intelligence.ts' },
  { name: 'cohort-ltv-analyzer', agentType: 'audience', description: 'LTV by acquisition source', file: 'cohort-ltv-analyzer.ts' },
  { name: 'creative-scorer', agentType: 'creative_strategist', description: 'Creative scoring', file: 'creative-scorer.ts' },

  // Agents to wire via registry
  { name: 'health-score', agentType: 'watchdog', description: 'Account health scoring', file: 'health-score.ts' },
  { name: 'quick-wins', agentType: 'watchdog', description: 'Quick win recommendations', file: 'quick-wins.ts' },
  { name: 'brand-persona-intelligence', agentType: 'content', description: 'Brand persona analysis', file: 'brand-persona-intelligence.ts' },
  { name: 'creative-analyzer', agentType: 'creative_strategist', description: 'Creative analysis', file: 'creative-analyzer.ts' },
  { name: 'agent-chains', agentType: 'report', description: 'Multi-agent orchestration', file: 'agent-chains.ts' },
];

/**
 * Get list of all registered agents
 */
export function getRegisteredAgents(): RegisteredAgent[] {
  return [...REGISTERED_AGENTS];
}

/**
 * Check if an agent is registered
 */
export function isAgentRegistered(agentName: string): boolean {
  return REGISTERED_AGENTS.some(a => a.name === agentName);
}
