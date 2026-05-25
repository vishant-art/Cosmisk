# AI Agency Competitor Analysis

> Last updated: 2026-05-16
> Deep dive completed

---

## Instig8.ai (Marketing AI Agency)

**Founded:** 2023, Minneapolis, Minnesota
**Team:** 4 people (Nick Lipetzky, Kevin Stefanczyk, Aryan Mahajan, Krish Vaidya)
**Funding:** Unfunded (bootstrapped)

### Positioning
"A delivery engine for experts who need consistent execution" - started as internal automation system, now offered publicly.

### Services / Engines

| Engine | Output |
|--------|--------|
| Creative Engine | Copy, emails, visuals, video |
| RevOps Engine | Lead enrichment, pipeline, funnel A/B tests |
| IP Commercialization | Patent scoring, grant matching, SBIR/DoD proposal gen |
| Content Automation | Multi-platform viral content, trend detection, psychological signal mapping |

### Client Experience
- Deliverables-focused ("here's your completed work")
- No public dashboard shown
- Strategy call to start

### Pricing
Not public. Custom based on scope.

### Tech Stack
- Automation engineers + QA + AI workflows
- "Full-stack" at intersection of commercialization, capital, computation

---

## Merydian.ai (Business Operations AI)

**Model:** Uses OpenClaw (open-source AI orchestration framework)

### What Clients Get
- **Dedicated OpenClaw instance** (isolated, your data only)
- **Mission Control dashboard** - real-time agent monitoring
- 50+ integrations (email, CRM, calendar, messaging)
- 14-60 days post-deployment support
- Training walkthroughs

### OpenClaw Mission Control Dashboard Features

**Real-Time Monitoring:**
- Live agent activity logs
- Session visibility (connected agents, current work)
- Gateway status, database uptime
- Active sessions count, agents online
- Error logging (24-hour window)

**Task Management:**
- Kanban-style task board (Backlog → To Do → In Progress → Review → Done)
- Scheduled jobs management
- Agent spawn control (manually create sub-agents)

**Cost & Resources:**
- Token usage per agent
- Daily/weekly/monthly spending trends
- Cost breakdowns by model
- Spending threshold alerts
- CPU, RAM, swap, disk, GPU monitoring

**Memory & Knowledge:**
- Memory file browser
- Explore knowledge files and skills
- Add files directly
- Access MEMORY.md and agent notes

### Agent Types (Multi-Agent Teams)
- **Orchestrator** - Coordinates workflow
- **Developer** - Coding tasks
- **Content Creator** - Content production
- **Researcher** - Information gathering

Model routing: Haiku (fast) → Sonnet (medium) → Opus (complex)

### Pricing Tiers
| Tier | Price |
|------|-------|
| Free | MIT License (open source) |
| Subscription | $20+/month |
| Enterprise | $500+/month |

---

## Comparison Matrix

| Aspect | Instig8 | Merydian | Smashed (Us) |
|--------|---------|----------|--------------|
| **Model** | Creates deliverables | Executes operations | Watches gaps + delivers priority |
| **Output** | Work products | Dashboard + autonomous execution | WhatsApp alerts + weekly priority |
| **Dashboard** | Not shown | Mission Control | Future milestone |
| **Focus** | Marketing creative | Business operations | D2C ad spend protection |
| **Visibility** | Low (get results) | High (watch agents) | Medium (ONE thing + transparency) |

---

## Implications for Smashed/Cosmisk

**We are a hybrid:**
- Instig8's deliverable model (give clients actionable output)
- Merydian's visibility approach (show agents working)

**Our differentiation:**
1. **Gap-focused** - We watch where money leaks (OOS, discounts, creative fatigue)
2. **ONE priority** - Not 50 things, just the ONE most important action
3. **WhatsApp-first** - Meet clients where they are, not in a dashboard
4. **D2C specific** - Not generic "business AI"

**Future dashboard (when built):**
- See `plans/dashboard-design.md`
- Terminal-style Mission Control
- Real-time agent activity
- Per-client isolated view
