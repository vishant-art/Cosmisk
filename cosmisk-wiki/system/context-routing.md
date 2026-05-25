# Context Routing System

> Load ONLY what's needed. Maximum efficiency.

## The Problem

```
OLD: CLAUDE.md loads 15K tokens EVERY session
     ├── Business context (rarely needed)
     ├── LinkedIn strategy (rarely needed)
     ├── Competitor database (rarely needed)
     ├── Case studies (rarely needed)
     └── 80% of tokens WASTED per session
```

## The Solution: Task-Scoped Loading

```
NEW: THIN CLAUDE.md (~2K tokens)
     ├── Core rules (governance)
     ├── Architecture constraints
     ├── Context routing logic
     └── sprint.md injection

     + TASK-SCOPED MEMORY (load on demand)
     ├── If building agents → load agents/inventory.md
     ├── If client work → load clients/{client}.md
     ├── If creative → load patterns/what-works.md
     └── If business → load business/*.md
```

## Context Routing Logic

```
BEFORE starting work, Claude asks:
"What type of task is this?"

TASK TYPE → LOAD THESE FILES:
─────────────────────────────────────────────────
agent-wiring      → agents/inventory.md, architecture/evidence-providers.md
creative-work     → patterns/what-works.md, patterns/what-fails.md
client-specific   → clients/{client}.md
business-strategy → business/the-gap.md, business/positioning.md
linkedin-content  → business/linkedin-strategy.md, clients/casorro.md
architecture      → architecture/*.md
debugging         → agents/inventory.md, current/blockers.md
```

## File Size Targets

| File | Max Tokens | Purpose |
|------|------------|---------|
| CLAUDE.md | 2,000 | Core rules only |
| sprint.md | 300 | Current focus |
| Any wiki page | 500 | Single topic |

## Session Token Budget

```
Target per session:
├── CLAUDE.md (thin)           2,000 tokens
├── sprint.md (injected)         300 tokens
├── Task-scoped files (1-3)    1,500 tokens max
├── Code reading (as needed)   varies
└── TOTAL CONTEXT OVERHEAD:    ~4,000 tokens (vs 15K before)

SAVINGS: 73% reduction in context overhead
```

## Implementation

1. Create THIN CLAUDE.md (core rules only)
2. Move business content to wiki (already done)
3. Add routing logic to CLAUDE.md
4. Train Claude to load on-demand

## Last Updated
2026-05-15 by Claude
