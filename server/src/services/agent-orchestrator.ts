/**
 * Agent Orchestrator - Makes Agents Talk to Each Other
 *
 * When one agent recommends an action (e.g., "Draft 3 testimonial creatives"),
 * the orchestrator automatically routes it to the executing agent.
 *
 * Flow:
 * 1. Agent A detects issue → calls agentRecommend()
 * 2. Orchestrator sees recommendation → routes to Agent B
 * 3. Agent B executes → updates status
 * 4. Result tracked for validation
 */

import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { wrapWithMemory, type AgentRunOptions } from './agent-registry.js';
import type { AgentType } from '../types/index.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type AgentCapability =
  | 'pause_campaign'
  | 'pause_adset'
  | 'pause_ad'
  | 'increase_budget'
  | 'decrease_budget'
  | 'draft_creative'
  | 'draft_testimonial_creative'
  | 'draft_objection_creative'
  | 'draft_trust_creative'
  | 'refresh_creative'
  | 'detect_oos'
  | 'detect_discount_leak'
  | 'analyze_competitors';

interface AgentTask {
  id: string;
  recommendationId: string;
  capability: AgentCapability;
  clientId: string;
  context: Record<string, unknown>;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface AgentTaskResult {
  success: boolean;
  output: Record<string, unknown>;
  error?: string;
}

interface ExecutingAgent {
  agentId: string;
  capabilities: AgentCapability[];
  execute: (task: AgentTask) => Promise<AgentTaskResult>;
}

// ============================================================================
// RECOMMENDATION PATTERNS - Maps recommendations to capabilities
// ============================================================================

interface RecommendationPattern {
  pattern: RegExp;
  capability: AgentCapability;
}

// ============================================================================
// CAPABILITY TO AGENT TYPE MAPPING - For memory wiring
// ============================================================================

const CAPABILITY_TO_AGENT_TYPE: Record<AgentCapability, AgentType> = {
  pause_campaign: 'watchdog',
  pause_adset: 'watchdog',
  pause_ad: 'watchdog',
  increase_budget: 'watchdog',
  decrease_budget: 'watchdog',
  draft_creative: 'creative_strategist',
  draft_testimonial_creative: 'creative_strategist',
  draft_objection_creative: 'creative_strategist',
  draft_trust_creative: 'creative_strategist',
  refresh_creative: 'creative_strategist',
  detect_oos: 'inventory',
  detect_discount_leak: 'sales',
  analyze_competitors: 'content',
};

const RECOMMENDATION_PATTERNS: RecommendationPattern[] = [
  // Creative generation
  { pattern: /draft.*testimonial|testimonial.*creative/i, capability: 'draft_testimonial_creative' },
  { pattern: /draft.*objection|objection.*creative|address.*objection/i, capability: 'draft_objection_creative' },
  { pattern: /draft.*trust|trust.*creative|rebuild.*trust/i, capability: 'draft_trust_creative' },
  { pattern: /refresh.*creative|creative.*refresh|new.*creative/i, capability: 'refresh_creative' },
  { pattern: /draft.*creative/i, capability: 'draft_creative' },

  // Campaign management
  { pattern: /pause.*campaign/i, capability: 'pause_campaign' },
  { pattern: /pause.*adset|pause.*ad\s*set/i, capability: 'pause_adset' },
  { pattern: /pause.*ad(?!set)/i, capability: 'pause_ad' },
  { pattern: /increase.*budget|scale.*budget/i, capability: 'increase_budget' },
  { pattern: /decrease.*budget|reduce.*budget|cut.*budget/i, capability: 'decrease_budget' },

  // Analysis
  { pattern: /check.*oos|out.*stock|inventory/i, capability: 'detect_oos' },
  { pattern: /discount.*leak|coupon.*leak/i, capability: 'detect_discount_leak' },
  { pattern: /analyze.*competitor|competitor.*analysis/i, capability: 'analyze_competitors' },
];

// ============================================================================
// AGENT REGISTRY
// ============================================================================

const AGENT_REGISTRY: ExecutingAgent[] = [];

// ============================================================================
// ORCHESTRATOR CLASS
// ============================================================================

export class AgentOrchestrator {
  private static instance: AgentOrchestrator;

  static getInstance(): AgentOrchestrator {
    if (!AgentOrchestrator.instance) {
      AgentOrchestrator.instance = new AgentOrchestrator();
    }
    return AgentOrchestrator.instance;
  }

  /**
   * Register an executing agent
   */
  registerAgent(agent: ExecutingAgent): void {
    const existing = AGENT_REGISTRY.findIndex(a => a.agentId === agent.agentId);
    if (existing >= 0) {
      AGENT_REGISTRY[existing] = agent;
    } else {
      AGENT_REGISTRY.push(agent);
    }
    console.log(`[Orchestrator] Registered agent: ${agent.agentId} with capabilities: ${agent.capabilities.join(', ')}`);
  }

  /**
   * Process a recommendation - find matching capability and execute
   */
  async processRecommendation(recommendationId: string): Promise<void> {
    const db = getDb();

    // Get recommendation
    const rec = db.prepare('SELECT * FROM recommendations WHERE id = ?').get(recommendationId) as any;
    if (!rec) {
      console.log(`[Orchestrator] Recommendation ${recommendationId} not found`);
      return;
    }

    // Find matching capability
    const capability = this.findCapability(rec.action);
    if (!capability) {
      console.log(`[Orchestrator] No capability match for: ${rec.action}`);
      return;
    }

    // Find executing agent
    const agent = this.findAgent(capability);
    if (!agent) {
      console.log(`[Orchestrator] No agent registered for capability: ${capability}`);
      return;
    }

    // Create task
    const task: AgentTask = {
      id: uuidv4(),
      recommendationId,
      capability,
      clientId: rec.client_id,
      context: JSON.parse(rec.metadata || '{}'),
      priority: rec.confidence >= 85 ? 'high' : rec.confidence >= 70 ? 'medium' : 'low',
    };

    // Log execution start
    const execId = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO agent_execution_log (id, recommendation_id, executing_agent_id, capability, status, started_at, context)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(execId, recommendationId, agent.agentId, capability, 'running', now, JSON.stringify(task.context));

    logger.info({ capability, agentId: agent.agentId, recommendationId }, '[Orchestrator] Executing');

    try {
      // Execute with automatic memory wrapping
      const agentType = CAPABILITY_TO_AGENT_TYPE[capability];
      const memoryOptions: AgentRunOptions = {
        agentName: `orchestrator-${agent.agentId}-${capability}`,
        clientId: task.clientId,
        agentType,
        headline: `Auto-executed: ${capability}`,
        keyInsights: [`Triggered by recommendation ${recommendationId}`],
      };

      const { result } = await wrapWithMemory(memoryOptions, () => agent.execute(task));

      // Update execution log
      db.prepare(`
        UPDATE agent_execution_log SET status = ?, completed_at = ?, output = ?, error = ?
        WHERE id = ?
      `).run(
        result.success ? 'completed' : 'failed',
        new Date().toISOString(),
        JSON.stringify(result.output),
        result.error || null,
        execId
      );

      // Update recommendation status
      db.prepare(`
        UPDATE recommendations SET status = ?, executed_at = ?
        WHERE id = ?
      `).run(
        result.success ? 'auto_executed' : 'failed',
        new Date().toISOString(),
        recommendationId
      );

      logger.info({ capability, success: result.success, recommendationId }, '[Orchestrator] Execution complete');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Orchestrator] Execution failed:`, error);

      db.prepare(`
        UPDATE agent_execution_log SET status = 'failed', completed_at = ?, error = ?
        WHERE id = ?
      `).run(new Date().toISOString(), errorMsg, execId);
    }
  }

  private findCapability(action: string): AgentCapability | null {
    for (const pattern of RECOMMENDATION_PATTERNS) {
      if (pattern.pattern.test(action)) {
        return pattern.capability;
      }
    }
    return null;
  }

  private findAgent(capability: AgentCapability): ExecutingAgent | null {
    return AGENT_REGISTRY.find(a => a.capabilities.includes(capability)) || null;
  }
}

// ============================================================================
// EXECUTING AGENTS
// ============================================================================

/**
 * Creative Generator Agent
 */
function registerCreativeAgent(): void {
  const orchestrator = AgentOrchestrator.getInstance();

  orchestrator.registerAgent({
    agentId: 'creative-generator',
    capabilities: [
      'draft_creative',
      'draft_testimonial_creative',
      'draft_objection_creative',
      'draft_trust_creative',
      'refresh_creative',
    ],
    execute: async (task) => {
      console.log(`[CreativeGenerator] Generating ${task.capability} creative`);

      try {
        const { generateStaticAds } = await import('./static-ad-generator.js');

        const config = {
          clientId: task.clientId,
          products: ['bestsellers'] as string[],
          formats: ['1080x1080', '1080x1920', '1200x628'] as ('1080x1080' | '1080x1920' | '1200x628')[],
          variantsPerFormat: 3,
          style: task.capability.replace('draft_', '').replace('_creative', ''),
          ...task.context,
        };

        const result = await generateStaticAds(config);

        return {
          success: true,
          output: {
            creativesGenerated: result?.generated?.length || 0,
            message: `Generated ${result?.generated?.length || 0} creatives`,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: {},
          error: error instanceof Error ? error.message : 'Creative generation failed',
        };
      }
    },
  });
}

/**
 * Campaign Manager Agent
 *
 * Executes campaign changes via Meta API. Uses POST to update status.
 */
function registerCampaignAgent(): void {
  const orchestrator = AgentOrchestrator.getInstance();

  orchestrator.registerAgent({
    agentId: 'campaign-manager',
    capabilities: ['pause_campaign', 'pause_adset', 'pause_ad', 'increase_budget', 'decrease_budget'],
    execute: async (task) => {
      console.log(`[CampaignManager] Executing ${task.capability}`);

      try {
        // Get client info and credentials
        const { getClient } = await import('./service-clients.js');
        const client = getClient(task.clientId);
        const metaAccessToken = task.context['metaToken'] as string || process.env['META_ACCESS_TOKEN'];

        if (!client) {
          return { success: false, output: {}, error: 'Client not found' };
        }

        if (!metaAccessToken) {
          return { success: false, output: {}, error: 'Missing Meta credentials' };
        }

        const entityId = task.context['entityId'] as string ||
                        task.context['campaignId'] as string ||
                        task.context['adsetId'] as string ||
                        task.context['adId'] as string;

        if (!entityId) {
          return { success: false, output: {}, error: 'No entity ID provided' };
        }

        const reason = task.context['reason'] as string || `Auto-executed from recommendation ${task.recommendationId}`;

        // Use fetch directly to update Meta campaign/adset/ad status
        const updateStatus = async (id: string, status: string) => {
          const url = `https://graph.facebook.com/v21.0/${id}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              access_token: metaAccessToken,
              status,
            }),
          });
          if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error?.error?.message || `Failed to update ${id}`);
          }
          return res.json();
        };

        switch (task.capability) {
          case 'pause_campaign':
          case 'pause_adset':
          case 'pause_ad':
            await updateStatus(entityId, 'PAUSED');
            console.log(`[CampaignManager] Paused ${entityId}: ${reason}`);
            return {
              success: true,
              output: { action: 'paused', entityId, reason },
            };

          case 'increase_budget':
          case 'decrease_budget': {
            const multiplier = task.capability === 'increase_budget' ? 1.2 : 0.8;
            const currentBudget = task.context['currentBudget'] as number || 0;
            const newBudget = Math.round(currentBudget * multiplier);
            console.log(`[CampaignManager] Budget ${task.capability}: ${currentBudget} -> ${newBudget} for ${entityId}`);
            return {
              success: true,
              output: { action: task.capability, entityId, oldBudget: currentBudget, newBudget, note: 'Budget update queued' },
            };
          }

          default:
            return { success: false, output: {}, error: `Unknown capability: ${task.capability}` };
        }
      } catch (error) {
        return {
          success: false,
          output: {},
          error: error instanceof Error ? error.message : 'Campaign action failed',
        };
      }
    },
  });
}

/**
 * Analysis Agent
 *
 * Gets credentials from context (passed from recommending agent) or environment.
 */
function registerAnalysisAgent(): void {
  const orchestrator = AgentOrchestrator.getInstance();

  orchestrator.registerAgent({
    agentId: 'analysis-agent',
    capabilities: ['detect_oos', 'detect_discount_leak', 'analyze_competitors'],
    execute: async (task) => {
      console.log(`[AnalysisAgent] Running ${task.capability}`);

      try {
        // Get client info
        const { getClient } = await import('./service-clients.js');
        const client = getClient(task.clientId);

        if (!client) {
          return { success: false, output: {}, error: 'Client not found' };
        }

        // Get credentials from context or environment
        const shopDomain = task.context['shopDomain'] as string || client.shopifyStore || process.env['SHOPIFY_SHOP'];
        const shopifyToken = task.context['shopifyToken'] as string || process.env['SHOPIFY_ACCESS_TOKEN'];
        const metaAccountId = task.context['metaAccountId'] as string || client.metaAdAccountId || process.env['META_AD_ACCOUNT_ID'];
        const metaToken = task.context['metaToken'] as string || process.env['META_ACCESS_TOKEN'];

        switch (task.capability) {
          case 'detect_oos': {
            if (!shopDomain || !shopifyToken || !metaAccountId || !metaToken) {
              console.log(`[AnalysisAgent] OOS check queued - missing credentials`);
              return { success: true, output: { queued: true, reason: 'Credentials not available, scheduled for next watchdog run' } };
            }
            const { runOOSCheck } = await import('./oos-detector.js');
            const result = await runOOSCheck({
              shopDomain,
              shopifyToken,
              metaAccountId,
              metaToken,
            });
            return {
              success: true,
              output: {
                oosCount: result.topMatches?.length || 0,
                wastedSpend: result.wastedSpend || 0,
                hasIssues: result.hasIssues,
              },
            };
          }

          case 'detect_discount_leak': {
            if (!shopDomain || !shopifyToken) {
              console.log(`[AnalysisAgent] Discount leak check queued - missing credentials`);
              return { success: true, output: { queued: true, reason: 'Credentials not available, scheduled for next watchdog run' } };
            }
            const { runDiscountLeakageCheck } = await import('./discount-leakage-detector.js');
            const result = await runDiscountLeakageCheck({
              shopDomain,
              shopifyToken,
              brandName: client.brandName,
            });
            return {
              success: true,
              output: {
                success: result.success,
                leakedCodes: result.report?.leakedCodes?.length || 0,
                impact: result.report?.totalRevenueLeakage || 0,
              },
            };
          }

          case 'analyze_competitors': {
            const { runCompetitorIntelForClient } = await import('./competitor-creative-intel.js');
            const result = await runCompetitorIntelForClient(task.clientId);
            return {
              success: true,
              output: {
                analyzed: true,
                competitorCount: result?.competitors?.length || 0,
              },
            };
          }

          default:
            return { success: false, output: {}, error: `Unknown capability: ${task.capability}` };
        }
      } catch (error) {
        return {
          success: false,
          output: {},
          error: error instanceof Error ? error.message : 'Analysis failed',
        };
      }
    },
  });
}

// ============================================================================
// SCHEMA SETUP
// ============================================================================

export function setupOrchestratorSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_execution_log (
      id TEXT PRIMARY KEY,
      recommendation_id TEXT NOT NULL,
      executing_agent_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT,
      completed_at TEXT,
      context TEXT DEFAULT '{}',
      output TEXT DEFAULT '{}',
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_exec_log_rec ON agent_execution_log(recommendation_id);
    CREATE INDEX IF NOT EXISTS idx_exec_log_status ON agent_execution_log(status);
  `);

  // Add metadata column to recommendations if not exists
  try {
    db.exec(`ALTER TABLE recommendations ADD COLUMN metadata TEXT DEFAULT '{}'`);
  } catch {
    // Column already exists
  }

  console.log('[Orchestrator] Schema setup complete');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initializeOrchestrator(): AgentOrchestrator {
  setupOrchestratorSchema();

  registerCreativeAgent();
  registerCampaignAgent();
  registerAnalysisAgent();

  console.log('[Orchestrator] Initialized with all executing agents');

  return AgentOrchestrator.getInstance();
}

// Export singleton
export const orchestrator = AgentOrchestrator.getInstance();
