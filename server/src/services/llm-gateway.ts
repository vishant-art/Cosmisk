/**
 * LLM gateway — single entry point for every Anthropic Messages call.
 *
 * Enforces per-user daily $ caps, org-wide RPM/ITPM via Bottleneck, retries via
 * the SDK, and writes cost_ledger rows for every successful call.
 *
 * See dev_reports/rate_limiting/implementation_plan.md for the design contract.
 */

import Anthropic, { RateLimitError as AnthropicRateLimitError } from '@anthropic-ai/sdk';
import type { Message, MessageCreateParams } from '@anthropic-ai/sdk/resources/messages.js';
import Bottleneck from 'bottleneck';
import { config } from '../config.js';
import { getDbAdapter } from '../db/adapter.js';
import { logger } from '../utils/logger.js';
import { getCorrelationId } from '../utils/request-context.js';

/* ------------------------------------------------------------------ */
/*  Pricing                                                            */
/* ------------------------------------------------------------------ */

// Cents per 1M tokens. Source: dev_reports/rate_limiting/anthropic_rate_limits.md.
// Keys are model-class buckets — every Sonnet 4.x ID resolves to PRICING.sonnet, etc.
const PRICING: Record<ModelClass, { in: number; out: number; cacheWrite: number; cacheRead: number }> = {
  opus:   { in: 1500, out: 7500, cacheWrite: 1875, cacheRead: 150 },
  sonnet: { in: 300,  out: 1500, cacheWrite: 375,  cacheRead: 30 },
  haiku:  { in: 100,  out: 500,  cacheWrite: 125,  cacheRead: 10 },
};

/* ------------------------------------------------------------------ */
/*  Tier-driven Anthropic limits                                       */
/* ------------------------------------------------------------------ */

interface TierLimits { rpm: number; itpm: number; otpm: number; }

const LIMITS_BY_TIER: Record<number, Record<ModelClass, TierLimits>> = {
  1: {
    sonnet: { rpm: 50,    itpm: 30_000,    otpm: 8_000 },
    opus:   { rpm: 50,    itpm: 30_000,    otpm: 8_000 },
    haiku:  { rpm: 50,    itpm: 50_000,    otpm: 10_000 },
  },
  2: {
    sonnet: { rpm: 1_000, itpm: 450_000,   otpm: 90_000 },
    opus:   { rpm: 1_000, itpm: 450_000,   otpm: 90_000 },
    haiku:  { rpm: 1_000, itpm: 450_000,   otpm: 90_000 },
  },
  3: {
    sonnet: { rpm: 2_000, itpm: 800_000,   otpm: 160_000 },
    opus:   { rpm: 2_000, itpm: 800_000,   otpm: 160_000 },
    haiku:  { rpm: 2_000, itpm: 1_000_000, otpm: 200_000 },
  },
  4: {
    sonnet: { rpm: 4_000, itpm: 2_000_000, otpm: 400_000 },
    opus:   { rpm: 4_000, itpm: 2_000_000, otpm: 400_000 },
    haiku:  { rpm: 4_000, itpm: 4_000_000, otpm: 800_000 },
  },
};

export type ModelClass = 'sonnet' | 'opus' | 'haiku';

export function modelClass(model: string): ModelClass {
  if (model.startsWith('claude-opus')) return 'opus';
  if (model.startsWith('claude-haiku')) return 'haiku';
  if (model.startsWith('claude-sonnet')) return 'sonnet';
  // Older / undated aliases — best-effort fallback.
  if (model.includes('opus')) return 'opus';
  if (model.includes('haiku')) return 'haiku';
  return 'sonnet';
}

/* ------------------------------------------------------------------ */
/*  Plan-tier daily caps (cents)                                       */
/* ------------------------------------------------------------------ */

export const DAILY_COST_LIMITS: Record<string, number> = {
  free:   500,
  solo:   5_000,
  growth: 20_000,
  agency: 100_000,
};
const DEFAULT_DAILY_LIMIT = 1_000;

interface DailyUsageRow { total_cents: number | null; }
interface UserPlanRow   { plan: string | null; }

export interface DailyLimitOptions {
  /** If set, only sum cost_ledger rows for this provider (e.g. 'anthropic'). */
  apiProvider?: string;
}

export async function getDailySpendCents(userId: string, opts: DailyLimitOptions = {}): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const sql = opts.apiProvider
    ? `SELECT SUM(cost_cents) as total_cents FROM cost_ledger
       WHERE user_id = ? AND DATE(created_at) = ? AND api_provider = ?`
    : `SELECT SUM(cost_cents) as total_cents FROM cost_ledger
       WHERE user_id = ? AND DATE(created_at) = ?`;
  const row = (opts.apiProvider
    ? await getDbAdapter().get(sql, [userId, today, opts.apiProvider])
    : await getDbAdapter().get(sql, [userId, today])) as DailyUsageRow;
  return row.total_cents || 0;
}

export async function getUserDailyLimit(userId: string): Promise<number> {
  if (config.llmDailyUsdCapOverride !== null) return config.llmDailyUsdCapOverride;
  const row = (await getDbAdapter().get('SELECT plan FROM users WHERE id = ?', [userId])) as UserPlanRow | undefined;
  const plan = (row?.plan || 'free').toLowerCase();
  return DAILY_COST_LIMITS[plan] ?? DEFAULT_DAILY_LIMIT;
}

export interface DailyLimitResult {
  allowed: boolean;
  spent: number;
  limit: number;
  remaining: number;
}

export async function checkDailyLimit(userId: string, opts: DailyLimitOptions = {}): Promise<DailyLimitResult> {
  const spent = await getDailySpendCents(userId, opts);
  const limit = await getUserDailyLimit(userId);
  const remaining = Math.max(0, limit - spent);
  return { allowed: spent < limit, spent, limit, remaining };
}

/* ------------------------------------------------------------------ */
/*  Shared SDK client + per-class limiters                             */
/* ------------------------------------------------------------------ */

const client = new Anthropic({
  apiKey: config.anthropicApiKey,
  maxRetries: 3,         // 429/5xx auto-retry; SDK respects retry-after.
  timeout: 600_000,      // 10 min — explicit; matches SDK default.
});

const tier = LIMITS_BY_TIER[config.anthropicTier] ? config.anthropicTier : 1;
if (tier !== config.anthropicTier) {
  logger.warn(
    { configured: config.anthropicTier },
    `[LLM-Gateway] Unknown ANTHROPIC_TIER, falling back to Tier 1 reservoirs`,
  );
}

const limiters: Record<ModelClass, Bottleneck> = (Object.keys(LIMITS_BY_TIER[tier]) as ModelClass[])
  .reduce((acc, cls) => {
    const lim = LIMITS_BY_TIER[tier][cls];
    // NB: maxConcurrent intentionally left unset. Bottleneck rejects a job
    // whose `weight` exceeds maxConcurrent (e.g. weight=1000 tokens against
    // maxConcurrent=5 throws "Impossible to add a job…"). The reservoir
    // already gates throughput by token budget, and the per-second cap via
    // minTime gates RPM, so an explicit concurrency cap would only re-enact
    // the same constraints with extra failure modes.
    acc[cls] = new Bottleneck({
      minTime: Math.ceil(60_000 / lim.rpm),
      reservoir: lim.itpm,
      reservoirRefreshAmount: lim.itpm,
      reservoirRefreshInterval: 60_000,
    });
    return acc;
  }, {} as Record<ModelClass, Bottleneck>);

logger.info(
  { tier, limits: LIMITS_BY_TIER[tier] },
  '[LLM-Gateway] Initialized with Anthropic Tier reservoirs',
);

/* ------------------------------------------------------------------ */
/*  Cost computation                                                   */
/* ------------------------------------------------------------------ */

interface UsageWithCache {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function computeCostCents(model: string, usage: UsageWithCache): number {
  const cls = modelClass(model);
  const p = PRICING[cls];
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead  = usage.cache_read_input_tokens || 0;
  // input_tokens excludes cache reads/writes per Anthropic's usage shape.
  const cents =
      (usage.input_tokens  / 1_000_000) * p.in
    + (usage.output_tokens / 1_000_000) * p.out
    + (cacheWrite          / 1_000_000) * p.cacheWrite
    + (cacheRead           / 1_000_000) * p.cacheRead;
  return Math.ceil(cents);
}

/* ------------------------------------------------------------------ */
/*  Cost ledger write                                                  */
/* ------------------------------------------------------------------ */

interface CostLedgerInsert {
  userId: string;
  operation: string;
  apiProvider: 'anthropic' | 'gemini';
  costCents: number;
  metadata: Record<string, unknown>;
}

async function recordCost(row: CostLedgerInsert): Promise<void> {
  if (row.costCents <= 0) return;
  const correlationId = getCorrelationId();
  await getDbAdapter().run(`
    INSERT INTO cost_ledger (user_id, api_provider, operation, cost_cents, metadata)
    VALUES (?, ?, ?, ?, ?)
  `, [row.userId, row.apiProvider, row.operation, row.costCents, JSON.stringify(correlationId ? { ...row.metadata, correlationId } : row.metadata)]);
}

/* ------------------------------------------------------------------ */
/*  Errors surfaced to callers                                         */
/* ------------------------------------------------------------------ */

export class DailyCapExceededError extends Error {
  statusCode = 429;
  cap: DailyLimitResult;
  constructor(cap: DailyLimitResult) {
    super('daily_llm_cap');
    this.name = 'DailyCapExceededError';
    this.cap = cap;
  }
}

export class UpstreamRateLimitedError extends Error {
  statusCode = 429;
  retryAfterSeconds: number;
  cause: AnthropicRateLimitError;
  constructor(cause: AnthropicRateLimitError) {
    super('upstream_rate_limited');
    this.name = 'UpstreamRateLimitedError';
    this.cause = cause;
    this.retryAfterSeconds = parseRetryAfter(cause);
  }
}

function parseRetryAfter(err: AnthropicRateLimitError): number {
  // SDK exposes raw headers on APIError as `headers` (Record<string, string> | undefined).
  // Default to 60s if the header is missing or unparseable.
  const headers = (err as unknown as { headers?: Record<string, string> }).headers;
  const raw = headers?.['retry-after'] || headers?.['Retry-After'];
  if (!raw) return 60;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface CreateMessageOptions {
  userId: string;
  /** Caller identifier for cost-ledger audit (e.g. 'creative-strategist.suggestAngles'). */
  operation: string;
  request: MessageCreateParams;
  /** Override SDK default maxRetries for this call. */
  maxRetries?: number;
  /**
   * Skip pre-flight countTokens and use this estimate instead.
   * Useful in tests or when latency matters more than reservoir accuracy.
   */
  estimateTokens?: number;
}

export async function createMessage(opts: CreateMessageOptions): Promise<Message> {
  // 1. Per-user, per-provider daily cap
  const cap = await checkDailyLimit(opts.userId, { apiProvider: 'anthropic' });
  if (!cap.allowed) {
    logger.warn(
      { userId: opts.userId, spent: cap.spent, limit: cap.limit, operation: opts.operation },
      '[LLM-Gateway] Daily Anthropic cap exceeded',
    );
    throw new DailyCapExceededError(cap);
  }

  // 2. Pre-flight token estimate (or caller-supplied override)
  let inputTokens = opts.estimateTokens;
  if (inputTokens === undefined) {
    try {
      const est = await client.messages.countTokens({
        model: opts.request.model,
        messages: opts.request.messages,
        ...(opts.request.system ? { system: opts.request.system } : {}),
      });
      inputTokens = est.input_tokens;
    } catch (err) {
      // countTokens is best-effort; fall back to a pessimistic heuristic so we
      // still reserve roughly proportional capacity.
      const charCount = JSON.stringify(opts.request.messages).length;
      inputTokens = Math.ceil(charCount / 3.5);
      logger.warn({ err, fallback: inputTokens }, '[LLM-Gateway] countTokens failed, using heuristic');
    }
  }

  // 3. Rate-limited dispatch
  const cls = modelClass(opts.request.model);
  let response: Message;
  try {
    // Cast: messages.create returns Message | Stream depending on params.stream;
    // we never set stream:true so the runtime value is always Message.
    response = await limiters[cls].schedule<Message>(
      { weight: Math.max(1, inputTokens), priority: 5 },
      () => client.messages.create(
        { ...opts.request, stream: false },
        opts.maxRetries !== undefined ? { maxRetries: opts.maxRetries } : undefined,
      ) as Promise<Message>,
    );
  } catch (err) {
    if (err instanceof AnthropicRateLimitError) {
      logger.warn(
        { userId: opts.userId, operation: opts.operation, model: opts.request.model },
        '[LLM-Gateway] Upstream Anthropic rate-limit after SDK retries',
      );
      throw new UpstreamRateLimitedError(err);
    }
    throw err;
  }

  // 4. Cost ledger
  const cost = computeCostCents(opts.request.model, response.usage as UsageWithCache);
  await recordCost({
    userId: opts.userId,
    operation: opts.operation,
    apiProvider: 'anthropic',
    costCents: cost,
    metadata: {
      model: opts.request.model,
      usage: response.usage,
      input_estimate: inputTokens,
    },
  });

  return response;
}

/* ------------------------------------------------------------------ */
/*  Test helpers (intentionally exported)                              */
/* ------------------------------------------------------------------ */

/** Internal: exposed so tests can assert limiter behaviour without re-importing. */
export const __testing = { client, limiters, PRICING, LIMITS_BY_TIER };
