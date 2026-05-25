# Cosmisk Documentation Index

**Last Updated:** May 20, 2026

This is the master index of all documentation for the Cosmisk project.

---

## Quick Links

| What You Need | Where To Find It |
|---------------|------------------|
| **Architecture Overview** | `cosmisk-wiki/architecture/` |
| **Quality Standards** | `cosmisk-wiki/strategic/ANTI_PATTERNS.md` |
| **Agent Inventory** | `cosmisk-wiki/agents/inventory.md` |
| **Client Data** | `cosmisk-wiki/clients/{client-name}.md` |
| **Current Sprint** | `cosmisk-wiki/current/sprint.md` |
| **Known Blockers** | `cosmisk-wiki/current/blockers.md` |
| **Developer Handoff** | `server/DEVELOPER_HANDOFF_DOCUMENT.md` |

---

## 1. Wiki Documentation (`/cosmisk-wiki/`)

### Architecture (`/cosmisk-wiki/architecture/`)
- `agent-infrastructure-layers.md` - How agents are structured
- `evidence-providers.md` - Data collection system
- `strategic-cognition.md` - AI reasoning architecture
- `governance-status.md` - Current governance state
- `memory-system.md` - Memory architecture
- `VISUAL_CREATIVE_MEMORY_SYSTEM.md` - Creative memory design
- `clean-architecture-blueprint.md` - Target architecture
- `shopify-onboarding.md` - Shopify integration design
- `catalog-oos-detection.md` - Out-of-stock detection
- `collection-oos-detection.md` - Collection OOS
- `verification-gap.md` - Known verification gaps

### Strategic (`/cosmisk-wiki/strategic/`)
- `ANTI_PATTERNS.md` - What NOT to do (quality rules)
- `QUALITY_CRISIS_AUDIT.md` - Known quality issues
- `FOUNDER_DIRECTIVES.md` - Business rules
- `BRUTAL_AUDIT_2026-05-16.md` - Honest assessment

### Product (`/cosmisk-wiki/product/`)
- `CLIENT_EXPERIENCE_LAYER.md` - UX design
- `WHAT_CLIENT_SEES.md` - Output examples

### Clients (`/cosmisk-wiki/clients/`)
- `pratapsons.md` - Pratapsons Jewels client
- `human-and-the-beast.md` - HATB pet brand client
- `casorro.md` - Casorro client
- `_template.md` - Template for new clients

### Current State (`/cosmisk-wiki/current/`)
- `sprint.md` - Current work
- `blockers.md` - Known blockers
- `decisions.md` - Recent decisions
- `pending-items.md` - Pending work

### Patterns (`/cosmisk-wiki/patterns/`)
- `what-works.md` - Proven patterns
- `what-fails.md` - Anti-patterns
- `predictions.md` - Prediction tracking
- `llm-reasoning.md` - LLM behavior patterns

### Systems (`/cosmisk-wiki/systems/`)
- `oos-system-honest-assessment.md` - OOS system status
- `approval-queue-system.md` - Approval queue design
- `viral-content-intelligence.md` - Viral system
- `viral-trend-radar.md` - Trend radar

### Business (`/cosmisk-wiki/business/`)
- `positioning.md` - Market positioning
- `service-model.md` - Service model
- `the-gap.md` - Core value prop
- `linkedin-strategy.md` - LinkedIn content
- `instagram-strategy.md` - Instagram content

### Agents (`/cosmisk-wiki/agents/`)
- `inventory.md` - All agents and their status

---

## 2. Server Documentation (`/server/`)

| Document | Purpose |
|----------|---------|
| `DEVELOPER_HANDOFF_DOCUMENT.md` | Complete technical handoff |
| `CLAUDE.md` (root) | Entry point, routing |

---

## 3. Dev Reports (On GitHub)

**Branch:** `analysis-and-cleanup`
**Path:** `/dev_reports/`

Contains:
- Codebase audit analysis
- Risk summaries
- Cleanup progress

**GitHub URL:** https://github.com/vishant-art/Cosmisk/tree/analysis-and-cleanup/dev_reports

---

## 4. Generated Reports (`/server/`)

Client-specific HTML reports:
- `HATB-FOUNDER-INTELLIGENCE-AUDIT.html` - Human & Beast audit
- `HATB-FOUNDER-INTELLIGENCE-AUDIT.pdf` - PDF version
- Various `*-report-*.html` files - Client reports

---

## 5. Key Entry Points

### For Understanding Architecture
1. Start with `CLAUDE.md` (root)
2. Then `cosmisk-wiki/architecture/agent-infrastructure-layers.md`
3. Then `cosmisk-wiki/agents/inventory.md`

### For Understanding Quality Standards
1. `cosmisk-wiki/strategic/ANTI_PATTERNS.md`
2. `cosmisk-wiki/strategic/QUALITY_CRISIS_AUDIT.md`

### For Client Context
1. `cosmisk-wiki/clients/{client-name}.md`

### For Current Work
1. `cosmisk-wiki/current/sprint.md`
2. `cosmisk-wiki/current/blockers.md`

---

## 6. Code Documentation

### LLM Gateway (Critical)
**File:** `server/src/services/llm-gateway.ts`

All AI calls should go through this. See `DEVELOPER_HANDOFF_DOCUMENT.md` for list of files that currently bypass it.

### Database Schema
**File:** `server/src/db/schema.ts`

Single source of truth for all database tables.

---

*This index is the answer to "where is everything being recorded"*
