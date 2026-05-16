# Memory System Architecture

> Last Updated: 2026-05-17 (Session 10 - Full Memory Wiring Complete)

## Overview

The memory system enables agents to learn from past decisions, avoid repeating mistakes, and build continuity week-over-week. It consists of three layers:

1. **Agent Memory** - Episodic learning with decay (`agent-memory.ts`)
2. **Strategic Memory** - Week-to-week continuity (`strategic-memory.ts`)
3. **Memory Maintenance** - Automated decay/cleanup (`memory-maintenance.ts`)

---

## Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `agent_episodes` | Individual agent decisions | event, outcome, relevance (0-1) |
| `strategic_reports` | Weekly report summaries | clientId, reportType, summary |
| `strategic_recommendations` | Pending/implemented recs | status, actualOutcome |
| `strategic_predictions` | Testable predictions | expectedValue, actualValue, wasCorrect |
| `running_context` | Live client state | currentFocus, knownIssues, learnedPatterns |

---

## How It Works

### Episode Recording
```typescript
// After any agent decision:
recordEpisode(userId, clientId, 'budget', {
  event: 'Recommended 20% budget increase',
  outcome: 'pending',
  context: { roas: 3.2, spend: 50000 }
});
```

### Strategic Context Loading
```typescript
// At start of agent run:
const context = getStrategicContextForAgent(clientId);
// Returns: "Previous reports... Known issues... Learned patterns..."
```

### Memory Decay
- **Daily**: Relevance decays by 5% for episodes older than 7 days
- **Weekly**: Prune episodes with relevance < 0.1
- **Weekly**: Compress old reports into summaries

---

## Wired Agents

| Agent | Memory Type | What Gets Saved |
|-------|-------------|-----------------|
| `ad-watchdog` | Episodes + Reports | Budget decisions, OOS alerts |
| `comment-mining-agent` | Episodes + Patterns | Comment themes, sentiment shifts |
| `strategic-intelligence-engine` | Reports | Weekly intel summaries |
| `fatigue-detector` | Episodes + Reports | Fatigued creatives, frequency alerts |
| `oos-detector` | Episodes + Reports | OOS products, wasted spend alerts |
| `discount-leakage-detector` | Episodes + Reports | Leaked codes, revenue loss alerts |
| `organic-paid-intelligence` | Episodes | High CCP content discoveries |
| `cohort-ltv-analyzer` | Episodes + Reports | LTV gaps, channel performance |
| `creative-scorer` | Episodes + Reports | Creative scores, below-threshold alerts |

---

## API Endpoints

```
GET  /api/memory/status/:clientId     - Full memory status
GET  /api/memory/reports/:clientId    - Recent reports
GET  /api/memory/recommendations/:clientId - Rec history
POST /api/memory/recommendations/:recId/outcome - Record outcome
GET  /api/memory/predictions/:clientId - Pending predictions
POST /api/memory/predictions/:predId/verify - Verify prediction
GET  /api/memory/context/:clientId    - Raw strategic context
GET  /api/memory/maintenance/status   - Scheduler status
POST /api/memory/maintenance/run      - Trigger maintenance
```

---

## Client Portal

Password-protected HTML reports at `/portal/:clientId`:

```
GET /portal/:clientId           - Report list (requires ?password=)
GET /portal/:clientId/:reportId - Single report view
```

Default password: `cosmisk2024` (override with `CLIENT_PORTAL_PASSWORD` env)

---

## Maintenance Schedule

| Job | Schedule | What It Does |
|-----|----------|--------------|
| Decay | Daily 3 AM IST | Reduce old episode relevance |
| Predictions | Every 6 hours | Check if predictions can be verified |
| Cleanup | Sunday 4 AM IST | Prune low-relevance episodes |

---

## Current Gaps (To Fix)

1. **Cross-client learning** - Patterns don't transfer between clients
2. **Client-visible history** - Portal is basic, needs richer timeline
3. **Prediction auto-verification** - Still manual, needs metric hooks

~~4. **6 leverage-systems agents** - Not wired to memory yet~~ **DONE (Session 10)**

---

## Key Files

```
server/src/services/agent-memory.ts      - Episode CRUD
server/src/services/strategic-memory.ts  - Reports/predictions
server/src/services/memory-maintenance.ts - Scheduler
server/src/routes/memory.ts              - API routes
server/src/routes/client-portal.ts       - HTML portal
```
