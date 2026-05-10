# Architecture Governance: Safe AI-Assisted Development

**Version:** 1.0.0
**Last Updated:** 2026-05-10
**Status:** MANDATORY for all Claude-assisted development

---

## Executive Summary

This document establishes production-grade governance for AI-assisted development. The goal is NOT to slow innovation—it's to ensure Claude accelerates development while developers retain architectural control.

**Core Principle:** Claude is a powerful accelerator, but architecture decisions require human approval at defined checkpoints.

---

## 1. Safe AI Development Workflow

### 1.1 The 4-Phase Claude Development Protocol

```
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1: CONTEXT                                                    │
│  Claude reads existing architecture before proposing changes         │
├─────────────────────────────────────────────────────────────────────┤
│  PHASE 2: PROPOSAL                                                   │
│  Claude proposes changes with impact analysis (no code yet)          │
├─────────────────────────────────────────────────────────────────────┤
│  PHASE 3: APPROVAL                                                   │
│  Human reviews proposal, approves/modifies/rejects                   │
├─────────────────────────────────────────────────────────────────────┤
│  PHASE 4: IMPLEMENTATION                                             │
│  Claude implements approved changes only                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Mandatory Pre-Flight Checks

Before Claude writes ANY code, it MUST:

```typescript
// Claude Pre-Flight Checklist
const preFlightChecks = {
  // 1. Read existing patterns
  readFirst: [
    'ARCHITECTURE_GOVERNANCE.md',      // This document
    'src/services/service-clients.ts', // Service registry
    'src/services/llm-gateway.ts',     // LLM gateway (if exists)
    'src/db/schema.ts',                // Schema definitions
  ],

  // 2. Identify what's being touched
  impactAnalysis: {
    newFiles: [],           // List files being created
    modifiedFiles: [],      // List files being modified
    newDependencies: [],    // New npm packages
    schemaChanges: [],      // DB schema changes
    cronChanges: [],        // Cron job changes
    llmCalls: [],           // New LLM call sites
  },

  // 3. Declare the change category
  changeCategory: 'feature' | 'agent' | 'schema' | 'cron' | 'integration' | 'infra',

  // 4. Estimate impact
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
};
```

### 1.3 Change Categories & Required Approvals

| Change Type | Pre-Approval Required | Post-Implementation Review |
|-------------|----------------------|---------------------------|
| Bug fix (< 50 lines) | No | No |
| Feature (single file) | No | Yes |
| Feature (multi-file) | Yes - Impact Statement | Yes |
| New Agent | Yes - Agent Contract | Yes - Architecture Review |
| Schema Change | Yes - Migration Plan | Yes - Data Team Review |
| Cron/Worker | Yes - Execution Plan | Yes - Ops Review |
| LLM Integration | Yes - Cost Estimate | Yes - Gateway Compliance |
| Infrastructure | Yes - Full RFC | Yes - Security Review |

---

## 2. Architecture Guardrails

### 2.1 The 10 Inviolable Rules

Claude-generated code MUST NOT:

```
RULE 1: NO DIRECT LLM CALLS
─────────────────────────────
All AI calls MUST go through: src/services/llm-gateway.ts
❌ anthropic.messages.create()
❌ gemini.generateContent()
✅ llmGateway.generate({ ... })

RULE 2: NO SCHEMA DUPLICATION
─────────────────────────────
All tables MUST be defined in: src/db/schema.ts
❌ Creating inline table definitions
❌ Raw SQL CREATE TABLE statements
✅ Adding to centralized schema file

RULE 3: NO GOD FILES (> 500 LINES)
──────────────────────────────────
If a file exceeds 500 lines, it MUST be split.
Max complexity per file: 500 lines
Max functions per file: 15
Max exports per file: 10

RULE 4: NO HIDDEN DEPENDENCIES
──────────────────────────────
Every new import MUST be declared in pre-flight.
Cross-service imports MUST use service contracts.
Circular dependencies are FORBIDDEN.

RULE 5: NO SILENT FAILURES
──────────────────────────
All errors MUST be:
- Logged with context
- Traced with correlation ID
- Reported to observability system

RULE 6: NO UNBOUNDED LOOPS
──────────────────────────
All loops MUST have:
- Explicit iteration limits
- Timeout constraints
- Cost circuit breakers

RULE 7: NO CRON WITHOUT GOVERNANCE
──────────────────────────────────
Cron jobs MUST be registered in: src/cron/registry.ts
- Declared execution frequency
- Resource limits
- Timeout constraints
- Failure handling

RULE 8: NO HARDCODED SECRETS/CONFIGS
────────────────────────────────────
All configuration MUST use:
- Environment variables
- Centralized config service
- No magic numbers/strings

RULE 9: NO SERVICE BOUNDARY VIOLATIONS
──────────────────────────────────────
Services MUST NOT directly access:
- Other services' databases
- Other services' internal state
- Use contracts/events instead

RULE 10: NO UNTRACED OPERATIONS
───────────────────────────────
All operations MUST carry:
- Correlation ID
- Operation name
- Client context
```

### 2.2 File Size & Complexity Limits

```typescript
// Enforced limits
const ARCHITECTURE_LIMITS = {
  // File limits
  maxLinesPerFile: 500,
  maxFunctionsPerFile: 15,
  maxExportsPerFile: 10,
  maxImportsPerFile: 20,

  // Function limits
  maxLinesPerFunction: 50,
  maxParametersPerFunction: 5,
  maxNestingDepth: 4,

  // Service limits
  maxFilesPerService: 10,
  maxDependenciesPerService: 15,

  // Agent limits
  maxToolsPerAgent: 10,
  maxStepsPerAgent: 20,
  maxTokensPerAgentCall: 100000,
};
```

### 2.3 Automatic Violation Detection

```bash
# Run before every commit
npm run lint:architecture

# Checks:
# - File size violations
# - Direct LLM calls (bypassing gateway)
# - Schema duplications
# - Circular dependencies
# - Missing observability
# - Unbounded loops
# - Hardcoded values
```

---

## 3. Change Governance System

### 3.1 Pre-Merge Validation Checklist

Before ANY feature/agent is merged, validate:

```yaml
# .github/PULL_REQUEST_TEMPLATE/ai_generated.md

## AI-Generated Code Checklist

### Schema Validation
- [ ] No new tables outside schema.ts
- [ ] Migrations are reversible
- [ ] No breaking schema changes
- [ ] Foreign keys documented

### Dependency Impact
- [ ] New dependencies justified
- [ ] No duplicate functionality
- [ ] Bundle size impact < 100KB
- [ ] Security audit passed

### Model Cost Impact
- [ ] LLM calls go through gateway
- [ ] Cost estimate provided
- [ ] Budget limits configured
- [ ] Fallback strategy defined

### Observability Coverage
- [ ] All functions have logging
- [ ] Errors include context
- [ ] Metrics exposed
- [ ] Traces connected

### Cron Safety
- [ ] Registered in cron registry
- [ ] Timeout configured
- [ ] Idempotent execution
- [ ] Failure notifications

### Service Ownership
- [ ] Owner defined in CODEOWNERS
- [ ] Service contract documented
- [ ] API versioned
- [ ] Breaking changes flagged

### Scaling Implications
- [ ] Load tested (if applicable)
- [ ] Rate limits configured
- [ ] Caching strategy defined
- [ ] Database indexes added

### Rollback Safety
- [ ] Feature flag implemented
- [ ] Rollback tested
- [ ] Data migration reversible
- [ ] Dependent services notified
```

### 3.2 Automated Governance Pipeline

```yaml
# .github/workflows/architecture-governance.yml
name: Architecture Governance

on: [pull_request]

jobs:
  governance-check:
    runs-on: ubuntu-latest
    steps:
      - name: Schema Validation
        run: npm run validate:schema

      - name: Dependency Analysis
        run: npm run analyze:dependencies

      - name: LLM Gateway Compliance
        run: npm run check:llm-gateway

      - name: File Size Limits
        run: npm run check:file-limits

      - name: Circular Dependency Check
        run: npm run check:circular

      - name: Observability Coverage
        run: npm run check:observability

      - name: Cron Safety Check
        run: npm run check:cron-safety

      - name: Cost Estimate
        run: npm run estimate:cost
```

---

## 4. Modular Agent Architecture

### 4.1 Agent Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATION LAYER                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Router    │  │  Scheduler  │  │   Queue     │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
├─────────────────────────────────────────────────────────────────────┤
│                         AGENT LAYER                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  Comment    │  │  Strategic  │  │  Organic    │  │  Watchdog  │ │
│  │  Mining     │  │  Intel      │  │  Intel      │  │            │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
├─────────┼────────────────┼────────────────┼───────────────┼─────────┤
│         │                │                │               │         │
│         ▼                ▼                ▼               ▼         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     SERVICE CONTRACTS                        │   │
│  │  - Input/Output schemas                                      │   │
│  │  - Error contracts                                           │   │
│  │  - Event definitions                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE LAYER                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │   LLM    │  │   Meta   │  │  Shopify │  │ Database │            │
│  │ Gateway  │  │   API    │  │   API    │  │          │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Agent Contract Template

Every agent MUST define a contract:

```typescript
// src/agents/contracts/comment-mining.contract.ts

import { z } from 'zod';

export const CommentMiningContract = {
  // Identity
  id: 'comment-mining-agent',
  version: '1.0.0',
  owner: 'intelligence-team',

  // Input schema
  inputSchema: z.object({
    accountId: z.string(),
    limit: z.number().max(500).default(200),
    includeReplies: z.boolean().default(false),
  }),

  // Output schema
  outputSchema: z.object({
    comments: z.array(CommentSchema),
    patterns: z.array(PatternSchema),
    summary: SummarySchema,
  }),

  // Error schema
  errorSchema: z.object({
    code: z.enum(['RATE_LIMIT', 'AUTH_FAILED', 'TIMEOUT', 'INTERNAL']),
    message: z.string(),
    retryable: z.boolean(),
  }),

  // Resource limits
  limits: {
    maxExecutionTime: 120_000, // 2 minutes
    maxLLMCalls: 50,
    maxLLMTokens: 500_000,
    maxRetries: 3,
  },

  // Dependencies
  dependencies: [
    'llm-gateway',
    'meta-api',
    'database',
  ],

  // Events emitted
  events: {
    'comment-mining.started': StartedEventSchema,
    'comment-mining.completed': CompletedEventSchema,
    'comment-mining.failed': FailedEventSchema,
  },
};
```

### 4.3 Service Boundaries

```typescript
// src/services/service-registry.ts

export const SERVICE_REGISTRY = {
  // Intelligence Services
  'intelligence': {
    owner: 'intelligence-team',
    services: ['comment-mining', 'strategic-intel', 'organic-intel', 'competitor-intel'],
    canAccess: ['meta-api', 'shopify-api', 'llm-gateway', 'database'],
    cannotAccess: ['user-auth', 'billing', 'admin'],
  },

  // Automation Services
  'automation': {
    owner: 'automation-team',
    services: ['watchdog', 'autopilot', 'oos-detector', 'fatigue-detector'],
    canAccess: ['meta-api', 'shopify-api', 'llm-gateway', 'database', 'alerting'],
    cannotAccess: ['user-auth', 'billing'],
  },

  // Integration Services
  'integrations': {
    owner: 'platform-team',
    services: ['meta-api', 'shopify-api', 'google-api', 'slack-api'],
    canAccess: ['database', 'cache', 'rate-limiter'],
    cannotAccess: ['llm-gateway'], // No LLM calls in integrations
  },

  // Infrastructure Services
  'infrastructure': {
    owner: 'platform-team',
    services: ['llm-gateway', 'database', 'cache', 'queue', 'scheduler'],
    canAccess: ['*'], // Full access
    cannotAccess: [],
  },
};
```

### 4.4 Event-Driven Communication

```typescript
// src/events/event-bus.ts

export interface EventBus {
  // Publish event
  publish<T>(event: {
    type: string;
    source: string;
    correlationId: string;
    payload: T;
    metadata: {
      timestamp: string;
      version: string;
    };
  }): Promise<void>;

  // Subscribe to events
  subscribe<T>(
    pattern: string,
    handler: (event: Event<T>) => Promise<void>,
    options: {
      maxRetries: number;
      deadLetterQueue: string;
    }
  ): Subscription;
}

// Example: Agent communication via events
eventBus.publish({
  type: 'comment-mining.completed',
  source: 'comment-mining-agent',
  correlationId: ctx.correlationId,
  payload: {
    accountId: 'act_123',
    patternsFound: 15,
    commentsAnalyzed: 200,
  },
  metadata: {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  },
});
```

---

## 5. Centralized LLM Gateway

### 5.1 Gateway Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LLM GATEWAY                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐         │
│  │  Budget  │   │   Rate   │   │  Trace   │   │ Fallback │         │
│  │ Control  │   │  Limiter │   │  Logger  │   │  Router  │         │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘         │
│       │              │              │              │                 │
│       ▼              ▼              ▼              ▼                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    REQUEST PIPELINE                          │   │
│  │  validate → budget → rate-limit → trace → execute → log     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│       ┌──────────────────────┼──────────────────────┐              │
│       ▼                      ▼                      ▼              │
│  ┌──────────┐          ┌──────────┐          ┌──────────┐         │
│  │  Claude  │          │  Gemini  │          │  OpenAI  │         │
│  └──────────┘          └──────────┘          └──────────┘         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Gateway Implementation

```typescript
// src/services/llm-gateway.ts

import { Anthropic } from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface LLMRequest {
  // Identity
  requestId: string;
  correlationId: string;
  source: string;        // Which agent/service
  operation: string;     // What operation

  // Model selection
  provider: 'anthropic' | 'gemini' | 'openai';
  model: string;

  // Request
  messages: Message[];
  maxTokens?: number;
  temperature?: number;

  // Governance
  budgetKey: string;     // Budget to charge
  priority: 'low' | 'normal' | 'high' | 'critical';
  timeout: number;

  // Fallback
  fallbackProvider?: 'anthropic' | 'gemini' | 'openai';
  fallbackModel?: string;
}

interface LLMResponse {
  requestId: string;
  content: string;

  // Usage
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;

  // Timing
  latencyMs: number;
  queueTimeMs: number;

  // Metadata
  provider: string;
  model: string;
  usedFallback: boolean;
}

class LLMGateway {
  private budgetManager: BudgetManager;
  private rateLimiter: RateLimiter;
  private tracer: Tracer;
  private metrics: MetricsCollector;

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const span = this.tracer.startSpan('llm.generate', {
      requestId: request.requestId,
      source: request.source,
      operation: request.operation,
    });

    try {
      // 1. Validate request
      this.validateRequest(request);

      // 2. Check budget
      const budgetCheck = await this.budgetManager.checkBudget(
        request.budgetKey,
        request.maxTokens || 4000
      );
      if (!budgetCheck.allowed) {
        throw new BudgetExceededError(budgetCheck.reason);
      }

      // 3. Check rate limits
      await this.rateLimiter.acquire(request.source, request.priority);

      // 4. Execute with timeout
      const startTime = Date.now();
      let response: LLMResponse;

      try {
        response = await this.executeWithTimeout(request);
      } catch (error) {
        // 5. Try fallback if configured
        if (request.fallbackProvider && this.isRetryable(error)) {
          span.addEvent('using_fallback');
          response = await this.executeFallback(request);
          response.usedFallback = true;
        } else {
          throw error;
        }
      }

      // 6. Record usage
      await this.budgetManager.recordUsage(
        request.budgetKey,
        response.inputTokens + response.outputTokens,
        response.estimatedCost
      );

      // 7. Emit metrics
      this.metrics.recordLLMCall({
        source: request.source,
        operation: request.operation,
        provider: response.provider,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        latencyMs: response.latencyMs,
        success: true,
      });

      return response;

    } catch (error) {
      span.recordException(error);
      this.metrics.recordLLMCall({
        source: request.source,
        operation: request.operation,
        provider: request.provider,
        model: request.model,
        success: false,
        errorType: error.name,
      });
      throw error;
    } finally {
      span.end();
    }
  }
}

// Export singleton
export const llmGateway = new LLMGateway(config);
```

### 5.3 Budget Management

```typescript
// src/services/llm-gateway/budget-manager.ts

interface BudgetConfig {
  // Daily limits
  dailyTokenLimit: number;
  dailyCostLimit: number;

  // Per-operation limits
  maxTokensPerCall: number;
  maxCostPerCall: number;

  // Alerts
  warnAt: number;  // 0.8 = 80%
  blockAt: number; // 1.0 = 100%
}

const BUDGET_CONFIGS: Record<string, BudgetConfig> = {
  // Per-client budgets
  'client:pratapsons': {
    dailyTokenLimit: 5_000_000,
    dailyCostLimit: 50.00, // USD
    maxTokensPerCall: 100_000,
    maxCostPerCall: 2.00,
    warnAt: 0.8,
    blockAt: 1.0,
  },

  // Per-agent budgets
  'agent:comment-mining': {
    dailyTokenLimit: 2_000_000,
    dailyCostLimit: 20.00,
    maxTokensPerCall: 50_000,
    maxCostPerCall: 1.00,
    warnAt: 0.8,
    blockAt: 1.0,
  },

  'agent:strategic-intel': {
    dailyTokenLimit: 1_000_000,
    dailyCostLimit: 15.00,
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
```

---

## 6. Observability & Traceability

### 6.1 Observability Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     OBSERVABILITY STACK                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                      COLLECTORS                             │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │     │
│  │  │  Logs    │  │  Metrics │  │  Traces  │  │  Events  │   │     │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │     │
│  └───────┼─────────────┼─────────────┼─────────────┼─────────┘     │
│          │             │             │             │                 │
│          ▼             ▼             ▼             ▼                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    CORRELATION ENGINE                        │   │
│  │            (Links all signals via correlationId)             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│       ┌──────────────────────┼──────────────────────┐              │
│       ▼                      ▼                      ▼              │
│  ┌──────────┐          ┌──────────┐          ┌──────────┐         │
│  │Dashboard │          │  Alerts  │          │  Search  │         │
│  └──────────┘          └──────────┘          └──────────┘         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Structured Logging

```typescript
// src/observability/logger.ts

interface LogContext {
  // Required
  correlationId: string;
  service: string;
  operation: string;

  // Optional context
  clientId?: string;
  accountId?: string;
  userId?: string;
  agentId?: string;

  // Timing
  durationMs?: number;

  // Errors
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class StructuredLogger {
  info(message: string, context: LogContext, data?: Record<string, any>) {
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      message,
      ...context,
      data,
    }));
  }

  error(message: string, context: LogContext, error: Error) {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      message,
      ...context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    }));
  }
}

// Usage
logger.info('Comment mining completed', {
  correlationId: ctx.correlationId,
  service: 'comment-mining',
  operation: 'analyze',
  clientId: 'pratapsons',
  accountId: 'act_123',
  durationMs: 45000,
}, {
  commentsAnalyzed: 200,
  patternsFound: 15,
  tokensUsed: 50000,
});
```

### 6.3 Metrics Collection

```typescript
// src/observability/metrics.ts

interface MetricsCollector {
  // Counters
  increment(metric: string, tags: Record<string, string>): void;

  // Gauges
  gauge(metric: string, value: number, tags: Record<string, string>): void;

  // Histograms
  histogram(metric: string, value: number, tags: Record<string, string>): void;

  // Timers
  timer(metric: string, durationMs: number, tags: Record<string, string>): void;
}

// Standard metrics every agent must emit
const REQUIRED_METRICS = [
  // Execution
  'agent.execution.count',      // Counter: executions
  'agent.execution.duration',   // Histogram: duration
  'agent.execution.errors',     // Counter: errors

  // LLM Usage
  'llm.calls.count',            // Counter: LLM calls
  'llm.tokens.input',           // Counter: input tokens
  'llm.tokens.output',          // Counter: output tokens
  'llm.cost.estimated',         // Counter: estimated cost

  // API Calls
  'api.calls.count',            // Counter: external API calls
  'api.calls.duration',         // Histogram: API latency
  'api.calls.errors',           // Counter: API errors

  // Queue
  'queue.depth',                // Gauge: queue size
  'queue.wait_time',            // Histogram: time in queue
];
```

### 6.4 Distributed Tracing

```typescript
// src/observability/tracing.ts

import { trace, SpanKind, Span } from '@opentelemetry/api';

const tracer = trace.getTracer('cosmisk');

// Every operation starts a span
async function analyzeComments(ctx: Context) {
  const span = tracer.startSpan('comment-mining.analyze', {
    kind: SpanKind.INTERNAL,
    attributes: {
      'correlation_id': ctx.correlationId,
      'client_id': ctx.clientId,
      'account_id': ctx.accountId,
    },
  });

  try {
    // Child span for LLM call
    const llmSpan = tracer.startSpan('llm.generate', {
      parent: span,
    });
    const response = await llmGateway.generate({ ... });
    llmSpan.setAttributes({
      'llm.tokens.input': response.inputTokens,
      'llm.tokens.output': response.outputTokens,
      'llm.provider': response.provider,
    });
    llmSpan.end();

    // Child span for database
    const dbSpan = tracer.startSpan('db.insert', {
      parent: span,
    });
    await db.insert('patterns', patterns);
    dbSpan.end();

    span.setStatus({ code: SpanStatusCode.OK });

  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

---

## 7. Safe Cron & Worker System

### 7.1 Cron Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CRON GOVERNANCE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     CRON REGISTRY                            │   │
│  │  - All jobs declared with metadata                           │   │
│  │  - Execution limits enforced                                 │   │
│  │  - Overlap prevention                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     JOB SCHEDULER                            │   │
│  │  - Distributed locking                                       │   │
│  │  - Priority queuing                                          │   │
│  │  - Resource allocation                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│       ┌──────────────────────┼──────────────────────┐              │
│       ▼                      ▼                      ▼              │
│  ┌──────────┐          ┌──────────┐          ┌──────────┐         │
│  │ Worker 1 │          │ Worker 2 │          │ Worker 3 │         │
│  │(isolated)│          │(isolated)│          │(isolated)│         │
│  └──────────┘          └──────────┘          └──────────┘         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Cron Registry

```typescript
// src/cron/registry.ts

interface CronJobConfig {
  // Identity
  id: string;
  name: string;
  description: string;
  owner: string;

  // Schedule
  schedule: string;  // Cron expression
  timezone: string;

  // Execution
  handler: string;   // Path to handler function
  timeout: number;   // Max execution time (ms)
  retries: number;   // Max retry attempts

  // Resources
  maxMemory: string;      // e.g., '512M'
  maxConcurrency: number; // Max parallel executions

  // Dependencies
  requiresDb: boolean;
  requiresLLM: boolean;
  requiresExternalAPIs: string[];

  // Safety
  idempotent: boolean;    // Safe to retry?
  allowOverlap: boolean;  // Can run if previous still running?
  priority: 'low' | 'normal' | 'high' | 'critical';

  // Notifications
  alertOnFailure: boolean;
  alertChannels: string[];
}

export const CRON_REGISTRY: CronJobConfig[] = [
  {
    id: 'watchdog-scan',
    name: 'Ad Account Watchdog',
    description: 'Scan all accounts for anomalies',
    owner: 'automation-team',

    schedule: '0 9 * * *',  // Daily at 9am
    timezone: 'Asia/Kolkata',

    handler: 'src/cron/handlers/watchdog-scan.ts',
    timeout: 300_000,  // 5 minutes
    retries: 2,

    maxMemory: '1G',
    maxConcurrency: 1,

    requiresDb: true,
    requiresLLM: true,
    requiresExternalAPIs: ['meta-api'],

    idempotent: true,
    allowOverlap: false,
    priority: 'high',

    alertOnFailure: true,
    alertChannels: ['slack:ops', 'email:oncall'],
  },

  {
    id: 'oos-detection',
    name: 'Out of Stock Detection',
    description: 'Check for ads running on OOS products',
    owner: 'automation-team',

    schedule: '0 */4 * * *',  // Every 4 hours
    timezone: 'Asia/Kolkata',

    handler: 'src/cron/handlers/oos-detection.ts',
    timeout: 600_000,  // 10 minutes
    retries: 3,

    maxMemory: '2G',
    maxConcurrency: 1,

    requiresDb: true,
    requiresLLM: false,
    requiresExternalAPIs: ['meta-api', 'shopify-api'],

    idempotent: true,
    allowOverlap: false,
    priority: 'critical',

    alertOnFailure: true,
    alertChannels: ['slack:ops', 'whatsapp:oncall'],
  },
];
```

### 7.3 Worker Isolation

```typescript
// src/cron/worker-pool.ts

interface WorkerConfig {
  // Isolation
  isolated: boolean;        // Run in separate process?
  memoryLimit: string;      // Memory limit
  cpuLimit: number;         // CPU cores

  // Timeout
  hardTimeout: number;      // Kill after this
  softTimeout: number;      // Warn after this

  // Queue
  queueName: string;
  priority: number;

  // Retry
  maxRetries: number;
  backoff: 'fixed' | 'exponential';
  backoffDelay: number;
}

class WorkerPool {
  async executeJob(
    job: CronJobConfig,
    context: ExecutionContext
  ): Promise<JobResult> {

    // 1. Acquire distributed lock
    const lock = await this.lockManager.acquire(job.id, job.timeout);
    if (!lock) {
      if (job.allowOverlap) {
        logger.warn('Job already running, but overlap allowed', { jobId: job.id });
      } else {
        logger.info('Job already running, skipping', { jobId: job.id });
        return { status: 'skipped', reason: 'already_running' };
      }
    }

    try {
      // 2. Start isolated worker
      const worker = await this.spawnWorker({
        handler: job.handler,
        memoryLimit: job.maxMemory,
        timeout: job.timeout,
        context,
      });

      // 3. Execute with timeout
      const result = await this.executeWithTimeout(
        worker,
        job.timeout,
        job.softTimeout
      );

      // 4. Record success
      await this.recordExecution(job.id, 'success', result);

      return result;

    } catch (error) {
      // 5. Handle failure
      await this.handleJobFailure(job, error, context);

      // 6. Retry if applicable
      if (context.attempt < job.retries) {
        await this.scheduleRetry(job, context.attempt + 1);
      }

      throw error;

    } finally {
      await lock?.release();
    }
  }
}
```

---

## 8. Claude Change Review System

### 8.1 Automated Review Pipeline

```yaml
# .github/workflows/claude-review.yml

name: Claude Code Review

on:
  pull_request:
    paths:
      - 'src/**'
      - 'package.json'

jobs:
  architecture-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Architecture Linting
        run: |
          # Check file size limits
          npm run lint:file-sizes

          # Check direct LLM calls (must use gateway)
          npm run lint:llm-gateway

          # Check for schema duplication
          npm run lint:schema-duplicates

          # Check circular dependencies
          npm run lint:circular-deps

          # Check observability coverage
          npm run lint:observability

          # Check cron registration
          npm run lint:cron-registry

  dependency-analysis:
    runs-on: ubuntu-latest
    steps:
      - name: Analyze dependencies
        run: |
          # Check for new dependencies
          npm run deps:check-new

          # Check for duplicate functionality
          npm run deps:check-duplicates

          # Check bundle size impact
          npm run deps:bundle-impact

          # Security audit
          npm audit

  cost-analysis:
    runs-on: ubuntu-latest
    steps:
      - name: Estimate LLM costs
        run: |
          # Find new LLM call sites
          npm run cost:find-llm-calls

          # Estimate token usage
          npm run cost:estimate-tokens

          # Check budget compliance
          npm run cost:check-budget

  modularity-score:
    runs-on: ubuntu-latest
    steps:
      - name: Calculate modularity
        run: |
          # Calculate coupling score
          npm run modularity:coupling

          # Calculate cohesion score
          npm run modularity:cohesion

          # Check service boundaries
          npm run modularity:boundaries
```

### 8.2 Architecture Linting Rules

```typescript
// scripts/lint-architecture.ts

const LINT_RULES = {
  // Rule 1: No direct LLM calls
  'no-direct-llm': {
    pattern: /new Anthropic|GoogleGenerativeAI|OpenAI/,
    message: 'Direct LLM instantiation detected. Use llmGateway instead.',
    allowedFiles: ['src/services/llm-gateway.ts'],
  },

  // Rule 2: No schema outside schema.ts
  'centralized-schema': {
    pattern: /sqliteTable\(|pgTable\(/,
    message: 'Schema definition outside schema.ts',
    allowedFiles: ['src/db/schema.ts'],
  },

  // Rule 3: No hardcoded credentials
  'no-hardcoded-secrets': {
    pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    message: 'Hardcoded API key detected',
    allowedFiles: [],
  },

  // Rule 4: Observability required
  'observability-required': {
    check: (file: string) => {
      const content = readFileSync(file, 'utf-8');
      const hasExport = /export (function|const|class)/.test(content);
      const hasLogging = /logger\.(info|error|warn|debug)/.test(content);
      return !hasExport || hasLogging;
    },
    message: 'Exported function missing logging',
  },

  // Rule 5: Cron must be registered
  'cron-registered': {
    check: (file: string) => {
      if (!file.includes('cron/handlers')) return true;
      const handlerName = basename(file, '.ts');
      const registry = readFileSync('src/cron/registry.ts', 'utf-8');
      return registry.includes(handlerName);
    },
    message: 'Cron handler not registered in registry',
  },

  // Rule 6: File size limits
  'file-size-limit': {
    check: (file: string) => {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;
      return lines <= 500;
    },
    message: 'File exceeds 500 line limit',
  },
};
```

### 8.3 Pre-Commit Hooks

```bash
#!/bin/bash
# .husky/pre-commit

echo "🔍 Running architecture checks..."

# Check file sizes
npx tsx scripts/check-file-sizes.ts
if [ $? -ne 0 ]; then
  echo "❌ File size limit exceeded"
  exit 1
fi

# Check LLM gateway compliance
npx tsx scripts/check-llm-gateway.ts
if [ $? -ne 0 ]; then
  echo "❌ Direct LLM calls detected (use llmGateway)"
  exit 1
fi

# Check schema centralization
npx tsx scripts/check-schema.ts
if [ $? -ne 0 ]; then
  echo "❌ Schema defined outside schema.ts"
  exit 1
fi

# Check observability
npx tsx scripts/check-observability.ts
if [ $? -ne 0 ]; then
  echo "❌ Missing observability (logging/tracing)"
  exit 1
fi

echo "✅ Architecture checks passed"
```

---

## 9. Developer + Claude Collaboration Model

### 9.1 The Collaboration Framework

```
┌─────────────────────────────────────────────────────────────────────┐
│                   DEVELOPER + CLAUDE WORKFLOW                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 1. DEVELOPER DEFINES INTENT                                  │   │
│  │    - What needs to be built                                  │   │
│  │    - Business requirements                                   │   │
│  │    - Constraints and limitations                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 2. CLAUDE READS GOVERNANCE                                   │   │
│  │    - ARCHITECTURE_GOVERNANCE.md                              │   │
│  │    - Service contracts                                       │   │
│  │    - Existing patterns                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 3. CLAUDE PROPOSES (not implements)                          │   │
│  │    - Impact analysis                                         │   │
│  │    - Files to create/modify                                  │   │
│  │    - Dependencies needed                                     │   │
│  │    - Cost estimate                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 4. DEVELOPER REVIEWS + APPROVES                              │   │
│  │    - Validates approach                                      │   │
│  │    - Flags concerns                                          │   │
│  │    - Approves implementation                                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 5. CLAUDE IMPLEMENTS                                         │   │
│  │    - Follows approved plan                                   │   │
│  │    - Adheres to governance rules                             │   │
│  │    - Includes observability                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 6. AUTOMATED VALIDATION                                      │   │
│  │    - Architecture linting                                    │   │
│  │    - Tests pass                                              │   │
│  │    - Governance compliance                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 7. DEVELOPER FINAL REVIEW + MERGE                            │   │
│  │    - Code review                                             │   │
│  │    - Merge approval                                          │   │
│  │    - Deploy decision                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Claude's Mandatory Checklist

Before writing code, Claude MUST:

```markdown
## Claude Pre-Implementation Checklist

### 1. Context Gathering
- [ ] Read ARCHITECTURE_GOVERNANCE.md
- [ ] Read relevant service contracts
- [ ] Understand existing patterns in codebase
- [ ] Identify affected services

### 2. Impact Analysis
- [ ] List files to create
- [ ] List files to modify
- [ ] List new dependencies
- [ ] List schema changes
- [ ] Estimate LLM token usage
- [ ] Estimate API calls

### 3. Governance Compliance
- [ ] Uses llmGateway for AI calls
- [ ] Uses centralized schema
- [ ] Includes logging/tracing
- [ ] File size under 500 lines
- [ ] No circular dependencies
- [ ] Cron jobs registered

### 4. Proposal
Before implementing, present:
- Summary of changes
- Impact assessment
- Risk level
- Alternative approaches considered
- Rollback strategy

Wait for developer approval before proceeding.
```

### 9.3 When to Escalate to Human

Claude MUST stop and ask for human guidance when:

```typescript
const ESCALATION_TRIGGERS = [
  // High-risk changes
  'Modifying authentication/authorization',
  'Changing database schema with existing data',
  'Modifying payment/billing logic',
  'Changing core infrastructure',

  // Governance violations
  'Change requires bypassing LLM gateway',
  'Change creates circular dependency',
  'Change exceeds file size limits',
  'Change affects multiple service boundaries',

  // Uncertainty
  'Multiple valid approaches exist',
  'Requirements are ambiguous',
  'Significant cost implications',
  'Breaking change to existing APIs',

  // New patterns
  'Introducing new technology/pattern',
  'Creating new service boundary',
  'Major architectural decision',
];
```

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

```
Priority 1: LLM Gateway
├── Create src/services/llm-gateway.ts
├── Add budget management
├── Add rate limiting
├── Add tracing
└── Migrate existing LLM calls

Priority 2: Architecture Linting
├── Create lint scripts
├── Add pre-commit hooks
├── Add CI pipeline
└── Document rules
```

### Phase 2: Observability (Week 3-4)

```
Priority 3: Structured Logging
├── Create logger service
├── Define log schemas
├── Add correlation IDs
└── Migrate existing logs

Priority 4: Metrics & Tracing
├── Add OpenTelemetry
├── Define standard metrics
├── Create dashboards
└── Set up alerts
```

### Phase 3: Agent Architecture (Week 5-6)

```
Priority 5: Agent Contracts
├── Define contract schema
├── Create contracts for existing agents
├── Implement validation
└── Add contract tests

Priority 6: Service Boundaries
├── Define service registry
├── Implement boundary checks
├── Add cross-service events
└── Document dependencies
```

### Phase 4: Cron & Workers (Week 7-8)

```
Priority 7: Cron Registry
├── Create registry
├── Register existing jobs
├── Add governance checks
└── Implement monitoring

Priority 8: Worker Isolation
├── Implement worker pool
├── Add distributed locking
├── Add retry logic
└── Add dead letter queue
```

---

## Quick Reference

### Do's
- Use llmGateway for all AI calls
- Define schemas in schema.ts only
- Include logging in all functions
- Register cron jobs in registry
- Define agent contracts
- Keep files under 500 lines

### Don'ts
- Direct LLM instantiation
- Schema definitions outside schema.ts
- Silent failures (always log)
- Unregistered cron jobs
- Circular dependencies
- God files / god functions

### Key Files
- `ARCHITECTURE_GOVERNANCE.md` — This document
- `src/services/llm-gateway.ts` — Central AI gateway
- `src/db/schema.ts` — All database schemas
- `src/cron/registry.ts` — All cron jobs
- `src/agents/contracts/` — Agent contracts
- `src/services/service-registry.ts` — Service boundaries

---

**This is a living document. Update it as architecture evolves.**
