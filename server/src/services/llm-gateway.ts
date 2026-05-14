/**
 * LLM Gateway - Centralized AI Call Management
 *
 * ALL AI calls MUST go through this gateway.
 * Direct LLM instantiation is FORBIDDEN.
 *
 * Features:
 * - Budget control (per-client, per-agent)
 * - Rate limiting
 * - Distributed tracing
 * - Fallback routing
 * - Cost estimation
 * - Usage analytics
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type LLMProvider = 'anthropic' | 'gemini';
export type LLMModel =
  | 'claude-sonnet-4-20250514'
  | 'claude-3-5-sonnet-20241022'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro';

export type Priority = 'low' | 'normal' | 'high' | 'critical';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMRequest {
  // Identity & Tracing
  requestId?: string;
  correlationId: string;
  source: string;        // Which agent/service (e.g., 'comment-mining')
  operation: string;     // What operation (e.g., 'classify-comments')

  // Model Selection
  provider: LLMProvider;
  model: LLMModel;

  // Request Content
  messages: LLMMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;

  // Governance
  budgetKey: string;     // Budget to charge (e.g., 'client:pratapsons')
  priority?: Priority;
  timeout?: number;      // ms

  // Fallback
  fallbackProvider?: LLMProvider;
  fallbackModel?: LLMModel;
}

export interface LLMResponse {
  requestId: string;
  content: string;

  // Usage
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;

  // Timing
  latencyMs: number;
  queueTimeMs: number;

  // Metadata
  provider: LLMProvider;
  model: LLMModel;
  usedFallback: boolean;
}

export interface BudgetStatus {
  budgetKey: string;
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  percentUsed: number;
  isWarning: boolean;
  isBlocked: boolean;
}

// ============================================================================
// COST ESTIMATION
// ============================================================================

const COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
  'gemini-2.5-pro': { input: 0.00125, output: 0.005 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = COST_PER_1K_TOKENS[model] || { input: 0.003, output: 0.015 };
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

// ============================================================================
// BUDGET MANAGEMENT
// ============================================================================

interface BudgetConfig {
  dailyTokenLimit: number;
  dailyCostLimit: number;
  maxTokensPerCall: number;
  maxCostPerCall: number;
  warnAt: number;  // 0.8 = 80%
  blockAt: number; // 1.0 = 100%
}

const DEFAULT_BUDGETS: Record<string, BudgetConfig> = {
  // Default for unknown keys
  'default': {
    dailyTokenLimit: 1_000_000,
    dailyCostLimit: 10.00,
    maxTokensPerCall: 50_000,
    maxCostPerCall: 1.00,
    warnAt: 0.8,
    blockAt: 1.0,
  },

  // Per-agent budgets
  'agent:comment-mining': {
    dailyTokenLimit: 2_000_000,
    dailyCostLimit: 20.00,
    maxTokensPerCall: 100_000,
    maxCostPerCall: 2.00,
    warnAt: 0.8,
    blockAt: 1.0,
  },

  'agent:strategic-intel': {
    dailyTokenLimit: 1_500_000,
    dailyCostLimit: 15.00,
    maxTokensPerCall: 100_000,
    maxCostPerCall: 2.00,
    warnAt: 0.8,
    blockAt: 1.0,
  },

  'agent:watchdog': {
    dailyTokenLimit: 500_000,
    dailyCostLimit: 5.00,
    maxTokensPerCall: 20_000,
    maxCostPerCall: 0.50,
    warnAt: 0.8,
    blockAt: 1.0,
  },

  // Per-client budgets (higher limits)
  'client:pratapsons': {
    dailyTokenLimit: 5_000_000,
    dailyCostLimit: 50.00,
    maxTokensPerCall: 100_000,
    maxCostPerCall: 2.00,
    warnAt: 0.8,
    blockAt: 1.0,
  },

  // Development budget
  'dev:testing': {
    dailyTokenLimit: 500_000,
    dailyCostLimit: 5.00,
    maxTokensPerCall: 20_000,
    maxCostPerCall: 0.50,
    warnAt: 0.9,
    blockAt: 1.0,
  },
};

// In-memory usage tracking (would use Redis in production)
const usageTracker: Map<string, { tokens: number; cost: number; date: string }> = new Map();

function getUsage(budgetKey: string): { tokens: number; cost: number } {
  const today = new Date().toISOString().split('T')[0];
  const usage = usageTracker.get(budgetKey);

  if (!usage || usage.date !== today) {
    // Reset for new day
    usageTracker.set(budgetKey, { tokens: 0, cost: 0, date: today });
    return { tokens: 0, cost: 0 };
  }

  return { tokens: usage.tokens, cost: usage.cost };
}

function recordUsage(budgetKey: string, tokens: number, cost: number): void {
  const today = new Date().toISOString().split('T')[0];
  const current = usageTracker.get(budgetKey);

  if (!current || current.date !== today) {
    usageTracker.set(budgetKey, { tokens, cost, date: today });
  } else {
    usageTracker.set(budgetKey, {
      tokens: current.tokens + tokens,
      cost: current.cost + cost,
      date: today,
    });
  }
}

function getBudgetConfig(budgetKey: string): BudgetConfig {
  return DEFAULT_BUDGETS[budgetKey] || DEFAULT_BUDGETS['default'];
}

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimits: Map<string, RateLimitEntry> = new Map();

const RATE_LIMITS: Record<Priority, { requestsPerMinute: number }> = {
  'critical': { requestsPerMinute: 100 },
  'high': { requestsPerMinute: 60 },
  'normal': { requestsPerMinute: 30 },
  'low': { requestsPerMinute: 10 },
};

async function checkRateLimit(source: string, priority: Priority): Promise<boolean> {
  const key = `${source}:${priority}`;
  const limit = RATE_LIMITS[priority].requestsPerMinute;
  const now = Date.now();
  const windowMs = 60_000;

  const entry = rateLimits.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

// ============================================================================
// LLM CLIENTS
// ============================================================================

let anthropicClient: Anthropic | null = null;
let geminiClient: GoogleGenerativeAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env['GEMINI_API_KEY'] || process.env['GOOGLE_AI_API_KEY'];
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}

// ============================================================================
// MAIN GATEWAY
// ============================================================================

export class LLMGateway {
  async generate(request: LLMRequest): Promise<LLMResponse> {
    const requestId = request.requestId || uuidv4();
    const startTime = Date.now();
    const priority = request.priority || 'normal';

    const logContext = {
      requestId,
      correlationId: request.correlationId,
      source: request.source,
      operation: request.operation,
      provider: request.provider,
      model: request.model,
      budgetKey: request.budgetKey,
    };

    logger.info(logContext, '[LLMGateway] Request started');

    try {
      // 1. Check budget
      const budgetConfig = getBudgetConfig(request.budgetKey);
      const usage = getUsage(request.budgetKey);
      const estimatedTokens = request.maxTokens || 4000;

      if (usage.tokens + estimatedTokens > budgetConfig.dailyTokenLimit * budgetConfig.blockAt) {
        logger.error({
          ...logContext,
          dailyUsed: usage.tokens,
          dailyLimit: budgetConfig.dailyTokenLimit,
        }, '[LLMGateway] Budget exceeded');
        throw new BudgetExceededError(
          `Daily budget exceeded for ${request.budgetKey}. Used: ${usage.tokens}, Limit: ${budgetConfig.dailyTokenLimit}`
        );
      }

      if (usage.tokens > budgetConfig.dailyTokenLimit * budgetConfig.warnAt) {
        logger.warn({
          ...logContext,
          percentUsed: Math.round((usage.tokens / budgetConfig.dailyTokenLimit) * 100),
        }, '[LLMGateway] Budget warning');
      }

      // 2. Check rate limit
      const rateLimitOk = await checkRateLimit(request.source, priority);
      if (!rateLimitOk) {
        logger.warn(logContext, '[LLMGateway] Rate limited');
        throw new RateLimitError(`Rate limit exceeded for ${request.source}`);
      }

      // 3. Execute request
      const queueTimeMs = Date.now() - startTime;
      let response: LLMResponse;

      try {
        response = await this.executeRequest(request, requestId);
      } catch (error) {
        // 4. Try fallback if configured
        if (request.fallbackProvider && request.fallbackModel && this.isRetryable(error)) {
          logger.info({
            ...logContext,
            fallbackProvider: request.fallbackProvider,
            fallbackModel: request.fallbackModel,
          }, '[LLMGateway] Using fallback');

          const fallbackRequest = {
            ...request,
            provider: request.fallbackProvider,
            model: request.fallbackModel,
          };
          response = await this.executeRequest(fallbackRequest, requestId);
          response.usedFallback = true;
        } else {
          throw error;
        }
      }

      response.queueTimeMs = queueTimeMs;

      // 5. Record usage
      recordUsage(request.budgetKey, response.totalTokens, response.estimatedCost);

      // 6. Log success
      logger.info({
        ...logContext,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        estimatedCost: response.estimatedCost.toFixed(4),
        latencyMs: response.latencyMs,
        usedFallback: response.usedFallback,
      }, '[LLMGateway] Request completed');

      return response;

    } catch (error) {
      logger.error({
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'Unknown',
      }, '[LLMGateway] Request failed');
      throw error;
    }
  }

  private async executeRequest(request: LLMRequest, requestId: string): Promise<LLMResponse> {
    const executeStart = Date.now();

    if (request.provider === 'anthropic') {
      return this.executeAnthropic(request, requestId, executeStart);
    } else if (request.provider === 'gemini') {
      return this.executeGemini(request, requestId, executeStart);
    } else {
      throw new Error(`Unsupported provider: ${request.provider}`);
    }
  }

  private async executeAnthropic(
    request: LLMRequest,
    requestId: string,
    executeStart: number
  ): Promise<LLMResponse> {
    const client = getAnthropicClient();

    const messages = request.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const response = await client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages,
    });

    const content = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    return {
      requestId,
      content,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost: estimateCost(request.model, inputTokens, outputTokens),
      latencyMs: Date.now() - executeStart,
      queueTimeMs: 0,
      provider: 'anthropic',
      model: request.model,
      usedFallback: false,
    };
  }

  private async executeGemini(
    request: LLMRequest,
    requestId: string,
    executeStart: number
  ): Promise<LLMResponse> {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ model: request.model });

    // Build prompt from messages
    const prompt = request.messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const fullPrompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${prompt}`
      : prompt;

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const content = response.text();

    // Gemini doesn't always return usage, estimate
    const inputTokens = Math.ceil(fullPrompt.length / 4);
    const outputTokens = Math.ceil(content.length / 4);

    return {
      requestId,
      content,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCost: estimateCost(request.model, inputTokens, outputTokens),
      latencyMs: Date.now() - executeStart,
      queueTimeMs: 0,
      provider: 'gemini',
      model: request.model,
      usedFallback: false,
    };
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof BudgetExceededError) return false;
    if (error instanceof RateLimitError) return true;
    if (error instanceof Error) {
      // Retry on transient errors
      return error.message.includes('timeout') ||
             error.message.includes('rate') ||
             error.message.includes('overloaded');
    }
    return false;
  }

  // ============================================================================
  // BUDGET & USAGE QUERIES
  // ============================================================================

  getBudgetStatus(budgetKey: string): BudgetStatus {
    const config = getBudgetConfig(budgetKey);
    const usage = getUsage(budgetKey);

    const percentUsed = usage.tokens / config.dailyTokenLimit;

    return {
      budgetKey,
      dailyLimit: config.dailyTokenLimit,
      dailyUsed: usage.tokens,
      dailyRemaining: Math.max(0, config.dailyTokenLimit - usage.tokens),
      percentUsed: Math.round(percentUsed * 100),
      isWarning: percentUsed >= config.warnAt,
      isBlocked: percentUsed >= config.blockAt,
    };
  }

  getAllBudgetStatuses(): BudgetStatus[] {
    const keys = Array.from(usageTracker.keys());
    return keys.map(key => this.getBudgetStatus(key));
  }
}

// ============================================================================
// ERRORS
// ============================================================================

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const llmGateway = new LLMGateway();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick generate for simple use cases
 */
export async function generate(options: {
  prompt: string;
  systemPrompt?: string;
  source: string;
  operation: string;
  correlationId?: string;
  provider?: LLMProvider;
  model?: LLMModel;
  budgetKey?: string;
  maxTokens?: number;
}): Promise<string> {
  const response = await llmGateway.generate({
    correlationId: options.correlationId || uuidv4(),
    source: options.source,
    operation: options.operation,
    provider: options.provider || 'gemini',
    model: options.model || 'gemini-2.5-flash',
    messages: [{ role: 'user', content: options.prompt }],
    systemPrompt: options.systemPrompt,
    budgetKey: options.budgetKey || `agent:${options.source}`,
    maxTokens: options.maxTokens,
  });

  return response.content;
}

/**
 * Check if budget allows a request
 */
export function canAfford(budgetKey: string, estimatedTokens: number): boolean {
  const status = llmGateway.getBudgetStatus(budgetKey);
  return status.dailyRemaining >= estimatedTokens;
}
