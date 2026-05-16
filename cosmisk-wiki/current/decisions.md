# Recent Decisions

> Updated: 2026-05-15

## 2026-05-15

### Decision: Agents as Evidence Providers
**Context**: Agents were generating their own recommendations, creating contradictions.
**Decision**: Agents provide EVIDENCE, synthesis engine makes DECISIONS.
**Pattern**: `collectXxxEvidence()` returns typed evidence, not recommendations.
**Impact**: Enables unified worldview, resolves contradictions centrally.

### Decision: Worldview-Required Creatives
**Context**: Static ad generators ignored strategic intelligence.
**Decision**: strategic-creative-generator THROWS if no worldview exists.
**Impact**: Forces strategic thinking before creative generation.

### Decision: LLM Wiki for Context
**Context**: Memory files require 1500+ tokens per session load.
**Decision**: Adopt Karpathy's LLM Wiki pattern with Obsidian.
**Impact**: Compress to ~300 tokens via current/sprint.md injection.

### Decision: Thin CLAUDE.md Architecture
**Context**: CLAUDE.md was 1,154 lines (~15K tokens), loading everything every session.
**Decision**: Slim CLAUDE.md to 106 lines (~1.4K tokens) with context routing.
**Pattern**: Core rules in CLAUDE.md, business context in wiki, load on-demand per task.
**Impact**: 91% token reduction per session, 5x longer working sessions.
**Backup**: `CLAUDE.md.backup-full` (full version preserved)

### Decision: Skip GitNexus MCP
**Context**: Considered GitNexus for code intelligence.
**Decision**: Keep code-review-graph (already working, same functionality).
**Impact**: No additional setup needed.

## Pending Decisions
- How to detect launched creatives automatically (Phase 2 task)
- Creative detection: UTM param vs visual similarity vs ad name matching

## Links
- [[_schema]]
- [[current/sprint]]
