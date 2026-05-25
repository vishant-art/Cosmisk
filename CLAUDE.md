# COSMISK — Thin Context Architecture

> ~1K tokens. References only. Full context in wiki.

---

## CRITICAL: CODE FREEZE IN EFFECT (May 20, 2026)

**DO NOT MODIFY SERVER CODE.** External dev team is doing production cleanup.

### What I CAN Do:
- Documentation (wiki, markdown files)
- Client audits and reports (HTML/PDF generation)
- Analysis and research
- Scripts that READ data (not write to production)

### What I CANNOT Do:
- Edit files in `server/src/`
- Modify database schema
- Change routes or services
- Add new dependencies
- Commit code changes to main branch

### Why:
- Dev team on `analysis-and-cleanup` branch fixing critical issues
- LLM Gateway bypasses causing billing risk
- Cron jobs blocking API
- Schema drift between files

### If Asked to Write Code:
1. Create documentation/spec instead
2. Save to `cosmisk-wiki/` or `docs/`
3. Let dev team implement from spec

**Handoff docs:** `server/DEVELOPER_HANDOFF_DOCUMENT.md`

---

## QUALITY GATE (3 Questions Before ANY Output)

1. **Specific?** Names actual creative/campaign, not "your ads"
2. **Causal?** Explains WHY, not just WHAT
3. **Actionable?** Founder can do something in 48 hours

**If NO → DO NOT SHIP.**

Full standards: `cosmisk-wiki/strategic/ANTI_PATTERNS.md`

---

## AGENT QUALITY STANDARD

**Rule:** If data is in existing dashboards (Meta/GA/Shopify), it's NOT "The Gap" — deprioritize.

See: `cosmisk-wiki/agents/inventory.md#agent-quality-standard-new---may-20`

---

## CONTEXT ROUTING

```
TASK TYPE        → WIKI PAGE
────────────────────────────────────────
product-ux       → product/CLIENT_EXPERIENCE_LAYER.md
quality-issue    → strategic/ANTI_PATTERNS.md
memory-arch      → architecture/VISUAL_CREATIVE_MEMORY_SYSTEM.md
founder-rules    → strategic/FOUNDER_DIRECTIVES.md
agent-wiring     → agents/inventory.md
architecture     → strategic/QUALITY_CRISIS_AUDIT.md
client-work      → clients/{client}.md
debugging        → current/blockers.md
```

---

## CURRENT STATE

**EXISTS (Backend):**
- OOS detector, fatigue detector, trust analyzer (agents work)
- Quality governance wired into ad-watchdog
- Evidence providers feeding worldview synthesis

**DESIGNED (In Wiki):**
- Memory architecture: `architecture/VISUAL_CREATIVE_MEMORY_SYSTEM.md`
- Client experience: `product/CLIENT_EXPERIENCE_LAYER.md`
- Elite output examples: `product/WHAT_CLIENT_SEES.md`

**NEEDS BUILDING:**
- WhatsApp delivery integration
- Visual card image generator
- THE ONE THING message formatter
- Cross-platform synthesis → single output

---

## ARCHITECTURE RULES

1. NO DIRECT LLM CALLS — llmGateway only
2. NO MEDIOCRE OUTPUTS — Reject, don't log
3. SPECIFIC OR SILENT — No generic insights

---

## POSITIONING

We watch THE GAP between platforms where money disappears.

---

## SESSION END

Update `cosmisk-wiki/current/sprint.md`
