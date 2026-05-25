# Wiki Routing System — Where Learnings Go

> When something is learned, it cascades to ALL affected wikis.
> This page defines the routing rules.
> **37 wiki pages total** — each has a specific purpose.

---

## Complete Wiki Directory (All 37 Pages)

### CURRENT (Updates Every Session)
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `sprint.md` | Current session work | EVERY session |
| `blockers.md` | Active blockers | When stuck |
| `decisions.md` | Recent decisions | When deciding something |

### BUSINESS (Sales/Positioning)
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `the-gap.md` | 5 Gaps messaging framework | When changing sales pitch |
| `positioning.md` | Competitive moat, infrastructure | When building new moat features |
| `service-model.md` | Done-With-You vs Done-For-You | When changing pricing/service |
| `linkedin-strategy.md` | Content pillars, session learnings | Every session (learnings log) |
| `instagram-strategy.md` | IG content, competitors, scripts | When IG-related work |

### ARCHITECTURE (How Things Work)
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `strategic-cognition.md` | Worldview synthesis system | When changing synthesis logic |
| `memory-system.md` | Episodes, predictions, decay | When memory features change |
| `memory-roadmap.md` | Memory build plan | When completing roadmap items |
| `evidence-providers.md` | Agent wiring pattern | When wiring new agents |
| `agent-coordination.md` | How agents communicate | When changing agent flow |
| `closed-loop.md` | Learning loop system | When changing feedback loops |
| `agent-infrastructure-layers.md` | Layer architecture | When adding layers |
| `VISUAL_CREATIVE_MEMORY_SYSTEM.md` | Creative memory design | When creative memory changes |

### STRATEGIC (Founder Rules)
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `FOUNDER_DIRECTIVES.md` | Permanent memory, rules | When learning architecture insights |
| `ANTI_PATTERNS.md` | What NOT to do | When discovering anti-patterns |
| `QUALITY_CRISIS_AUDIT.md` | Quality problems diagnosis | When quality issues found |
| `BRUTAL_AUDIT_2026-05-16.md` | Full positioning audit | Historical (rarely update) |

### CLIENTS (Per-Client)
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `pratapsons.md` | Pratapsons trust journey | When Pratapsons data/learnings |
| `casorro.md` | Casorro case study | When Casorro data |
| `_template.md` | New client template | When template changes |

### PATTERNS (Cross-Client)
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `what-works.md` | Winning patterns | When pattern proves successful |
| `what-fails.md` | Anti-patterns | When pattern fails |
| `predictions.md` | Accuracy tracking | When predictions verified |

### AGENTS
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `inventory.md` | What's built, wired, broken | When agent status changes |

### DESIGN
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `COMPETITOR_VISUAL_ANALYSIS.md` | Visual research | When analyzing competitors |
| `HOMEPAGE_DESIGN.md` | Landing page specs | When design changes |

### PRODUCT
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `CLIENT_EXPERIENCE_LAYER.md` | What client experiences | When client UX changes |
| `WHAT_CLIENT_SEES.md` | Elite output examples | When output format changes |

### COMPETITORS
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `ai-agency-comparison.md` | How we compare to others | When competitive landscape changes |

### PLANS
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `dashboard-design.md` | Dashboard design plan | When dashboard work |

### SYSTEM (Meta)
| Wiki | Purpose | When to Update |
|------|---------|----------------|
| `wiki-routing.md` | This file - routing rules | When adding new wikis |
| `context-routing.md` | LLM context management | When context strategy changes |
| `tools-repos.md` | GitHub repos, tools | When discovering new tools |
| `_index.md` | Wiki entry point | When adding new sections |
| `_schema.md` | Wiki structure rules | When changing wiki structure |

## The Learning Cascade Rule

**When we learn X, update:**
1. PRIMARY wiki (where X lives)
2. ALL wikis that LINK TO the primary
3. ALL wikis that the primary LINKS TO
4. `sprint.md` (always)
5. `linkedin-strategy.md` Session Learnings (if shareable insight)
6. `FOUNDER_DIRECTIVES.md` (if architectural insight)

---

## Wiki Interconnection Graph

```
                    ┌─────────────────┐
                    │   _index.md     │
                    │  (Entry Point)  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   BUSINESS    │   │ ARCHITECTURE  │   │    CURRENT    │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ the-gap       │◄──│ strategic-    │   │ sprint        │
│ positioning   │   │   cognition   │   │ blockers      │
│ service-model │   │ memory-system │   │ decisions     │
│ linkedin-     │   │ evidence-     │   └───────────────┘
│   strategy    │   │   providers   │           │
│ instagram-    │   │ closed-loop   │           │
│   strategy    │   │ agent-coord   │           │
└───────┬───────┘   └───────┬───────┘           │
        │                   │                   │
        │    ┌──────────────┴──────────────┐    │
        │    │                             │    │
        ▼    ▼                             ▼    ▼
┌───────────────┐                   ┌───────────────┐
│   STRATEGIC   │                   │    CLIENTS    │
├───────────────┤                   ├───────────────┤
│ FOUNDER_      │◄─────────────────►│ pratapsons    │
│   DIRECTIVES  │                   │ casorro       │
│ ANTI_PATTERNS │                   │ _template     │
│ QUALITY_CRISIS│                   └───────────────┘
└───────────────┘                           │
        │                                   │
        └───────────────┬───────────────────┘
                        │
                        ▼
                ┌───────────────┐
                │   PATTERNS    │
                ├───────────────┤
                │ what-works    │
                │ what-fails    │
                │ predictions   │
                └───────────────┘
```

---

## Use Case Examples (20 Scenarios)

### ARCHITECTURE USE CASES

**1. "We built prediction-verifier.ts"**
| Update | What to Add |
|--------|-------------|
| `memory-system.md` | Add to Key Files, mark gap as DONE |
| `FOUNDER_DIRECTIVES.md` | Add to Systems Inventory |
| `positioning.md` | Add to "Infrastructure We Built" |
| `agents/inventory.md` | Update agent status if relevant |
| `sprint.md` | Add to current session |

**2. "Changed how agents communicate"**
| Update | What to Add |
|--------|-------------|
| `agent-coordination.md` | Update flow diagrams |
| `evidence-providers.md` | If pattern changed |
| `strategic-cognition.md` | If synthesis affected |
| `sprint.md` | Note the change |

**3. "Added new evidence type"**
| Update | What to Add |
|--------|-------------|
| `evidence-providers.md` | Add new evidence type |
| `agents/inventory.md` | Update evidence status table |
| `strategic-cognition.md` | If synthesis uses it |

### BUSINESS USE CASES

**4. "The Gap is messaging, not infrastructure"**
| Update | What to Add |
|--------|-------------|
| `the-gap.md` | Clarify distinction |
| `positioning.md` | Add infrastructure section |
| `FOUNDER_DIRECTIVES.md` | Add key insight |
| `sprint.md` | Note the clarification |

**5. "Changed pricing model"**
| Update | What to Add |
|--------|-------------|
| `service-model.md` | Update pricing tiers |
| `positioning.md` | If moat affected |
| `FOUNDER_DIRECTIVES.md` | Add decision |

**6. "New sales pitch angle"**
| Update | What to Add |
|--------|-------------|
| `the-gap.md` | If Gap messaging changed |
| `positioning.md` | If positioning changed |
| `linkedin-strategy.md` | New content ideas |

### CLIENT USE CASES

**7. "Pratapsons frequency threshold should be 2.8"**
| Update | What to Add |
|--------|-------------|
| `clients/pratapsons.md` | Add learned pattern |
| `patterns/what-works.md` | If generalizable to other clients |
| `memory-system.md` | If it's stored in memory |

**8. "New client onboarded: XYZ"**
| Update | What to Add |
|--------|-------------|
| `clients/xyz.md` | Create from `_template.md` |
| `agents/inventory.md` | If new agents needed |
| `sprint.md` | Add onboarding tasks |

**9. "Client case study results"**
| Update | What to Add |
|--------|-------------|
| `clients/{name}.md` | Add results data |
| `patterns/what-works.md` | Winning patterns |
| `the-gap.md` | Real numbers for sales |
| `linkedin-strategy.md` | Content ideas |

### CONTENT/PERSONAL BRAND USE CASES

**10. "Moksh Vasant gets 140K with 27 posts"**
| Update | What to Add |
|--------|-------------|
| `instagram-strategy.md` | Add competitor data |
| `linkedin-strategy.md` | If cross-platform insight |
| Session Learnings in both | Add insight |

**11. "New LinkedIn post idea"**
| Update | What to Add |
|--------|-------------|
| `linkedin-strategy.md` | Add to Content Ideas |
| `instagram-strategy.md` | If repurposable |

**12. "Discovered new tool for content"**
| Update | What to Add |
|--------|-------------|
| `tools-repos.md` | Add tool details |
| `linkedin-strategy.md` | Add to Tools section |
| `instagram-strategy.md` | If IG-relevant |

### TOOLS/SCRIPTS USE CASES

**13. "screenshot-instagram-v3.js handles popups"**
| Update | What to Add |
|--------|-------------|
| `instagram-strategy.md` | Add to Scripts Inventory |
| `tools-repos.md` | If it's a reusable tool |

**14. "Found new GitHub repo for X"**
| Update | What to Add |
|--------|-------------|
| `tools-repos.md` | Add repo details |
| `FOUNDER_DIRECTIVES.md` | If it's a systems tool |
| Domain wiki | If domain-specific |

**15. "Token burning solution discovered"**
| Update | What to Add |
|--------|-------------|
| `tools-repos.md` | Add to Token Solutions |
| `context-routing.md` | If context strategy |
| `_schema.md` | If wiki pattern change |

### QUALITY/PATTERNS USE CASES

**16. "Quality gate not rejecting properly"**
| Update | What to Add |
|--------|-------------|
| `QUALITY_CRISIS_AUDIT.md` | Add diagnosis |
| `FOUNDER_DIRECTIVES.md` | Add anti-pattern |
| `ANTI_PATTERNS.md` | Add what not to do |

**17. "Hook pattern working 4.2% CTR"**
| Update | What to Add |
|--------|-------------|
| `patterns/what-works.md` | Add pattern details |
| `clients/{name}.md` | Link to client using it |
| `strategic-cognition.md` | If affects synthesis |

**18. "Prediction was wrong"**
| Update | What to Add |
|--------|-------------|
| `patterns/predictions.md` | Update accuracy |
| `memory-system.md` | If learning loop issue |
| `patterns/what-fails.md` | Add anti-pattern |

### DESIGN USE CASES

**19. "Competitor uses terminal aesthetic"**
| Update | What to Add |
|--------|-------------|
| `COMPETITOR_VISUAL_ANALYSIS.md` | Add analysis |
| `HOMEPAGE_DESIGN.md` | If adopting style |

**20. "Dashboard design decision"**
| Update | What to Add |
|--------|-------------|
| `dashboard-design.md` | Add design specs |
| `CLIENT_EXPERIENCE_LAYER.md` | If UX affected |
| `WHAT_CLIENT_SEES.md` | If output format changed |

---

## Quick Reference: Learning → Wikis

| Learning Category | PRIMARY Wiki | ALWAYS Also Update |
|-------------------|--------------|-------------------|
| Memory/Episodes | `memory-system.md` | `FOUNDER_DIRECTIVES`, `sprint`, `positioning` |
| Strategic Cognition | `strategic-cognition.md` | `FOUNDER_DIRECTIVES`, `sprint`, `evidence-providers` |
| Quality/Rejection | `FOUNDER_DIRECTIVES.md` | `sprint`, `ANTI_PATTERNS` |
| Client Performance | `clients/{name}.md` | `patterns/what-works`, `sprint` |
| Agent Behavior | `agents/inventory.md` | `memory-system`, `FOUNDER_DIRECTIVES` |
| Personal Brand | `linkedin-strategy.md` | `instagram-strategy.md` (if cross-platform) |
| Instagram | `instagram-strategy.md` | `linkedin-strategy.md` (if cross-platform) |
| Positioning/Moat | `positioning.md` | `the-gap`, `FOUNDER_DIRECTIVES` |
| Design/UX | `HOMEPAGE_DESIGN.md` | `COMPETITOR_VISUAL_ANALYSIS` |

---

## Session End Protocol (Updated)

At end of every session:

```
1. What did we LEARN? (not just what did we BUILD)
   ↓
2. Categorize each learning (architecture/business/client/content/tool)
   ↓
3. Route to PRIMARY wiki using table above
   ↓
4. Check "ALWAYS Also Update" column
   ↓
5. Update ALL affected wikis
   ↓
6. Update sprint.md with summary
```

---

## Related

- [[_schema]] — Wiki structure rules
- [[_index]] — Wiki entry point
- [[sprint]] — Current session
- [[FOUNDER_DIRECTIVES]] — Permanent memory

## Last Updated
2026-05-17 by Claude (Session 11 - Wiki routing system created)
