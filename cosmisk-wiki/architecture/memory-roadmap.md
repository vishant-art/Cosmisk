# Memory System Roadmap

> Last Updated: 2026-05-17 (Session 10)

## Current State: 9/95+ Agents Wired

### Wired Agents (9)
Main client-facing agents that run on schedules:

| Agent | File | Memory Type |
|-------|------|-------------|
| Ad Watchdog | `ad-watchdog.ts` | Episodes + Reports |
| Comment Mining | `comment-mining-agent.ts` | Episodes + Patterns |
| Strategic Intelligence | `strategic-intelligence-engine.ts` | Reports |
| Fatigue Detector | `fatigue-detector.ts` | Episodes + Reports |
| OOS Detector | `oos-detector.ts` | Episodes + Reports |
| Discount Leakage | `discount-leakage-detector.ts` | Episodes + Reports |
| Organic-Paid Intel | `organic-paid-intelligence.ts` | Episodes |
| Cohort LTV | `cohort-ltv-analyzer.ts` | Episodes + Reports |
| Creative Scorer | `creative-scorer.ts` | Episodes + Reports |

### NOT Wired (80+)
Mostly in `leverage-systems/` folder + scattered services:
- `signal-discovery/` agents
- `brand-persona-intelligence.ts`
- `creative-analyzer.ts`
- `health-score.ts`
- `quick-wins.ts`
- `agent-chains.ts`
- `active-agents/` folder
- And many more...

---

## What to Build (Priority Order)

### 1. Agent Registry Pattern (Foundation)
**Effort:** 2 hours | **Coverage:** 80%+

Instead of wiring 80+ files manually, build ONE central hook:

```typescript
// server/src/services/agent-registry.ts

import { getStrategicContextForAgent, recordReport, type ReportRecord } from './strategic-memory.js';
import { recordEpisode } from './agent-memory.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

interface AgentRunOptions {
  agentName: string;
  clientId: string;
  agentType: AgentType;  // 'watchdog' | 'content' | 'audience' | etc.
  recordReport?: boolean;
}

export async function wrapWithMemory<T>(
  options: AgentRunOptions,
  fn: () => Promise<T>
): Promise<T> {
  const { agentName, clientId, agentType, recordReport: shouldRecord = true } = options;

  // Load strategic context
  const context = getStrategicContextForAgent(clientId);
  if (context) {
    logger.info({ agentName, contextLength: context.length }, '[AgentRegistry] Loaded context');
  }

  const startTime = Date.now();

  try {
    // Run the agent
    const result = await fn();

    // Record episode
    const duration = Date.now() - startTime;
    recordEpisode(
      'system',
      agentType,
      `${agentName} completed for ${clientId} (${duration}ms)`,
      JSON.stringify({ result: typeof result, duration }),
      'success'
    ).catch(err => logger.warn({ err }, `[AgentRegistry] Episode recording failed for ${agentName}`));

    // Record report if enabled
    if (shouldRecord) {
      const now = new Date();
      const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
      const reportRecord: ReportRecord = {
        id: uuidv4(),
        clientId,
        reportType: agentName,
        generatedAt: now.toISOString(),
        weekNumber,
        year: now.getFullYear(),
        headline: `${agentName} run completed`,
        keyInsights: [],
        recommendations: [],
        metricsSnapshot: { duration },
        qualityScore: 70,
        wasShipped: false,
        shipDecision: 'HOLD',
        deliveredVia: [],
      };
      recordReport(reportRecord);
    }

    return result;
  } catch (error) {
    // Record failure episode
    recordEpisode(
      'system',
      agentType,
      `${agentName} FAILED for ${clientId}: ${error instanceof Error ? error.message : 'Unknown'}`,
      JSON.stringify({ error: String(error) }),
      'failed'
    ).catch(() => {});

    throw error;
  }
}
```

**Usage in any agent:**
```typescript
// Before
const result = await runHealthScore(clientId, options);

// After
const result = await wrapWithMemory(
  { agentName: 'health-score', clientId, agentType: 'watchdog' },
  () => runHealthScore(clientId, options)
);
```

---

### 2. Prediction Auto-Verification
**Effort:** 4 hours | **Gap:** -10 points

```typescript
// server/src/services/prediction-verifier.ts

import { getPendingPredictions, verifyPrediction } from './strategic-memory.js';
import { fetchMetaInsights } from './meta-api.js';
import { fetchShopifyMetrics } from './shopify-client.js';

interface MetricFetcher {
  roas: (clientId: string, entityId: string) => Promise<number | null>;
  spend: (clientId: string, entityId: string) => Promise<number | null>;
  revenue: (clientId: string, entityId: string) => Promise<number | null>;
  conversions: (clientId: string, entityId: string) => Promise<number | null>;
}

const metricFetchers: MetricFetcher = {
  roas: async (clientId, entityId) => {
    const insights = await fetchMetaInsights(clientId, entityId, 'last_7d');
    return insights?.roas || null;
  },
  spend: async (clientId, entityId) => {
    const insights = await fetchMetaInsights(clientId, entityId, 'last_7d');
    return insights?.spend || null;
  },
  revenue: async (clientId, entityId) => {
    const shopify = await fetchShopifyMetrics(clientId, 7);
    return shopify?.revenue || null;
  },
  conversions: async (clientId, entityId) => {
    const insights = await fetchMetaInsights(clientId, entityId, 'last_7d');
    return insights?.purchases || null;
  },
};

export async function verifyPendingPredictions(clientId: string): Promise<{
  verified: number;
  correct: number;
  incorrect: number;
  skipped: number;
}> {
  const predictions = getPendingPredictions(clientId);
  let verified = 0, correct = 0, incorrect = 0, skipped = 0;

  for (const pred of predictions) {
    const data = JSON.parse(pred.data_json);
    const fetcher = metricFetchers[data.metricType as keyof MetricFetcher];

    if (!fetcher) {
      skipped++;
      continue;
    }

    const actual = await fetcher(clientId, data.entityId);

    if (actual === null) {
      skipped++;
      continue;
    }

    const tolerance = 0.2; // 20%
    const wasCorrect = Math.abs(actual - data.expectedValue) / data.expectedValue <= tolerance;

    verifyPrediction(pred.id, actual, wasCorrect);
    verified++;

    if (wasCorrect) correct++;
    else incorrect++;
  }

  return { verified, correct, incorrect, skipped };
}

// Schedule: Run every 6 hours
// Add to memory-maintenance.ts scheduler
```

---

### 3. Cross-Client Learning
**Effort:** 6 hours | **Gap:** -10 points

```typescript
// server/src/services/pattern-transfer.ts

import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';

interface GlobalPattern {
  id: string;
  pattern: string;
  confidence: number;
  sourceClientCount: number;
  createdAt: string;
  category: 'oos' | 'fatigue' | 'ltv' | 'creative' | 'discount' | 'general';
}

// Promote pattern to global when seen in 3+ clients with 90%+ confidence
export function promotePatternToGlobal(
  pattern: string,
  category: GlobalPattern['category'],
  confidence: number
): boolean {
  const db = getDb();

  // Count how many clients have this pattern
  const clientCount = db.prepare(`
    SELECT COUNT(DISTINCT client_id) as count
    FROM running_context
    WHERE json_extract(data_json, '$.learnedPatterns') LIKE ?
  `).get(`%${pattern}%`) as { count: number };

  if (clientCount.count >= 3 && confidence >= 90) {
    // Check if already exists
    const existing = db.prepare(`
      SELECT id FROM global_patterns WHERE pattern = ?
    `).get(pattern);

    if (!existing) {
      db.prepare(`
        INSERT INTO global_patterns (id, pattern, category, confidence, source_client_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `gp_${Date.now()}`,
        pattern,
        category,
        confidence,
        clientCount.count,
        new Date().toISOString()
      );

      logger.info({ pattern, category, confidence, clientCount: clientCount.count },
        '[PatternTransfer] Promoted pattern to global');
      return true;
    }
  }

  return false;
}

// Get global patterns for context injection
export function getGlobalPatterns(category?: GlobalPattern['category']): GlobalPattern[] {
  const db = getDb();

  const query = category
    ? `SELECT * FROM global_patterns WHERE category = ? ORDER BY confidence DESC`
    : `SELECT * FROM global_patterns ORDER BY confidence DESC`;

  const rows = category
    ? db.prepare(query).all(category)
    : db.prepare(query).all();

  return rows as GlobalPattern[];
}

// Inject global patterns into new client context
export function getContextWithGlobalPatterns(clientId: string): string {
  const clientContext = getStrategicContextForAgent(clientId);
  const globalPatterns = getGlobalPatterns();

  if (globalPatterns.length === 0) {
    return clientContext || '';
  }

  const globalSection = `
## Cross-Client Learnings (${globalPatterns.length} patterns)
${globalPatterns.map(p => `- [${p.category}] ${p.pattern} (${p.confidence}% confidence, seen in ${p.sourceClientCount} clients)`).join('\n')}
`;

  return clientContext ? `${clientContext}\n\n${globalSection}` : globalSection;
}

// Database schema addition needed:
// CREATE TABLE global_patterns (
//   id TEXT PRIMARY KEY,
//   pattern TEXT NOT NULL,
//   category TEXT NOT NULL,
//   confidence REAL NOT NULL,
//   source_client_count INTEGER NOT NULL,
//   created_at TEXT NOT NULL
// );
```

---

### 4. Active Memory Usage
**Effort:** 4 hours | **Gap:** -5 points

Change agents from "load and ignore" to "load and act":

```typescript
// server/src/services/memory-actions.ts

interface MemoryAction {
  pattern: string;
  action: (params: any) => void;
}

const memoryActions: MemoryAction[] = [
  {
    pattern: 'OOS products correlate with wasted spend',
    action: (params) => {
      params.oosCheckWeight = 1.5; // Increase OOS priority
    }
  },
  {
    pattern: 'Budget increases failed',
    action: (params) => {
      params.budgetConfidenceThreshold = 0.9; // Be more conservative
    }
  },
  {
    pattern: 'Frequency threshold too aggressive',
    action: (params) => {
      params.frequencyThreshold = Math.min(params.frequencyThreshold + 0.5, 5.0);
    }
  },
  {
    pattern: 'Creative fatigue detected early',
    action: (params) => {
      params.fatigueCheckDays = 5; // Check more frequently
    }
  },
];

export function applyMemoryActions(context: string | null, params: Record<string, any>): void {
  if (!context) return;

  for (const { pattern, action } of memoryActions) {
    if (context.includes(pattern)) {
      action(params);
    }
  }
}

// Usage in ad-watchdog.ts:
const context = getStrategicContextForAgent(clientId);
const params = { oosCheckWeight: 1.0, budgetConfidenceThreshold: 0.7 };
applyMemoryActions(context, params);
// Now params are adjusted based on learned patterns
```

---

## Implementation Priority

| Build | Effort | Impact | Order | Status |
|-------|--------|--------|-------|--------|
| Agent Registry Pattern | 2 hours | 80%+ agents covered | 1 | **DONE** ✅ |
| Active Memory Usage | 4 hours | Agents actually learn | 2 | **DONE** ✅ (in Registry) |
| Auto-wrap Orchestrator | 1 hour | ALL orchestrated agents get memory | 2.5 | **DONE** ✅ |
| Integration Tests | 1 hour | Verify with real data | 2.6 | **DONE** ✅ (Pratapsons) |
| Prediction Auto-Verification | 4 hours | Close 10-point gap | 3 | **DONE** ✅ |
| Cross-Client Learning | 6 hours | Close 10-point gap | 4 | **DONE** ✅ |

**Total Effort:** ~10 hours remaining to reach 95/100

---

## Assessment Progression

| Session | Score | Agents Wired | Notes |
|---------|-------|--------------|-------|
| Before Session 9 | 15/100 | 0/9 | All designed, nothing wired |
| After Session 9 | 45/100 | 3/9 | Core 3 agents wired |
| After Session 10 | 75/100 | 9/9 | All main agents wired |
| After Roadmap | 95/100 | 95/95+ | Full system operational |

---

## Key Files

```
server/src/services/agent-registry.ts       - Wrapper pattern (TO BUILD)
server/src/services/prediction-verifier.ts  - Auto-verification (TO BUILD)
server/src/services/pattern-transfer.ts     - Cross-client (TO BUILD)
server/src/services/memory-actions.ts       - Active usage (TO BUILD)
server/src/services/agent-memory.ts         - Episode CRUD (EXISTS)
server/src/services/strategic-memory.ts     - Reports/predictions (EXISTS)
server/src/services/memory-maintenance.ts   - Scheduler (EXISTS)
```

---

## Related

- [[memory-system]]
- [[sprint]]
- [[evidence-providers]]
