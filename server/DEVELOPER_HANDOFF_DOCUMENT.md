# Cosmisk Developer Handoff Document

**Date:** May 20, 2026
**Purpose:** Complete technical handoff for the development team to understand what was built, architectural intentions, known issues, and remediation guidance.

---

## 1. Executive Summary

This document provides complete context for the cleanup and production-readiness work. It maps:
- What services exist and their purpose
- Architectural intentions vs current reality
- Known violations that need fixing
- All documentation locations
- Specific files that need attention

---

## 2. Architecture: Intended vs Reality

### 2.1 LLM Gateway (CRITICAL)

**Intended Architecture:**
```
All AI Calls → llm-gateway.ts → Anthropic/Gemini APIs
                    ↓
              Budget Control
              Rate Limiting
              Cost Tracking
              Usage Analytics
```

**File:** `server/src/services/llm-gateway.ts`

**Purpose:** Centralized AI call management with:
- Per-client budget limits
- Per-agent budget limits
- Rate limiting
- Distributed tracing
- Fallback routing
- Cost estimation

**Reality (VIOLATION):** 16 services bypass the gateway and call Anthropic directly:

| File | Status | Priority to Fix |
|------|--------|-----------------|
| `viral-content-intelligence.ts` | BYPASSES GATEWAY | P0 |
| `comment-mining-agent.ts` | BYPASSES GATEWAY | P0 |
| `competitor-creative-intel.ts` | BYPASSES GATEWAY | P0 |
| `creative-detection.ts` | BYPASSES GATEWAY | P0 |
| `stateful-intelligence.ts` | BYPASSES GATEWAY | P0 |
| `build-gate.ts` | BYPASSES GATEWAY | P1 |
| `morning-briefing.ts` | BYPASSES GATEWAY | P1 |
| `creative-strategist.ts` | BYPASSES GATEWAY | P1 |
| `report-agent.ts` | BYPASSES GATEWAY | P1 |
| `creative-analyzer.ts` | BYPASSES GATEWAY | P1 |
| `autopilot-engine.ts` | BYPASSES GATEWAY | P0 (runs on cron) |
| `agent-memory.ts` | BYPASSES GATEWAY | P1 |
| `sales-agent.ts` | BYPASSES GATEWAY | P2 |
| `content-agent.ts` | BYPASSES GATEWAY | P2 |
| `sprint-planner.ts` | BYPASSES GATEWAY | P2 |

**Fix Required:** Replace `new Anthropic()` with `llmGateway.call()` in all files.

---

### 2.2 Database Schema

**Intended:** Single source of truth in `server/src/db/schema.ts`

**Reality (VIOLATION):** `shopify_tokens` table defined in two places:
1. `server/src/db/schema.ts`
2. `server/src/services/shopify-client.ts` (or similar)

**Fix Required:** Remove duplicate definition, use single schema file.

---

### 2.3 Cron/Automation Architecture

**Intended:** Background jobs should run in isolated process/worker

**Reality (VIOLATION):** Cron jobs run in same process as API server:
- `autopilot-engine.ts` - runs every 4 hours
- `ad-watchdog.ts` - runs every 6 hours

**Risk:** Long-running AI calls block the web API, causing timeouts for users.

**Fix Required:**
- Option A: Move crons to separate worker process
- Option B: Use job queue (BullMQ) with separate workers
- Option C: At minimum, reduce frequency and add timeouts

---

## 3. Service Inventory

### 3.1 Core Services (Stable)

| Service | Purpose | Gateway Compliant |
|---------|---------|-------------------|
| `llm-gateway.ts` | Centralized AI calls | N/A (is the gateway) |
| `token-crypto.ts` | Token encryption | N/A (no AI) |
| `meta-api.ts` | Meta/Facebook API | N/A (no AI) |
| `shopify-client.ts` | Shopify API | N/A (no AI) |
| `email.ts` | Email sending | N/A (no AI) |
| `notifications.ts` | Notification dispatch | N/A (no AI) |

### 3.2 Intelligence Agents (Need Gateway Migration)

| Service | Purpose | Lines | Gateway Status |
|---------|---------|-------|----------------|
| `competitor-creative-intel.ts` | Competitor ad analysis | 2,614 | BYPASS - P0 |
| `comment-mining-agent.ts` | Comment sentiment | ~500 | BYPASS - P0 |
| `viral-content-intelligence.ts` | Viral trend detection | ~400 | BYPASS - P0 |
| `autopilot-engine.ts` | Automated recommendations | ~800 | BYPASS - P0 |
| `creative-analyzer.ts` | Creative performance | ~300 | BYPASS - P1 |

### 3.3 Operator Scripts (Backdoor Risk)

Located in `server/scripts/` - these bypass JWT authentication and rate limiting:

| Script | Purpose | Risk |
|--------|---------|------|
| `generate-pratapsons-report.mjs` | Client reports | No auth |
| `test-*.mjs` | Various tests | No auth, no cost tracking |
| `run-*.mjs` | Run agents | No auth, no cost tracking |

**Fix Required:** Either:
- Add authentication to scripts
- Track script usage separately
- Restrict script access

---

## 4. Routes Inventory

### 4.1 Core Routes (Production Ready)

| Route | File | Purpose |
|-------|------|---------|
| `/auth` | `auth.ts` | Authentication |
| `/brands` | `brands.ts` | Brand management |
| `/campaigns` | `campaigns.ts` | Campaign CRUD |
| `/ad-accounts` | `ad-accounts.ts` | Ad account management |

### 4.2 Intelligence Routes (Need Review)

| Route | File | Purpose | Status |
|-------|------|---------|--------|
| `/intelligence` | `intelligence.ts` | AI insights | Uses agents that bypass gateway |
| `/autopilot` | `autopilot.ts` | Automation | Cron + gateway bypass |
| `/competitor-spy` | `competitor-spy.ts` | Competitor intel | Gateway bypass |
| `/comment-mining` | `comment-mining.ts` | Comment analysis | Gateway bypass |
| `/worldview` | `worldview.ts` | Strategic synthesis | Gateway bypass |

### 4.3 New Routes (From Recent Commits)

| Route | File | Purpose | Added |
|-------|------|---------|-------|
| `/ad-command` | `ad-command.ts` | Ad command dashboard | Apr-May 2026 |
| `/shopify` | `shopify.ts` | Shopify integration | Apr-May 2026 |
| `/viral-radar` | `viral-radar.ts` | Viral trends | Apr-May 2026 |
| `/viral-intel` | `viral-intel.ts` | Viral intelligence | Apr-May 2026 |

---

## 5. Documentation Locations

### 5.1 Wiki (Primary Documentation)

**Location:** `/cosmisk-wiki/`

| Category | Files | Purpose |
|----------|-------|---------|
| **Architecture** | `architecture/*.md` | System design docs |
| **Strategic** | `strategic/*.md` | Quality standards, anti-patterns |
| **Product** | `product/*.md` | Client experience design |
| **Clients** | `clients/*.md` | Per-client context |
| **Patterns** | `patterns/*.md` | What works/fails |
| **Systems** | `systems/*.md` | System-specific docs |
| **Learnings** | `learnings/*.md` | Development journey |

### 5.2 Key Architecture Docs

| Document | Path | Purpose |
|----------|------|---------|
| Quality Standards | `strategic/ANTI_PATTERNS.md` | What NOT to do |
| Quality Crisis | `strategic/QUALITY_CRISIS_AUDIT.md` | Known quality issues |
| Agent Inventory | `agents/inventory.md` | All agents and their status |
| Memory System | `architecture/VISUAL_CREATIVE_MEMORY_SYSTEM.md` | Memory architecture |
| Client Experience | `product/CLIENT_EXPERIENCE_LAYER.md` | UX design |
| Evidence Providers | `architecture/evidence-providers.md` | Data collection |
| Strategic Cognition | `architecture/strategic-cognition.md` | AI reasoning |
| Governance Status | `architecture/governance-status.md` | Current governance state |

### 5.3 CLAUDE.md (Entry Point)

**Location:** `/CLAUDE.md`

This is the main entry point that routes to wiki pages. Contains:
- Quality gate (3 questions)
- Context routing table
- Current state summary
- Architecture rules

---

## 6. Risk Mapping (From Audit)

| Audit Risk | Files Affected | Remediation |
|------------|----------------|-------------|
| **Risk H: God-File** | `competitor-creative-intel.ts` (2,614 LOC) | Split into modules |
| **Risk I: Gateway Bypass** | 16 files listed above | Wrap in llmGateway |
| **Risk J: Cron in API** | `autopilot-engine.ts`, `index.ts` | Isolate workers |
| **Risk K: Schema Drift** | `schema.ts`, `shopify-client.ts` | Single source |
| **Risk L: Script Backdoors** | `server/scripts/*.mjs` | Add auth/tracking |

---

## 7. Database Tables

### 7.1 Current Schema (from `schema.ts`)

| Table | Purpose |
|-------|---------|
| `users` | User accounts |
| `brands` | Brand/client entities |
| `ad_accounts` | Connected ad accounts |
| `meta_tokens` | Encrypted Meta access tokens |
| `shopify_tokens` | Shopify OAuth tokens |
| `agent_memory` | AI agent memory storage |
| `recommendations` | Generated recommendations |
| `approvals` | Human approval queue |

### 7.2 Schema Drift Warning

Check for duplicate definitions in:
- `shopify-client.ts`
- `agent-memory.ts`
- Any service that creates its own tables

---

## 8. Environment Variables Required

```env
# Core
DATABASE_URL=
PORT=

# Auth
JWT_SECRET=
TOKEN_ENCRYPTION_KEY=

# Meta
META_APP_ID=
META_APP_SECRET=

# Shopify
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=

# AI (CRITICAL - Cost Control)
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=

# Optional
SLACK_BOT_TOKEN=
APIFY_API_KEY=
```

---

## 9. Immediate Action Items

### P0 - Critical (Do First)

1. **Route all AI calls through llmGateway**
   - Files: See Section 2.1 (16 files)
   - Pattern: Replace `new Anthropic()` with `llmGateway.call()`
   - Impact: Prevents billing blowout

2. **Fix schema drift**
   - Check `shopify_tokens` definition
   - Single source in `schema.ts`

### P1 - High (Do Next)

3. **Isolate cron jobs**
   - Move `autopilot-engine` to separate process
   - Add proper timeout handling

4. **Add script governance**
   - Log all script executions
   - Add cost tracking for scripts

### P2 - Medium (Can Wait)

5. **Break down god-files**
   - `competitor-creative-intel.ts` → split into modules

6. **Python scraper governance**
   - Version pin dependencies
   - Add to CI/CD

---

## 10. Testing Guidance

### 10.1 Server Start

```bash
cd server
npm install
npm run build
npm run start
```

**If server fails:** Check:
1. DATABASE_URL is set
2. All required env vars present
3. No TypeScript compilation errors

### 10.2 Key Endpoints to Test

```bash
# Health check
curl http://localhost:3000/health

# Auth (should fail without token)
curl http://localhost:3000/api/brands

# Intelligence (uses AI - watch costs)
curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/intelligence/run
```

---

## 11. Contact & Handoff Notes

**What was being worked on:**
- Human and the Beast (HATB) client audit
- Client reports and intelligence generation
- Viral content intelligence features

**What was NOT touched:**
- Frontend code
- Authentication system
- Billing system

**Key Design Decisions:**
1. All intelligence should be "specific, causal, actionable"
2. No mediocre outputs - reject rather than log
3. Quality gate before any client-facing content

---

## 12. Git Branch Status

**Main Branch:** Has all recent changes (Apr 26 - May 20)

**analysis-and-cleanup Branch:** Dev team's cleanup work

**Recommendation:**
- Dev team continues on `analysis-and-cleanup`
- No new code changes to `main` until cleanup merges
- All new feature work goes through PR review

---

*Document generated: May 20, 2026*
*For questions: Refer to wiki documentation or CLAUDE.md*
