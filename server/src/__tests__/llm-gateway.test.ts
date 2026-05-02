/**
 * Tests for services/llm-gateway.ts — single Anthropic entrypoint.
 *
 * Verifies daily-cap enforcement, cost-ledger writes, model-class routing,
 * cost computation, and 429 mapping. SDK is fully mocked — no live network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTables } from '../db/schema.js';

let testDb: Database.Database;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Capture create/countTokens calls so tests can assert what got dispatched.
const mockCreate = vi.fn();
const mockCountTokens = vi.fn();
const mockMaxRetriesByCall: Array<number | undefined> = [];

vi.mock('@anthropic-ai/sdk', () => {
  // RateLimitError and APIError must be on the default export so
  // `instanceof Anthropic.RateLimitError` works inside the gateway.
  class APIError extends Error {
    status?: number;
    headers?: Record<string, string>;
    constructor(message: string, opts?: { status?: number; headers?: Record<string, string> }) {
      super(message);
      this.status = opts?.status;
      this.headers = opts?.headers;
    }
  }
  class RateLimitError extends APIError {
    constructor(message: string, headers?: Record<string, string>) {
      super(message, { status: 429, headers });
      this.name = 'RateLimitError';
    }
  }
  class Anthropic {
    messages = {
      create: (req: any, opts?: { maxRetries?: number }) => {
        mockMaxRetriesByCall.push(opts?.maxRetries);
        return mockCreate(req, opts);
      },
      countTokens: (req: any) => mockCountTokens(req),
    };
    constructor(public _opts: any) {}
  }
  return {
    default: Object.assign(Anthropic, { RateLimitError, APIError }),
    Anthropic,
    RateLimitError,
    APIError,
  };
});

const TEST_USER_ID = 'user-gw-1';

function insertTestUser(plan: string = 'free') {
  testDb.prepare(
    'INSERT INTO users (id, name, email, password_hash, plan) VALUES (?, ?, ?, ?, ?)'
  ).run(TEST_USER_ID, 'Test', 'gw@test.com', 'hash', plan);
}

function insertCostRow(provider: string, cents: number, when?: string) {
  const created = when || new Date().toISOString();
  testDb.prepare(`
    INSERT INTO cost_ledger (user_id, api_provider, operation, cost_cents, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(TEST_USER_ID, provider, 'test_op', cents, '{}', created);
}

beforeEach(() => {
  testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  createTables(testDb);
  insertTestUser('free');

  mockCreate.mockReset();
  mockCountTokens.mockReset();
  mockMaxRetriesByCall.length = 0;

  // Default: SDK responses succeed with predictable usage shape.
  mockCountTokens.mockResolvedValue({ input_tokens: 1_000 });
  mockCreate.mockResolvedValue({
    id: 'msg_test',
    content: [{ type: 'text', text: 'ok' }],
    usage: {
      input_tokens: 1_000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  });
});

afterEach(() => {
  testDb.close();
  vi.restoreAllMocks();
});

describe('modelClass routing', () => {
  it('resolves Opus, Sonnet, Haiku from current alias names', async () => {
    const { modelClass } = await import('../services/llm-gateway.js');
    expect(modelClass('claude-opus-4-7')).toBe('opus');
    expect(modelClass('claude-opus-4-6')).toBe('opus');
    expect(modelClass('claude-sonnet-4-6')).toBe('sonnet');
    expect(modelClass('claude-haiku-4-5')).toBe('haiku');
    expect(modelClass('claude-haiku-4-5-20251001')).toBe('haiku');
  });
});

describe('computeCostCents', () => {
  it('Opus pricing: 1K in + 500 out → ceil(1.5 + 3.75) = 6¢', async () => {
    const { computeCostCents } = await import('../services/llm-gateway.js');
    const cost = computeCostCents('claude-opus-4-6', {
      input_tokens: 1_000, output_tokens: 500,
    });
    // (1000/1M)*1500 + (500/1M)*7500 = 1.5 + 3.75 = 5.25 → ceil = 6
    expect(cost).toBe(6);
  });

  it('Sonnet pricing: 1K in + 500 out → ceil(0.3 + 0.75) = 2¢', async () => {
    const { computeCostCents } = await import('../services/llm-gateway.js');
    const cost = computeCostCents('claude-sonnet-4-6', {
      input_tokens: 1_000, output_tokens: 500,
    });
    expect(cost).toBe(2);
  });

  it('Haiku pricing: 1K in + 500 out → ceil(0.1 + 0.25) = 1¢', async () => {
    const { computeCostCents } = await import('../services/llm-gateway.js');
    const cost = computeCostCents('claude-haiku-4-5', {
      input_tokens: 1_000, output_tokens: 500,
    });
    expect(cost).toBe(1);
  });

  it('cache write/read tokens are billed separately', async () => {
    const { computeCostCents } = await import('../services/llm-gateway.js');
    const cost = computeCostCents('claude-sonnet-4-6', {
      input_tokens: 0, output_tokens: 0,
      cache_creation_input_tokens: 1_000_000, // → 375¢ at sonnet cache-write rate
      cache_read_input_tokens: 0,
    });
    expect(cost).toBe(375);
  });
});

describe('createMessage — per-user daily cap', () => {
  it('throws DailyCapExceededError when anthropic spend already at cap', async () => {
    insertCostRow('anthropic', 500); // free-tier cap is 500¢

    const { createMessage, DailyCapExceededError } = await import('../services/llm-gateway.js');
    await expect(createMessage({
      userId: TEST_USER_ID,
      operation: 'test.cap',
      request: {
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      },
    })).rejects.toBeInstanceOf(DailyCapExceededError);

    // Should NOT have called the SDK.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCountTokens).not.toHaveBeenCalled();
  });

  it('does NOT count Gemini spend toward the Anthropic cap (per-provider)', async () => {
    // 500¢ of Gemini puts user "over" if we summed across providers,
    // but per-provider semantics mean Anthropic is still at $0.
    insertCostRow('gemini', 500);

    const { createMessage } = await import('../services/llm-gateway.js');
    await createMessage({
      userId: TEST_USER_ID,
      operation: 'test.per-provider',
      request: {
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      },
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('createMessage — cost ledger', () => {
  it('writes exactly one cost_ledger row per successful call', async () => {
    const { createMessage } = await import('../services/llm-gateway.js');
    await createMessage({
      userId: TEST_USER_ID,
      operation: 'test.ledger',
      request: {
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      },
    });

    const rows = testDb.prepare(
      'SELECT * FROM cost_ledger WHERE user_id = ? AND api_provider = ?'
    ).all(TEST_USER_ID, 'anthropic') as any[];

    expect(rows).toHaveLength(1);
    expect(rows[0].operation).toBe('test.ledger');
    // Sonnet 1K in + 500 out = ceil(0.3 + 0.75) = 2¢
    expect(rows[0].cost_cents).toBe(2);
    const meta = JSON.parse(rows[0].metadata);
    expect(meta.model).toBe('claude-sonnet-4-6');
    expect(meta.usage.input_tokens).toBe(1000);
  });
});

describe('createMessage — token estimation', () => {
  it('calls countTokens by default and uses input_tokens for weighting', async () => {
    mockCountTokens.mockResolvedValueOnce({ input_tokens: 12_345 });

    const { createMessage } = await import('../services/llm-gateway.js');
    await createMessage({
      userId: TEST_USER_ID,
      operation: 'test.count',
      request: {
        model: 'claude-haiku-4-5',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(mockCountTokens).toHaveBeenCalledTimes(1);
    expect(mockCountTokens.mock.calls[0][0]).toMatchObject({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'hello' }],
    });
  });

  it('skips countTokens when caller supplies estimateTokens', async () => {
    const { createMessage } = await import('../services/llm-gateway.js');
    await createMessage({
      userId: TEST_USER_ID,
      operation: 'test.estimate',
      estimateTokens: 9_999,
      request: {
        model: 'claude-sonnet-4-6',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'hi' }],
      },
    });
    expect(mockCountTokens).not.toHaveBeenCalled();
  });
});

describe('createMessage — upstream rate-limit mapping', () => {
  it('wraps SDK RateLimitError as UpstreamRateLimitedError with retry-after', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    mockCreate.mockRejectedValueOnce(
      new (Anthropic as any).RateLimitError('429 from anthropic', { 'retry-after': '42' }),
    );

    const { createMessage, UpstreamRateLimitedError } = await import('../services/llm-gateway.js');
    let caught: unknown;
    try {
      await createMessage({
        userId: TEST_USER_ID,
        operation: 'test.429',
        request: {
          model: 'claude-sonnet-4-6',
          max_tokens: 50,
          messages: [{ role: 'user', content: 'hi' }],
        },
      });
    } catch (err) { caught = err; }

    expect(caught).toBeInstanceOf(UpstreamRateLimitedError);
    expect((caught as InstanceType<typeof UpstreamRateLimitedError>).retryAfterSeconds).toBe(42);
  });

  it('defaults retry-after to 60 when header missing', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    mockCreate.mockRejectedValueOnce(
      new (Anthropic as any).RateLimitError('no header'),
    );

    const { createMessage, UpstreamRateLimitedError } = await import('../services/llm-gateway.js');
    try {
      await createMessage({
        userId: TEST_USER_ID,
        operation: 'test.429-noheader',
        request: {
          model: 'claude-sonnet-4-6',
          max_tokens: 50,
          messages: [{ role: 'user', content: 'hi' }],
        },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamRateLimitedError);
      expect((err as InstanceType<typeof UpstreamRateLimitedError>).retryAfterSeconds).toBe(60);
    }
  });
});

describe('createMessage — maxRetries propagation', () => {
  it('passes a per-call maxRetries override to messages.create', async () => {
    const { createMessage } = await import('../services/llm-gateway.js');
    await createMessage({
      userId: TEST_USER_ID,
      operation: 'test.retries',
      maxRetries: 7,
      request: {
        model: 'claude-sonnet-4-6',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'hi' }],
      },
    });

    // Last call should carry the override.
    expect(mockMaxRetriesByCall).toContain(7);
  });

  it('omits maxRetries when caller does not override (SDK default applies)', async () => {
    const { createMessage } = await import('../services/llm-gateway.js');
    await createMessage({
      userId: TEST_USER_ID,
      operation: 'test.no-override',
      request: {
        model: 'claude-sonnet-4-6',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'hi' }],
      },
    });

    expect(mockMaxRetriesByCall[mockMaxRetriesByCall.length - 1]).toBeUndefined();
  });
});

describe('checkDailyLimit — provider filtering', () => {
  it('filters by api_provider when option is set', async () => {
    insertCostRow('anthropic', 100);
    insertCostRow('gemini', 200);
    insertCostRow('flux', 300);

    const { checkDailyLimit } = await import('../services/llm-gateway.js');
    expect(checkDailyLimit(TEST_USER_ID, { apiProvider: 'anthropic' }).spent).toBe(100);
    expect(checkDailyLimit(TEST_USER_ID, { apiProvider: 'gemini' }).spent).toBe(200);
    // No filter sums everything (used by job-queue).
    expect(checkDailyLimit(TEST_USER_ID).spent).toBe(600);
  });
});
