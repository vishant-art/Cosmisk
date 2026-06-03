# COSMISK — Thin Context Architecture

> ~1K tokens. References only. Full context in `cosmisk-wiki/` + `dev_reports/`.

---

## CODE FREEZE — external contributors

Production hardening in progress. If you are **not a core maintainer**: do **not** directly edit `server/src/`, the DB schema, routes/services, or dependencies. Propose via an issue/PR; maintainers implement. Maintainer work happens on dedicated branches, verified against the **Test Invariant** below.

---

## QUALITY GATE (3 questions before ANY output)

1. **Specific?** — names the actual creative/campaign, not "your ads"
2. **Causal?** — explains WHY, not just WHAT
3. **Actionable?** — founder can act within 48h

**If NO → DO NOT SHIP.** Full standards: `cosmisk-wiki/strategic/ANTI_PATTERNS.md`

## AGENT QUALITY STANDARD

If the data is already in Meta/GA/Shopify dashboards, it's **not "The Gap"** — deprioritize. See `cosmisk-wiki/agents/inventory.md`.

## ARCHITECTURE RULES

1. **NO DIRECT LLM CALLS** — `llmGateway` (`createMessage`) only. Bypasses = billing risk + no cap/cost tracking.
2. **NO MEDIOCRE OUTPUTS** — reject, don't log.
3. **SPECIFIC OR SILENT** — no generic insights.

## TEST INVARIANT (before any commit)

default suite **400/9** · pg suite **388/10** · `tsc --noEmit` baseline-only (`billing.ts:4` stripe) · `madge --circular` **0 cycles**.

---

## CURRENT STATE (2026-06)

**Live:** Neon Postgres is the only DB (SQLite retired in DB-2). The **Watchdog** (6h cron) is the live intelligence loop → writes recommendations/predictions to Postgres → `routes/intelligence.ts` reads them. Codebase refactored: god files → barrel submodules, `index.ts` → `boot/` route modules, structured `logger`.

**Built but DORMANT (THE GAP):** the full "evidence → worldview synthesis → THE ONE THING → client card" brain exists as complete code but is **disconnected at the no-op `services/intelligence-integration.ts` seam** (elite-intelligence, strategic-cognition, quality-governance, intelligence-infrastructure = 0 live callers). Activation = Phases A–E.

**Needs wiring:** reconnect the integration seam (Phase A) · WhatsApp/HTML delivery (`client-report-generator`) · activate `prediction-verifier` + `quality-gated-runner`.

## CONTEXT ROUTING

```
product-ux     → cosmisk-wiki/product/CLIENT_EXPERIENCE_LAYER.md
quality-issue  → cosmisk-wiki/strategic/ANTI_PATTERNS.md
founder-rules  → cosmisk-wiki/strategic/FOUNDER_DIRECTIVES.md
agent-wiring   → cosmisk-wiki/agents/inventory.md
intelligence   → services/intelligence-integration.ts (the seam) + dev_reports activation map
client-work    → cosmisk-wiki/clients/{client}.md
debugging      → cosmisk-wiki/current/blockers.md
```

## TOOLING — RAILWAY

**NEVER** invoke `railway agent "<prompt>"` (billed Railway AI / LLM token passthrough). Free/OK: `railway logs|variables|status|link|up`, Railway MCP tools. If a flow seems to need the billed agent, stop and ask.

## POSITIONING

We watch THE GAP between platforms where money disappears.

## SESSION END

Update `cosmisk-wiki/current/sprint.md`.
