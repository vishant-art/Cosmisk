<!-- PROJECT MEMORY - Updated 2026-05-10 -->

## MANDATORY: Architecture Governance (READ FIRST)

**Before writing ANY code, Claude MUST read:** `server/ARCHITECTURE_GOVERNANCE.md`

### Quick Rules (Violations = Rejected Code)

```
RULE 1: NO DIRECT LLM CALLS — Use llmGateway only
RULE 2: NO SCHEMA DUPLICATION — All tables in schema.ts
RULE 3: NO GOD FILES — Max 500 lines per file
RULE 4: NO HIDDEN DEPENDENCIES — Declare all imports
RULE 5: NO SILENT FAILURES — Log all errors with context
RULE 6: NO UNBOUNDED LOOPS — Always set limits
RULE 7: NO UNREGISTERED CRON — Use cron registry
RULE 8: NO HARDCODED SECRETS — Use env vars
RULE 9: NO SERVICE BOUNDARY VIOLATIONS — Use contracts
RULE 10: NO UNTRACED OPERATIONS — Include correlationId
```

### Pre-Implementation Checklist

Before implementing any feature, Claude MUST:

1. **Read governance docs** — `server/ARCHITECTURE_GOVERNANCE.md`
2. **Identify impact** — Files created/modified, dependencies, schema changes
3. **Estimate cost** — LLM tokens, API calls, execution time
4. **Propose first** — Present plan BEFORE writing code for medium+ changes
5. **Get approval** — Wait for human approval on architectural decisions

### Escalation Triggers (STOP and ASK)

- Modifying auth/payment/billing logic
- Changing database schema with existing data
- Creating new service boundaries
- Introducing new technology/patterns
- Multiple valid approaches exist
- Requirements are ambiguous

---

## Cosmisk Strategic Positioning (May 2026)

### The Core Insight: We Watch THE GAP

**What Meta + Claude does:** AI generates ads (single platform, generic for everyone)

**What Cosmisk does:** AI watches THE GAP between platforms where money disappears

```
META'S CLAUDE:                    COSMISK:
┌─────────────┐                   ┌─────────┐ ┌─────────┐ ┌───────────┐
│  META ONLY  │                   │  META   │ │ SHOPIFY │ │COMPETITORS│
└──────┬──────┘                   └────┬────┘ └────┬────┘ └─────┬─────┘
       │                               └──────┬────┴────────────┘
       ▼                                      ▼
  Generic ads                          ┌─────────────┐
  for anyone                           │   THE GAP   │
                                       │(money leaks)│
                                       └──────┬──────┘
                                              ▼
                                       Intelligence +
                                       Strategic creatives
```

### Positioning Rules (FOLLOW THESE)

| DO SAY | DON'T SAY |
|--------|-----------|
| "We catch money leaks between platforms" | "AI generates ads" |
| "We watch The Gap" | "We're an AI creative tool" |
| "Rs 14Cr waste identified across 3 brands" | "We make creatives faster" |
| "Intelligence that produces creatives" | "Creative generation platform" |
| "Cross-platform blind spots" | "Better ad copy" |

### What Meta + Claude CANNOT Do (Our Moat)

| Capability | Meta + Claude | Cosmisk |
|------------|---------------|---------|
| Cross-platform data | NO | YES (Meta + Shopify + Competitors) |
| OOS Detection | NO | YES (ads spending on out-of-stock) |
| Discount Leakage | NO | YES (coupon site scraping) |
| Cohort LTV | NO | YES (Shopify customer analysis) |
| Competitor Intel | NO | YES (Ad Library analysis) |
| Brand-specific learning | NO (generic) | YES (your brand's history) |
| Reality Testing | NO | YES (accuracy tracking) |

### Competitive Response (May 2026)

Meta integrating Claude validates AI for ads. This HELPS us — proves the market exists.

**Our response:**
1. Position as "intelligence layer" not "creative tool"
2. Double down on cross-platform (Meta can't do this)
3. Lead with OOS/Leakage demos (proof Meta can't match)
4. Build data moat (every client = more intelligence)
5. Creative is OUTPUT of intelligence, not the product

### The Gap Framework (Use in All Content)

The Gap = the space between platforms where nobody is watching:
- Gap 1: Inventory ↔ Ads (OOS detection)
- Gap 2: Discount Codes ↔ Margins (leakage detection)
- Gap 3: Clicks ↔ Purchases (Click→ATC analysis)
- Gap 4: Acquisition ↔ Lifetime Value (LTV-adjusted CPA)
- Gap 5: Ad Comments ↔ Product (feedback loop)

Every brand has 3+ gaps. We find them.

---

## Karpathy's 4 Principles (AI Coding Discipline)

**Source:** [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) (109K+ stars)

**Activation:** ALWAYS — these are baseline rules for all code changes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**Test:** Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

**Working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation

---

## Council Protocol (Anti-Sycophancy)

**Activation:** AUTOMATIC on any decision question — "should I", "is this a good idea", "what do you think about", "would it be smart to", "council this", "/council"

When triggered, convene 5 advisors:

| Advisor | Role |
|---------|------|
| **Skeptic** | Assumes this fails. Finds the fatal flaw. |
| **Optimist** | Best-case scenario. What's the upside? |
| **Operator** | Ignores theory. What happens in practice? |
| **Contrarian** | Takes the opposite stance of the majority. |
| **Advisor** | Synthesizes all views into one recommendation. |

Each advisor: 2-3 sentences max. Then provide:
- **Verdict:** Go / No-Go / Needs More Info
- **Next Step:** One specific action

---

## Context Handoff Protocol (Session Memory)

**Activation:** `/handoff` or "generate handoff" or "save context" or when ending a long session

When triggered, generate a **HANDOFF PROMPT** that captures the current session state so a fresh Claude window can continue seamlessly.

### What to Capture

```
## HANDOFF CONTEXT — [Date]

### Git State
- **Branch:** [current branch]
- **Recent commits:** [last 5 commits with messages]
- **Uncommitted changes:** [modified/staged files]

### Files Touched This Session
[List of files read/edited with brief purpose]

### What We Built/Fixed
[Bullet list of accomplishments]

### Current Task
[What was being worked on when session ended]

### Dead Ends (Don't Retry)
[Approaches that failed, with why]

### Next Steps
[Specific actions for the next session]

### Key Decisions Made
[Important choices that shouldn't be revisited]
```

### Output Format

Output the handoff as a **copyable code block** that starts with:
```
Continue this development session. Here's where we left off:
```

This lets the user paste directly into a fresh Claude window.

### Auto-Trigger

If the conversation has been going for 20+ turns and involves code changes, proactively offer: "Want me to generate a handoff prompt before we run out of context?"

---

## Business Model & Architecture

### The Hierarchy (REMEMBER THIS)

```
┌─────────────────────────────────────────────────────────────────┐
│  SMASHED AGENCY (smashed.agency)                                │
│  └── The brand clients see and pay                              │
├─────────────────────────────────────────────────────────────────┤
│  THE BRIDGE SERVICE (smashed.agency/scan/)                      │
│  └── The service clients buy                                    │
│  └── "We watch The Gap between your platforms"                  │
├─────────────────────────────────────────────────────────────────┤
│  COSMISK (this codebase)                                        │
│  └── Backend platform clients NEVER see                         │
│  └── All agents, intelligence, persistence live here            │
└─────────────────────────────────────────────────────────────────┘
```

### Business Roadmap

| Phase | What | Status |
|-------|------|--------|
| **Phase 1: SERVICE** | Sell via Smashed Agency, done-for-you/done-with-you | NOW |
| **Phase 2: SAAS** | Self-serve platform, clients onboard themselves | AFTER SERVICE PROVEN |

**Why service first:**
- Validate the value prop with real clients
- Learn what features matter vs. what's noise
- Build learning data from real accounts
- Prove ROI before building self-serve
- Higher ticket = fewer clients needed to validate

### What Clients Experience

| They See | Powered By (Cosmisk) |
|----------|----------------------|
| WhatsApp alert: "Rs 4.2L wasted on OOS" | `oos-detector.ts` |
| Slack: "3 recommendations for your account" | `ad-watchdog.ts` |
| HTML report: "Weekly Intelligence Briefing" | `operator-experience.ts` |
| "Creative refresh needed" | `creative-intelligence.ts` |

**Clients never see:** Cosmisk, Claude, Gemini, code, databases, agents.
**Clients only see:** Smashed Agency branded alerts, reports, recommendations.

---

## The Bridge Service (smashed.agency/scan/)

### What It Is
A high-ticket D2C performance monitoring service that sits between Meta Ads and Shopify, catching money leaks that neither platform shows alone. Sold as a SERVICE (not SaaS), with Cosmisk as the backend platform.

### Landing Page
- URL: smashed.agency/scan/
- Current file: /tmp/bridge-final.html (paste into Elementor HTML widget)
- Positioning: Rs 10L+/month ad spend, strategic partnership, discovery-first (no public pricing)

### Service Tiers

#### Done With You (Rs 3-5L one-time) — HIGHER TICKET
- **Persona:** Founder who wants to own the system, build internal capability
- We implement full monitoring INTO their infrastructure
- Train their ops + marketing team
- Complete playbook + SOPs
- 60-day implementation + 30-day support
- After that: they run it independently, no dependency on us
- **Why more expensive:** Knowledge transfer + independence = premium

#### Done For You (Rs 50-75K/month ongoing) — RECURRING
- **Persona:** Time-poor founder, wants hands-off
- We handle everything continuously
- Weekly calls, dedicated analyst
- They stay dependent on us (recurring revenue)
- **Why cheaper per month:** Ongoing relationship, no knowledge transfer

### Done With You Deployment Plan (5-Week Process)

**Phase 1: Infrastructure Setup (Week 1-2)**
- Client provides: VPS/Cloud instance, Meta App credentials, Shopify API access, Slack/WhatsApp webhooks
- We deploy: Cosmisk server (Docker/Node.js), SQLite database, cron jobs, alert routing
- Alternative: Host initially → Train → Migrate to their infra

**Phase 2: Configuration (Week 2-3)**
- Configure service_clients entry with their credentials
- Set revenue-level thresholds for alerts
- Configure agent schedules (hourly OOS, daily watchdog, weekly LTV)
- Set up alert channels and report delivery

**Phase 3: Training (Week 3-4)**
- Session 1: Understanding the Agents (what each catches, actions required)
- Session 2: Reading Reports (metrics, thresholds, recommendations)
- Session 3: Taking Action (decision frameworks, escalation paths)
- Session 4: Running the System (CLI commands, health checks)

**Phase 4: Handover Deliverables (Week 4)**
```
Deliverables/
├── SOPs/ (daily-monitoring, alert-response, report-interpretation, troubleshooting)
├── Scripts/ (run-all-agents.sh, generate-weekly-report.sh, health-check.sh)
├── Training/ (4 recorded sessions, quick-reference-cards.pdf)
└── Support/ (30-day Slack channel access)
```

**Phase 5: Independence (Week 5+)**
- Client runs agents independently
- Weekly async check-ins (30 days)
- Emergency support via Slack/WhatsApp
- Optional: quarterly refresh training

### Client Delivery Mechanisms

**How clients receive intelligence (they don't use Claude Code):**
1. **WhatsApp/Slack Alerts** — Real-time notifications when agents detect issues
2. **HTML Reports** — Smashed-branded reports via email/shared link
3. **Weekly Briefings** — Aggregated summary via N8N webhook
4. **Future: Dashboard** — Web UI for real-time agent status (if needed)
5. **Future: API Access** — Enterprise tier, JSON endpoints

### Intelligence Stack (9 Agents)

| Agent | Cosmisk Status | Location | Notes |
|-------|----------------|----------|-------|
| OOS Detection | ✅ BUILT + WATCHDOG | `server/src/services/oos-detector.ts` | Fuzzy matching, per-product spend, Shopify verification, catalog DPA support |
| Zombie Campaign | ✅ Watchdog + Autopilot | `server/src/services/ad-watchdog.ts` | Types: roas_decline, cpa_spike, wasted_spend |
| Creative Fatigue | ✅ Watchdog + Creative Scorer | `server/src/services/creative-scorer.ts` | Integrated into Watchdog decisions |
| Creative Analyzer | ✅ Creative DNA + Strategist | `server/src/services/creative-strategist.ts` | Hooks, visuals, audio patterns |
| Discount Leakage | ✅ BUILT + WATCHDOG | `server/src/services/discount-leakage-detector.ts` | Coupon site scraping, Shopify cross-reference, revenue impact |
| Budget Allocation | ✅ Autopilot Engine | `server/src/services/autopilot-engine.ts` | Auto-optimize budgets, pause/scale |
| Cohort Intelligence | 🔧 NOT BUILT | — | Shopify MCP ready, needs implementation |
| Inventory Velocity | 🔧 NOT BUILT | — | Shopify MCP ready, needs implementation |
| Competitor Intel | ✅ BUILT | `server/src/routes/competitor-spy.ts` | Meta Ad Library search + Claude analysis |

### What Cosmisk Already Has (Production Ready)
- **OOS Detection** (ads spending on out-of-stock products) — `oos-detector.ts`
- **Competitor Spy** (Meta Ad Library analysis) — `competitor-spy.ts`
- Watchdog Agent (daily monitoring, anomaly detection)
- Morning Briefing (daily WhatsApp/Slack summary)
- Autopilot Engine (auto-optimize budgets, pause/scale)
- Creative DNA Analysis (hooks, visuals, audio patterns)
- Creative Scorer (5-dimension algorithm)
- Audit System (Meta + Google + Shopify + Website)
- Full Meta Ads integration
- Google Ads integration
- Shopify integration
- Slack/WhatsApp alerts

### Build Priority for The Bridge (Remaining)
1. **Inventory Velocity** - Predict OOS before it happens (MEDIUM) — Use Shopify MCP
2. **Cohort/LTV Tracking** - Deeper Shopify customer analysis (MEDIUM) — Use Shopify MCP

### Already Built ✅
- **OOS Detection** — `oos-detector.ts` (~1030 lines) integrated into Watchdog
- **Discount Leakage** — `discount-leakage-detector.ts` (~570 lines) integrated into Watchdog
- **Competitor Intel** — `competitor-spy.ts` with Meta Ad Library + Claude analysis

### Evidence/Stats (Real)
- Rs 14Cr waste identified across 3 brands
- 2,600 OOS products found (one scan)
- 77 zombie campaigns found (one scan)
- Rs 1.35Cr discount leakage found
- 5,735 abandoned carts found
- Case study: Fashion brand, Rs 50L/month spend, ROAS 3.7x → 4.8x

### Casorro Case Study (Real Data - Use for Content)
**Context:** Jan-Feb profitable (₹1,200 CPA) → Mar-Apr collapsed (₹7,650 CPA)
**Root Cause:** Budget shifted from winning UGC to new template creatives

| Creative Type | Spend | Purchases | Click→ATC | CPA |
|---------------|-------|-----------|-----------|-----|
| UGC (winner) | ₹1,07,874 | 127 | 5.26% | ₹849 |
| Templates (tests) | ₹1,05,128 | 6 | 0.17% | ₹17,521 |

**Key Insight:** 31x difference in Click→ATC rate. Same spend, wildly different results.
**Lesson:** Not "creative fatigue" — new tests were bad from day 1. Click→ATC reveals this in 48 hours, not months.

### LinkedIn Post (Approved - May 2026)
**Topic:** Creative testing misdiagnosis (not fatigue)
**Angle:** Click→ATC as early warning signal

```
Jan-Feb: ₹1,200 per purchase. Profitable.

Mar-Apr: ₹7,650 per purchase. Burning cash.

Same product. Same audience. Same landing page.

What changed? We started testing new creatives.

The obvious answer: "creative fatigue." Scale killed our winning ads.

Wrong.

Our winning UGC was still running. Still getting budget. It wasn't tired.

The problem was simpler: our new creative tests were bad from day 1.

Here's what the data actually showed:

**UGC creative (the "fatigued" winner):**
- ₹1,07,874 spent → 127 purchases
- Click → Add to Cart: 5.26%
- CPA: ₹849

**Template creatives (the "fresh" tests):**
- ₹1,05,128 spent → 6 purchases
- Click → Add to Cart: 0.17%
- CPA: ₹17,521

Same spend. 31x difference in Click → ATC rate.

The algorithm wasn't killing our winner. We were diluting budget into creatives that couldn't convert.

This took me 2 months to catch. Should have taken 48 hours.

Click → ATC doesn't lie. After ₹3-5K spend, if a creative is below 1%, it's not going to suddenly work at ₹50K.

Now I built a system that flags this automatically and sends me a WhatsApp when a new ad drops below 1% Click→ATC after ₹3K spend.

Building it with Claude as my co-pilot. Will share more as it develops.
```

### LinkedIn Post v3 - "The Gap" Concept (May 2026)
**Status:** Ready to post
**Concept:** Own "The Gap" — the space between platforms where money disappears
**Format:** Long-form + Carousel

```
I've spent 4 years finding where ad money actually disappears.

It's not bad creatives.
It's not wrong audiences.
It's not iOS 14.

It's The Gap.

The Gap is the space between your platforms where nobody is watching.

Meta doesn't talk to Shopify.
Shopify doesn't talk to your coupon sites.
Your coupon sites don't talk to your finance team.
Your finance team doesn't talk to your media buyer.

In those gaps, money vanishes silently.

I audited 3 brands spending ₹50L+/month each. Found ₹14Cr+ in annual waste.

Not from bad ads. From gaps.

━━━━━━━━━━━━━━━━━━━━━━━

**Gap 1: Inventory ↔ Ads**

23 products went OOS. Ads kept running.
₹4.2L/month for 4 months. ₹16.8L burned.

Meta doesn't know your inventory. It just keeps spending.

━━━━━━━━━━━━━━━━━━━━━━━

**Gap 2: Discount Codes ↔ Margins**

"Exclusive" 20% codes found on 14 coupon sites.
38% of orders used leaked codes.
₹1.35Cr margin gone in one quarter.

Your codes leak. Nobody tracks where.

━━━━━━━━━━━━━━━━━━━━━━━

**Gap 3: Clicks ↔ Purchases**

"Best" creative: 2.1% CTR, 0.17% Click→ATC.
Ignored creative: 1.2% CTR, 5.26% Click→ATC.

Same spend. 31x difference in buyers.
Budget going to wrong creative for 2 months.

CTR lies. The gap between click and cart tells the truth.

━━━━━━━━━━━━━━━━━━━━━━━

**Gap 4: Acquisition ↔ Lifetime Value**

CPA: ₹850. Looks great.
But 40% were one-time discount buyers.
LTV-adjusted CPA: ₹2,100.

They were scaling losses and calling it growth.

━━━━━━━━━━━━━━━━━━━━━━━

**Gap 5: Ad Comments ↔ Product**

147 comments: "Sizes run small."
Same creative running 3 months.
Returns: 22%. Industry average: 8%.

Feedback exists. Nobody connects it.

━━━━━━━━━━━━━━━━━━━━━━━

Every brand I audit has at least 3 of these gaps.

The money isn't lost in your ad account.
It's lost in the space between your ad account and everything else.

This is why I'm building Cosmisk.

An AI that sits in The Gap and watches what nobody else does.

Most brands hire media buyers.
Almost none have anyone watching what happens after the click.

That's where your money is going.

━━━━━━━━━━━━━━━━━━━━━━━

What's the biggest gap you've found in your business?
```

**Future post hooks using "The Gap":**
- "Last week I talked about The Gap..."
- "Gap #3 is killing your creative tests..."
- "Here's how to close Gap #1 in 30 minutes..."

---

### LinkedIn Post v2 - Mike Futia Style (Tool-First Format)
```
I just built a creative kill switch in Claude Code.

It monitors every new ad I launch.

After ₹3K spend, it checks one metric: Click → Add to Cart rate.

Below 1%? I get a WhatsApp: "Kill this ad. It's not going to convert."

Why this metric?

I was burning ₹1L+ on "creative tests" that looked fine in Ads Manager.

Good CTR. Decent CPC. Algorithm kept spending.

But Click → ATC told the real story:

- Winning UGC: 5.26% Click → ATC
- New templates: 0.17% Click → ATC

Same spend. 31x difference. One made money, one burned it.

Took me 2 months to catch manually.

Now the system catches it in 48 hours.

No dashboard. No login. Just a WhatsApp alert when something's dying.

Building more of these with Claude as my co-pilot.
```
**Format notes:** "I just built X" opener, tool-first then story, shorter lines, ends with "building more" hook.

### LinkedIn Post Guidelines (Learned)
- Hook under 49 characters
- No jargon ("zombie ads" = bad)
- Real numbers only, no vague claims
- Show the pattern, not just before/after
- Senior-level insights (not "add purchase column")
- Universal problems (applies to most brands, not just 3,000+ SKU catalogs)
- Click→ATC > CTR/CPC for creative quality

**Mike Futia style (tool-first format):**
- "I just built X" opener
- Show tool/output first, story second
- What it does → why I built it (not reverse)
- Shorter lines, faster pace
- End with "building more" hook
- Reference: linkedin.com/in/mike-futia-108709126

### LinkedIn Creator Research (May 2026)

| Creator | Focus | Style | Latest Post |
|---------|-------|-------|-------------|
| **Mike Futia** | Claude Code + AI automation | "I just built X" tool demos | Meta Ads CLI - plug Claude directly into Meta |
| **Olly Hudson** | DTC brand scaling (Soar With Us) | "We took client X → Y" + numbered lists | 60+ staff, 100+ clients agency scale |
| **Aditya Sriram** | GoMarble AI, India D2C | Problem → insight, India-specific | Agent Mode - AI that launches ads |
| **Bram Van der Hallen** | Meta Ads tutorials (100K followers) | Platform updates, no fluff | April 2026 Meta updates (CAPI required) |
| **Barry Hott** | "Ugly Ads" philosophy | Contrarian, $1B+ managed | "Ugly ≠ bad, ugly = authentic" |

**Style patterns:**
- Mike & Aditya: Tool announcements ("I built X" / "We shipped X")
- Olly: Agency results + frameworks
- Bram: Platform news + tutorials
- Barry: Philosophy/contrarian takes

**LinkedIn profiles:**
- linkedin.com/in/mike-futia-108709126
- linkedin.com/in/olly-hudson
- linkedin.com/in/adityasriram
- linkedin.com/in/bramvanderhallen
- linkedin.com/in/binghott (Barry Hott)

---

## Vishant's LinkedIn Profile (Proposed - May 2026)

### Current Profile
- **URL:** linkedin.com/in/vishant-jain-facebook-ads-specialist-roi-driven-ads
- **Current headline:** Facebook Ads Specialist | ROI-Driven Ads
- **Problem:** Generic, doesn't differentiate from 10,000 other media buyers

### New Headline Options
1. **RECOMMENDED:** Building Cosmisk — AI that catches ad spend leaks before you see them | 4+ yrs Meta Ads | Co-founder @SmashedAgency
2. $750K+ Q4 with static ads | Building AI tools for media buyers | Meta Ads for D2C brands
3. India's first AI ad monitoring system | Co-founder Cosmisk + Smashed Agency | Meta Ads since 2020

### New About Section
```
I run Meta ads for D2C brands. 4+ years, ₹10Cr+ managed.

But here's what I learned: the dashboard lies.

A brand can look profitable in Ads Manager while bleeding money from:
→ Ads running on out-of-stock products
→ Coupon codes leaked on discount sites
→ "Fresh" creatives that were dead on arrival

I caught ₹14Cr in waste across 3 brands. Manually. Took months.

So I'm building Cosmisk — an AI system that catches these leaks in 48 hours, not months.

It monitors Click→ATC rates, flags dying creatives, and sends WhatsApp alerts before you burn budget.

Currently: Co-founder at Smashed Agency (ad creatives for D2C) + building Cosmisk with Claude as my co-pilot.

What I post about:
• Meta Ads strategy (not beginner tips)
• Cross-platform blind spots (Meta + Shopify gaps)
• Building AI tools for performance marketing

DM me if you spend ₹10L+/month on Meta and want to find your leaks.
```

### Vishant's Existing Post Hooks (Analysis)
| Post | Hook Style | Works? |
|------|------------|--------|
| "After 4 years as a media buyer, I have one..." | Experience → insight | ✅ |
| "Last Q4, I made $750K+ with static ads" | Results-first flex | ✅ |
| "ROAS Is a Lie" | Contrarian take | ✅✅ Best |
| "The only Meta UGC ads guide you'll need" | Definitive guide | ✅ |
| "Even the best ads can't save a bad product" | Hard truth | ✅ |
| "What's it like to run an agency at 24?" | Personal story | ✅ |

**Positioning gap:** Not yet positioning as AI builder (Cosmisk angle missing)

---

## Competitor Database (30 Creators - May 2026)

### Tier 1: Rising Creators (10K-50K followers) — DIRECT COMPETITORS

| # | Name | Platform | Focus | Followers | Style | Link |
|---|------|----------|-------|-----------|-------|------|
| 1 | Mike Futia | LinkedIn/X | Claude Code + AI automation | ~15K | "I just built X" tool demos | linkedin.com/in/mike-futia-108709126 |
| 2 | Aditya Sriram | LinkedIn | GoMarble AI, India D2C | ~10K | Problem → insight, builder | linkedin.com/in/adityasriram |
| 3 | Ira Bodnar | LinkedIn | Claude Skills for marketing | ~12K | Automation time-saved | linkedin.com/in/bodnarira |
| 4 | Sarim Siddiqui | LinkedIn/Medium | Meta ads automation | ~8K | Tactical how-to, systems | linkedin.com/in/sarim-siddiqui- |
| 5 | Yash Nikam | LinkedIn | D2C performance (SleepyCat) | ~5K | Funnel optimization | in.linkedin.com/in/yash-nikam-485664264 |
| 6 | Deepak Kumar Jain | LinkedIn | India D2C growth agency | ~8K | "10X in 6 months" results | in.linkedin.com/in/onearistocrat |
| 7 | Ajeet Singh | LinkedIn | Meta + Google Ads, India | ~10K | AI + performance marketing | linkedin.com/in/ajeetsinghh |
| 8 | Oli Cimet | LinkedIn | Creative strategist, UGC | ~7K | DTC creative process | linkedin.com/in/ugcwitholi |
| 9 | Kurt Elster | X | Shopify expert | 16K | Podcast + consulting | x.com/kurtinc |
| 10 | Zach Stuck | X | Homestead agency | 42K | 7-9 figure ecom growth | x.com/zachstuck |

### Tier 2: Established Creators (50K-150K) — LEARN FROM STYLE

| # | Name | Platform | Focus | Followers | Style | Link |
|---|------|----------|-------|-----------|-------|------|
| 11 | Olly Hudson | LinkedIn | DTC scaling (Soar With Us) | ~60K | "We took X → Y" + lists | linkedin.com/in/olly-hudson |
| 12 | Bram Van der Hallen | LinkedIn | Meta Ads tutorials | 100K | Platform updates, no fluff | linkedin.com/in/bramvanderhallen |
| 13 | Barry Hott | LinkedIn/X | Ugly Ads philosophy | ~50K | Contrarian, $1B+ managed | linkedin.com/in/binghott |
| 14 | Dara Denney | LinkedIn/YT | Meta creative strategist | ~80K | Video tutorials, guides | linkedin.com/in/daradenney |
| 15 | Savannah Sanchez | LinkedIn/X | TikTok + Meta ads | ~70K | UGC + paid social | linkedin.com/in/savannahsanchez |
| 16 | Andrew Faris | LinkedIn/X/Pod | Ecommerce podcast | ~50K | Candid takes, frameworks | x.com/andrewjfaris |
| 17 | Depesh Mandalia | LinkedIn | BPM Method, FB ads | ~40K | Framework-heavy, courses | depeshmandalia.com |
| 18 | Jon Loomer | LinkedIn/Blog | Facebook ads education | ~100K | Deep tutorials, OG status | jonloomer.com |
| 19 | Cody Plofker | LinkedIn/X | Jones Road Beauty CMO | ~80K | 9-figure CMO insights | linkedin.com/in/cody-plofker-47a29b120 |
| 20 | Ash Melwani | LinkedIn/X | Obvi CMO | ~60K | Founder-led brand building | linkedin.com/in/ashvinmelwani |

### Tier 3: Big Names (150K+) — STUDY, DON'T COMPETE

| # | Name | Platform | Focus | Followers | Style | Link |
|---|------|----------|-------|-----------|-------|------|
| 21 | Nik Sharma | LinkedIn/X | "The DTC Guy" | 177K | Newsletter + deals | x.com/mrsharma |
| 22 | Chase Dimond | LinkedIn/X | Email marketing | 438K | #1 email influencer | x.com/ecomchasedimond |
| 23 | Davie Fogarty | X/YT | The Oodie, $1B+ DTC | 200K+ | Founder journey | x.com/daviefogarty |
| 24 | Nick Shackelford | LinkedIn/X | BREZ, $200M+ ad spend | 150K+ | "Creative is targeting" | linkedin.com/in/nickshackelford |
| 25 | Taylor Holiday | LinkedIn/X | CTC, ecom metrics | 100K+ | MER, profit-first | x.com/TaylorHoliday |

### Tier 4: India-Specific (Niche Advantage)

| # | Name | Platform | Focus | Followers |
|---|------|----------|-------|-----------|
| 26 | Aditya Sriram | LinkedIn | GoMarble AI | ~10K |
| 27 | Deepak Kumar Jain | LinkedIn | 6Months.in | ~8K |
| 28 | Yash Nikam | LinkedIn | SleepyCat | ~5K |
| 29 | Ajeet Singh | LinkedIn | Performance marketing | ~10K |
| 30 | **Vishant Jain** | LinkedIn | Cosmisk + Smashed | ~5K |

### Hook Styles That Work (Patterns)

| Style | Example | Who Uses It |
|-------|---------|-------------|
| "I just built X" | "I just built a creative kill switch in Claude Code" | Mike Futia, Ira Bodnar |
| "We took X → Y" | "We took a brand from £1K → £10K/day" | Olly Hudson, agencies |
| Contrarian | "ROAS is a lie" | Barry Hott, Vishant |
| Numbered list | "8 things we learned from 100 ads/week" | Olly Hudson, Cody Plofker |
| Results-first | "$750K+ Q4 with static ads" | Vishant, Ash Melwani |
| Platform update | "Meta just shipped X" | Bram Van der Hallen |

### Comment Strategy (Observed)
- **Barry Hott:** One-liner replies, often contrarian
- **Bram:** Technical clarifications on platform updates
- **Nik Sharma:** Engages with founders, deal-making angle
- **Rising creators:** Comment on bigger creators' posts daily (2-3 thoughtful comments)

### Posting Frequency
- Bram: ~18 posts/month (most active)
- Most others: 3-5 posts/week
- Big names on X: 1-2 posts/day

### Vishant's Unique Positioning
**Gap in market:** No India creator positioning as "AI + Meta Ads" builder
**Opportunity:** Be the Aditya Sriram / Mike Futia of India D2C
**Differentiator:** Cosmisk = AI that catches leaks (not just another agency)

---

### Key Decisions Made
- No public pricing (Instig8 model - discovery call first)
- Target: Rs 10L+/month ad spend (not Rs 3L+)
- WhatsApp-first alerts (not dashboards)
- Position as "performance intelligence layer" not "tool"
- Two service tiers: Done With You (Rs 3-5L one-time) vs Done For You (Rs 50-75K/month)
- Done With You = more expensive because knowledge transfer + independence
- Launch with what works today, build automation as clients come
- Manual OOS/discount checks for first 3 clients (~30 min/day each)
- Removed 9-agent promises — keeping it honest and deliverable

### OOS Detection (BUILT - May 2026)

**Location:** `server/src/services/oos-detector.ts` (~1030 lines)

**Key Functions:**
- `detectOOSAds()` — Fuzzy title matching between ads and Shopify products
- `detectCatalogOOS()` — Catalog-based detection for DPA ads
- `detectEnhancedOOS()` — Per-product spend via Meta async reports
- `runOOSCheck()` — Entry point for Watchdog integration

**Features:**
- Fuzzy matching with Fuse.js (handles partial product names)
- Per-product spend calculation via Meta async breakdown reports
- Shopify order verification (ignores products with recent sales)
- Variant-to-product mapping for accurate inventory checks
- Catalog item ID extraction from DPA ad creatives

**Watchdog Integration:** `ad-watchdog.ts:508-536`
- Automatically checks OOS on each account scan
- Creates `oos_wasted_spend` decisions when waste > ₹100
- Sends WhatsApp/Slack alerts for high waste (> ₹1000)

**Tests:** `server/src/__tests__/oos-detector.test.ts` (~1012 lines)

### Competitor Intel (BUILT - May 2026)

**Location:** `server/src/routes/competitor-spy.ts`

**Endpoints:**
- `GET /competitor-spy/search` — Search Meta Ad Library, returns grouped by page
- `GET /competitor-spy/analyze` — Search + Claude analysis (rate limited: 5/min)

**Features:**
- Meta Ad Library API integration (app token + user token fallback)
- Claude Sonnet analysis of competitor messaging patterns
- Estimated spend/impressions tracking
- Ad longevity detection (longer-running = likely profitable)

**Claude Analysis Includes:**
- Hook styles and CTA patterns
- Messaging patterns across ads
- Spend levels and ad longevity
- 2-3 actionable takeaways for user

### Still to Build (Bridge Service)

**1. Discount Leakage Detection**
- Scrape coupon sites (Firecrawl MCP ready)
- Match with Shopify discount codes
- Calculate margin loss
- Alert on leaked codes

**2. Inventory Velocity Prediction**
- Track Shopify sales velocity per SKU
- Predict days until OOS
- Alert before products run out
- Tie to ad performance

**3. Cohort/LTV Analysis**
- Segment Shopify customers by acquisition channel
- Calculate LTV per cohort
- Identify high-value vs discount-buyer segments
- LTV-adjusted CPA reporting

**4. Profit Dashboard for D2C Brands**
- True profit per product/campaign (not just ROAS)
- Connect: Meta Ads spend + Shopify revenue + COGs/margins + RTO/returns
- Surface "real" profit vs what Ads Manager shows
- Per-SKU profitability tracking
- Factor in: payment gateway fees, shipping costs, return rates
- Dashboard view + alerts when profit margins drop

### Static Ad Generator (BUILT - May 2026)

**Purpose:** Generate static ads using Gemini MCP based on winning patterns from own account + competitor intel.

**Gemini MCP (Installed)**
- Server: `@rlabs-inc/gemini-mcp` with `GEMINI_TOOL_PRESET=image`
- Tools: `gemini-generate-image`, `gemini-edit-image`, `gemini-analyze-image`
- Config: `~/.claude.json` → mcpServers.gemini

**Architecture**
```
1. STYLE EXTRACTION
   ├── Own Ad Account → Creative DNA → Winning patterns
   └── Competitor Intel → Their patterns
                       ↓
2. STYLE SYNTHESIS → StyleBrief for brand
                       ↓
3. PROMPT BUILDER
   ├── Product data (Shopify)
   ├── Style brief + Format (1:1, 9:16, 16:9)
   └── Copy (headline, CTA, offer)
                       ↓
4. GEMINI MCP (gemini-generate-image)
   └── Bulk generate → Multiple variants
                       ↓
5. OUTPUT → ./gemini-output/
```

**StyleBrief Interface**
```typescript
interface StyleBrief {
  brandName: string;
  colorPalette: string[];
  typography: "serif" | "sans-serif" | "display";
  layout: "product-center" | "lifestyle" | "split" | "text-overlay";
  textDensity: "minimal" | "moderate" | "heavy";
  hookStyle: "problem" | "result" | "curiosity" | "social-proof";
  ctaStyle: "direct" | "soft" | "urgency";
  toneOfVoice: "casual" | "premium" | "playful" | "authoritative";
  competitorGaps: string[];
  winningPatterns: string[];
}
```

**API Input/Output**
```typescript
// POST /static-ads/generate
{
  clientId: string;
  products: string[] | "bestsellers" | "new-arrivals";
  formats: ["1080x1080", "1080x1920", "1200x628"];
  variantsPerFormat: 3;
  includeOffer?: string;
}

// Response
{
  generated: [{ productId, format, variant, imagePath, prompt }];
  styleBriefUsed: StyleBrief;
  totalCost: string;
}
```

**Files to Create**
1. `server/src/services/static-ad-generator.ts` — Main service
2. `server/src/routes/static-ads.ts` — API endpoint
3. `server/scripts/run-static-ad-gen.mjs` — Test script

**Data Sources (Already Built)**
- `competitor-creative-intel.ts` — hookType, ctaType, creativeFormat, emotionalTriggers
- `creative-scorer.ts` — winningPatterns, topPerformingFormats
- `service-clients.ts` — Client context, stores

---

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS call code-review-graph MCP tools
before Grep/Glob/Read for codebase exploration, impact analysis, or code
review. Fall back to Grep/Read only when the graph doesn't cover the need.

See `.claude/code-review-graph-usage.md` for tool reference, phase-by-phase
guidance, and prompt patterns.

---

## MCP Servers (Claude Code Integrations)

**Location:** `/Users/vishatjain/Cosmisk/mcp-servers/`

### Installed MCP Servers

| Server | Status | Purpose | Setup |
|--------|--------|---------|-------|
| **Frame.io** | ✅ Working | Video review, timestamped comments | `mcp-servers/frameio/` |
| **Descript** | ✅ Built | Auto-captions, transcription | `mcp-servers/descript/` — needs API key |
| **Firecrawl** | ✅ Built | Web scraping, coupon site monitoring | `mcp-servers/firecrawl/` — needs API key |
| **Shopify** | ✅ Built | OOS detection, inventory, LTV analysis | `mcp-servers/shopify/` — needs client credentials |
| **code-review-graph** | ✅ Working | Codebase analysis | Auto-configured |
| **Context7** | ✅ Configured | Library documentation | Cloud-configured |
| **Slack** | ✅ Configured | Slack messaging | Cloud-configured |
| **Google Drive** | ✅ Configured | Docs/Sheets | Cloud-configured |
| **Canva** | ✅ Configured | Design automation | Cloud-configured |
| **Airtable** | ✅ Configured | Database | Cloud-configured |
| **SQLite** | ✅ Configured | Local database | Cloud-configured |
| **Railway** | ✅ Configured | Deployment | Cloud-configured |

### Setup Commands

```bash
# Firecrawl (discount leakage detection)
cd mcp-servers/firecrawl && ./setup.sh fc-YOUR_API_KEY

# Shopify (OOS detection, LTV analysis)
cd mcp-servers/shopify && ./setup.sh CLIENT_ID CLIENT_SECRET store.myshopify.com

# Descript (auto-captions)
cd mcp-servers/descript && node setup.js
```

### Bridge Service Workflows

Full workflows documented in: `mcp-servers/bridge-service-workflows.md`

1. **Discount Leakage:** Firecrawl scrapes coupon sites → Shopify validates codes
2. **OOS Detection:** Shopify get-products → Match with active Meta ads
3. **Inventory Velocity:** Shopify orders → Calculate days until OOS
4. **Competitor Intel:** Firecrawl crawls ad library → Feed to Creative DNA
5. **Cohort/LTV:** Shopify customers + orders → Segment analysis

---

## UGC Video Editing Workflow

**Production Team Member:** Adyaj uploads raw footage

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
