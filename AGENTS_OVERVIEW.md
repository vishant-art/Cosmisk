# Cosmisk Agents Overview

> **For:** Partner understanding what we've built
> **Purpose:** Describe the AI agents that power the "6 Functions" we sell

---

## How It All Connects

```
┌─────────────────────────────────────────────────────────────────────┐
│                    THE INTELLIGENCE SYSTEM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│   │  WATCHDOG   │────▶│  AUTOPILOT  │────▶│   ALERTS    │          │
│   │   AGENT     │     │   ENGINE    │     │  (WhatsApp) │          │
│   └─────────────┘     └─────────────┘     └─────────────┘          │
│         │                                                           │
│         ▼                                                           │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│   │  FATIGUE    │────▶│   CONTENT   │────▶│   BRIEFS    │          │
│   │  DETECTOR   │     │    AGENT    │     │  (Output)   │          │
│   └─────────────┘     └─────────────┘     └─────────────┘          │
│         │                                                           │
│         ▼                                                           │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│   │    OOS      │     │   REPORT    │     │   MORNING   │          │
│   │  DETECTOR   │     │    AGENT    │     │  BRIEFING   │          │
│   └─────────────┘     └─────────────┘     └─────────────┘          │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │                    AGENT MEMORY                           │     │
│   │    (Learns from every decision, gets smarter over time)  │     │
│   └──────────────────────────────────────────────────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## The Agents

### 1. Ad Watchdog Agent
**File:** `server/src/services/ad-watchdog.ts`

**What it does:**
- Monitors all ad accounts 24/7
- Analyzes campaign performance (ROAS, CPA, CTR trends)
- Detects anomalies and issues
- Makes decisions: pause, scale, or flag for review

**Powers this function:** 24/7 Monitoring

**Example output:**
> "Campaign 'Summer Sale' has ROAS declining 3 days in a row (4.2x → 3.1x → 2.4x). Recommend pausing or reducing budget."

---

### 2. Fatigue Detector
**File:** `server/src/services/fatigue-detector.ts`

**What it does:**
- Analyzes every creative for fatigue signals
- Tracks frequency (>3.5 = warning, >4.5 = critical)
- Monitors CTR decline over 7 days
- Monitors CPM spikes
- Predicts "death date" for each creative

**Powers this function:** Fatigue Prediction (48-72 hours ahead)

**Statuses it assigns:**
| Status | Meaning |
|--------|---------|
| `scaling` | High ROAS, low frequency, keep pushing |
| `healthy` | Performing well, no issues |
| `watch` | Early warning signs, monitor closely |
| `fatiguing` | High frequency or declining metrics, replace soon |
| `dead` | Spend but zero conversions, kill immediately |

**Example output:**
> "Creative 'UGC_GoldSharara_v2' is fatiguing. Frequency: 4.2, CTR down 18% in 7 days. Predicted death: 3 days. Recommend replacement."

---

### 3. OOS Detector (Out-of-Stock)
**File:** `server/src/services/oos-detector.ts`

**What it does:**
- Pulls out-of-stock products from Shopify
- Matches them to active Meta ads
- Calculates wasted spend on OOS products
- Fuzzy matches product names to ad names

**Powers this function:** Waste Detection

**Example output:**
> "Found 12 ads promoting out-of-stock products. Total wasted spend: Rs 47,000 in last 7 days."

---

### 4. Autopilot Engine
**File:** `server/src/services/autopilot-engine.ts`

**What it does:**
- Runs continuous analysis on all accounts
- Generates alerts (critical, warning, info)
- Compares today vs yesterday performance
- Detects sudden drops or spikes

**Powers this function:** 24/7 Monitoring + Alerts

**Alert types:**
- Performance drop detected
- Budget pacing issue
- High frequency warning
- ROAS anomaly

---

### 5. Content Agent (Brief Generator)
**File:** `server/src/services/content-agent.ts`

**What it does:**
- Analyzes top-performing creatives
- Cross-references agent memory (what worked before)
- Identifies winning formats, hooks, visual styles
- Generates data-driven creative briefs
- Avoids formats that previously underperformed

**Powers this function:** Brief Generation

**Example output:**
```
Recommended Briefs:
1. Format: UGC Talking Head
   Hook: "Problem-Solution"
   Visual: "Lifestyle outdoor"
   Priority: HIGH
   Rationale: "Similar format achieved 8.2x ROAS last month"

2. Format: Product Demo
   Hook: "Before/After"
   Visual: "Clean studio"
   Priority: MEDIUM

Avoid:
- Carousel format (0.8x ROAS in last 3 attempts)
- "Discount" hooks (attracted low-quality traffic)
```

---

### 6. Creative Strategist Agent
**File:** `server/src/services/creative-strategist.ts`

**What it does:**
- Thinks contextually about what concepts will work for a specific brand
- Uses 3-tier memory (core/episodic/entity)
- References creative patterns taxonomy
- Generates UGC concepts with confidence scores
- Learns from feedback loops

**Powers this function:** Pattern Learning

**Example output:**
```
Brand Analysis: Fashion brand targeting 25-35 women, premium positioning

Recommended Concepts:
1. Hook: "I was skeptical until..."
   Demo: Show fabric quality close-up
   Tone: Authentic, relatable
   Confidence: HIGH (similar worked for Brand X)

Anti-Patterns to Avoid:
- Hard sell CTA (brand audience responds to soft sell)
- Overly polished studio look (authentic performs better)
```

---

### 7. Morning Briefing Agent
**File:** `server/src/services/morning-briefing.ts`

**What it does:**
- Runs daily at 7 AM
- Gathers all data sources (watchdog, autopilot, ad performance)
- Synthesizes into executive summary via Claude
- Generates action items for the day
- Sends via Slack/WhatsApp

**Powers this function:** Daily Command Center

**Example output:**
```
Good morning! Here's your briefing:

SUMMARY:
Yesterday spent Rs 1.2L with 3.8x ROAS (down from 4.1x).
2 campaigns need attention, 3 creatives approaching fatigue.

ACTION ITEMS:
1. Review Campaign "Diwali Sale" - ROAS dropped 15%
2. Approve replacement briefs for fatiguing UGC ads
3. Check OOS alert - 4 products need pause

PENDING DECISIONS:
- Watchdog recommends pausing "Red Kurta" campaign
```

---

### 8. Report Agent
**File:** `server/src/services/report-agent.ts`

**What it does:**
- Runs weekly per client
- Fetches all Meta Ads performance data
- Builds strategic report via Claude
- Includes memory-aware commentary ("Last report noted X, checking if trend continued")
- Generates insights and recommendations

**Powers this function:** Weekly Reporting

**Example output:**
```
WEEKLY REPORT: April 22-28, 2026

PERFORMANCE:
- Spend: Rs 8.4L
- Revenue: Rs 32.1L
- ROAS: 3.82x (up from 3.41x last week)

TOP CAMPAIGNS:
1. "Gold Collection" - 5.2x ROAS, Rs 12L revenue
2. "New Arrivals" - 4.1x ROAS, Rs 8L revenue

KEY INSIGHTS:
- UGC format outperforming studio by 40%
- Weekend performance consistently higher
- Age 25-34 segment driving 60% of conversions

RECOMMENDATIONS:
1. Increase budget on "Gold Collection" by 20%
2. Create more UGC for "New Arrivals"
3. Test weekend-only campaigns
```

---

### 9. Creative Scorer
**File:** `server/src/services/creative-scorer.ts`

**What it does:**
- Scores creatives BEFORE they launch (0-100)
- 5 dimensions: Pattern Match, Hook Quality, Format Signal, Data Confidence, Novelty
- Predicts ROAS range based on historical data
- Zero Claude calls (pure algorithm)

**Powers this function:** Pattern Learning + Quality Control

**Example output:**
```
Creative Score: 78/100

Dimensions:
- Pattern Match: 18/20 (matches "Problem-Solution" pattern)
- Hook Quality: 16/20 (strong opening)
- Format Signal: 14/20 (UGC performing well this month)
- Data Confidence: 15/20 (enough historical data)
- Novelty: 15/20 (new angle, not over-used)

Predicted ROAS: 2.8x - 4.2x (p50: 3.4x)
```

---

### 10. Sales Agent
**File:** `server/src/services/sales-agent.ts`

**What it does:**
- Analyzes usage and billing data per client
- Detects upsell opportunities
- Detects churn risks
- Generates sales/success intelligence

**Powers this function:** Internal (customer success)

**Example output:**
```
CLIENT: Pratap Sons
STATUS: Upsell Opportunity

SIGNALS:
- Ad spend increased 40% this month
- Hitting usage limits on creative generation
- High engagement with briefings

RECOMMENDATION:
- Propose upgrade to Scale tier
- Highlight: "You're generating 80% more than Growth tier allows"
```

---

## Agent Memory System
**File:** `server/src/services/agent-memory.ts`

**What it does:**
- 3-tier memory: Core (brand facts), Episodic (past decisions), Entity (people/products)
- Every agent decision is recorded
- Feedback loops: reinforce good decisions, penalize bad ones
- Context window built for each agent call

**Why it matters:**
> "The system gets smarter over time. If a format failed 3 times, it won't recommend it again."

---

## Summary: Agents → Functions

| Function We Sell | Agents That Power It |
|------------------|---------------------|
| 24/7 Monitoring | Watchdog + Autopilot |
| Fatigue Prediction | Fatigue Detector |
| Pattern Learning | Creative Strategist + Creative Scorer |
| Brief Generation | Content Agent |
| Auto Production | (To be built - Creative Engine) |
| Approval Workflow | Morning Briefing + Dashboard |

---

## What's Built vs What's Coming

### Built & Working
- Ad Watchdog Agent
- Fatigue Detector
- OOS Detector
- Autopilot Engine
- Content Agent (Brief Generator)
- Creative Strategist
- Morning Briefing
- Report Agent
- Creative Scorer
- Agent Memory System

### Coming Next
- **Creative Engine** - Auto-generate videos/images (Sora 2, HeyGen)
- **Auto-Publish** - Push creatives directly to Meta
- **WhatsApp Alerts** - Real-time notifications

---

*Last updated: May 1, 2026*
