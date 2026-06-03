/**
 * Agent Brain — central decision-recording surface for the unified agent
 * runner (stub).
 *
 * `unified-agent-runner.ts` instantiates a brain once per run and calls
 * `brain.createDecision(...)` for every auto-executable action it discovers.
 * The production brain persists to `agent_decisions`, performs
 * deduplication, and dispatches Meta API mutations.
 *
 * Stub behaviour: log + drop. Returning a synthetic id keeps any downstream
 * `decision.id` reads happy.
 */

import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export type AgentBrainKind = 'watchdog' | 'autopilot' | 'creative' | 'reporter';

export interface DecisionInput {
  runId: string;
  action: string;
  target: { type: string; id: string; name: string; percentage?: number };
  reason: string;
  confidence: number;
  expectedImpact: string;
  autoExecute: boolean;
}

export interface AgentBrain {
  userId: string;
  accountId: string;
  kind: AgentBrainKind;
  createDecision: (input: DecisionInput) => { id: string };
}

export function getAgentBrain(
  userId: string,
  accountId: string,
  kind: AgentBrainKind,
): AgentBrain {
  return {
    userId,
    accountId,
    kind,
    createDecision(input: DecisionInput) {
      const id = uuidv4();
      logger.debug(
        { userId, accountId, kind, decisionId: id, action: input.action, target: input.target.id },
        '[agent-brain] createDecision stub — logged, not persisted',
      );
      return { id };
    },
  };
}
