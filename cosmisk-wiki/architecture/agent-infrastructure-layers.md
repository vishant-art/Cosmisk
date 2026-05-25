# Agent Infrastructure Layers - Full 50+ Agent Map

> For landing page visualization
> Last updated: 2026-05-16

## The Loop: 5 Layers That Cycle Continuously

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│    ┌──────────┐                                                     │
│    │  LAYER 1 │ ◄──────────────────────────────────────────────┐    │
│    │  INGEST  │                                                │    │
│    └────┬─────┘                                                │    │
│         │                                                      │    │
│         ▼                                                      │    │
│    ┌──────────┐                                                │    │
│    │  LAYER 2 │                                                │    │
│    │  DETECT  │                                                │    │
│    └────┬─────┘                                                │    │
│         │                                                      │    │
│         ▼                                                      │    │
│    ┌──────────┐                                                │    │
│    │  LAYER 3 │                                                │    │
│    │ ANALYZE  │                                                │    │
│    └────┬─────┘                                                │    │
│         │                                                      │    │
│         ▼                                                      │    │
│    ┌──────────┐                                                │    │
│    │  LAYER 4 │                                                │    │
│    │SYNTHESIZE│                                                │    │
│    └────┬─────┘                                                │    │
│         │                                                      │    │
│         ▼                                                      │    │
│    ┌──────────┐                                                │    │
│    │  LAYER 5 │                                                │    │
│    │   ACT    │────────────────────────────────────────────────┘    │
│    └──────────┘                                                     │
│                                                                     │
│                    ∞ CONTINUOUS LOOP ∞                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## LAYER 1: INGEST (Data Collection)
*"Pull everything from everywhere"*

| Agent | What It Does |
|-------|--------------|
| `ad-watchdog.ts` | Main orchestrator - pulls Meta Ads data |
| `shopify-client.ts` | Pulls Shopify inventory, orders, products |
| `meta-api.ts` | Meta Ads API connection |
| `google-ads-api.ts` | Google Ads data |
| `meta-ads-scraper.ts` | Scrapes competitor ads from Ad Library |
| `signal-collector.ts` | Collects signals from all platforms |
| `platform-signals.ts` | Platform-specific signal parsing |
| `meta-warmup.ts` | Keeps API connections warm |
| `multi-account-aggregator.ts` | Aggregates across multiple ad accounts |
| `multi-region-aggregator.ts` | Aggregates across regions |

**Count: 10 agents**

---

## LAYER 2: DETECT (Gap & Issue Detection)
*"Find the problems hiding in plain sight"*

| Agent | What It Does |
|-------|--------------|
| `oos-detector.ts` | Detects out-of-stock products with active ads |
| `discount-leakage-detector.ts` | Finds leaked coupon codes |
| `fatigue-detector.ts` | Detects creative fatigue |
| `creative-detection.ts` | Identifies creative types/formats |
| `mediocrity-detector.ts` | Flags mediocre performance |
| `hook-decay-predictor.ts` | Predicts when hooks will stop working |
| `creative-lifespan-predictor.ts` | Predicts creative death |
| `emotional-exhaustion-detector.ts` | Detects audience emotional fatigue |
| `creator-trust-decay-predictor.ts` | Predicts trust erosion |
| `pre-launch-kill-system.ts` | Kills bad ideas before launch |

**Count: 10 agents**

---

## LAYER 3: ANALYZE (Deep Intelligence)
*"Understand WHY things are happening"*

| Agent | What It Does |
|-------|--------------|
| `comment-mining-agent.ts` | Extracts insights from ad comments |
| `creative-scorer.ts` | Scores creatives on 5 dimensions |
| `creative-analyzer.ts` | Deep creative analysis |
| `competitor-intel-report.ts` | Competitor strategy analysis |
| `competitor-creative-intel.ts` | Competitor creative analysis |
| `audience-saturation-analyzer.ts` | Audience saturation levels |
| `cohort-ltv-analyzer.ts` | LTV by acquisition cohort |
| `attributed-roas-analyzer.ts` | True ROAS attribution |
| `margin-weighted-roas-analyzer.ts` | Margin-adjusted ROAS |
| `geo-profitability-analyzer.ts` | Profitability by geography |
| `placement-efficiency-analyzer.ts` | Ad placement efficiency |
| `time-of-day-analyzer.ts` | Performance by time |
| `new-repeat-analyzer.ts` | New vs repeat customer analysis |
| `ltv-by-creative-analyzer.ts` | LTV by creative type |
| `rto-cod-analyzer.ts` | RTO and COD analysis |
| `creative-returns-analyzer.ts` | Return rates by creative |
| `inventory-velocity-predictor.ts` | Inventory movement prediction |
| `trend-analyzer.ts` | Trend detection |
| `causal-intelligence.ts` | Causal relationship discovery |
| `pattern-extractor.ts` | Pattern extraction |
| `category-pattern-extractor.ts` | Category-specific patterns |

**Count: 21 agents**

---

## LAYER 4: SYNTHESIZE (Worldview & Strategy)
*"Build the unified picture and decide"*

| Agent | What It Does |
|-------|--------------|
| `synthesis-engine.ts` | Combines all evidence → worldview |
| `worldview-schema.ts` | Defines the worldview structure |
| `strategic-intelligence-engine.ts` | Strategic recommendations |
| `strategic-memory.ts` | Remembers strategic context |
| `intelligence-core.ts` | Core intelligence processing |
| `intelligence-integration.ts` | Integrates all intelligence |
| `trust-state-router.ts` | Routes based on audience trust state |
| `persuasion-intelligence-engine.ts` | Persuasion strategy |
| `brand-persona-intelligence.ts` | Brand persona alignment |
| `adaptive-trust-infrastructure.ts` | Adapts to trust shifts |
| `funnel-aware-sequencer.ts` | Funnel-stage sequencing |
| `cultural-timing-adapter.ts` | Cultural timing optimization |
| `founder-voice-cloner.ts` | Maintains founder voice |
| `creative-reasoning.ts` | Creative strategy reasoning |
| `creative-strategist.ts` | Creative direction |
| `creative-intelligence.ts` | Creative intelligence synthesis |
| `elite-decision-compression.ts` | Compresses to ONE priority |
| `narrative-synthesis.ts` | Creates narrative from data |
| `reasoning-engines.ts` | Multi-engine reasoning |
| `thinking-quality-evaluator.ts` | Evaluates reasoning quality |

**Count: 20 agents**

---

## LAYER 5: ACT (Execute & Deliver)
*"Take action and deliver outputs"*

| Agent | What It Does |
|-------|--------------|
| `autopilot-engine.ts` | Auto-executes decisions |
| `automation-engine.ts` | General automation |
| `static-ad-generator.ts` | Generates ad creatives |
| `static-ad-generator-v2.ts` | Improved creative generation |
| `strategic-creative-generator.ts` | Strategy-driven creatives |
| `gemini-generator.ts` | AI image generation |
| `weekly-report-generator.ts` | Weekly reports |
| `client-report-generator.ts` | Client-facing reports |
| `operator-report-generator.ts` | Operator reports |
| `html-report.ts` | HTML report rendering |
| `morning-briefing.ts` | Daily briefings |
| `notifications.ts` | Push notifications |
| `email.ts` | Email delivery |
| `whatsapp-elite.ts` | WhatsApp delivery |
| `quick-wins.ts` | Quick win identification |
| `recommendation-loop.ts` | Continuous recommendations |
| `learning-engine.ts` | Learns from outcomes |

**Count: 17 agents**

---

## SUPPORT LAYER (Infrastructure)
*"The foundation everything runs on"*

| Agent | What It Does |
|-------|--------------|
| `llm-gateway.ts` | Routes all LLM calls |
| `agent-orchestrator.ts` | Orchestrates agent execution |
| `agent-brain.ts` | Agent coordination |
| `agent-memory.ts` | Agent memory management |
| `agent-chains.ts` | Chains agents together |
| `unified-agent-runner.ts` | Runs agents uniformly |
| `quality-gate.ts` | Quality checks |
| `elite-quality-gate.ts` | Elite quality threshold |
| `quality-scorer.ts` | Scores output quality |
| `quality-gated-runner.ts` | Runs with quality gates |
| `factual-validation.ts` | Validates facts |
| `build-gate.ts` | Pre-build validation |
| `job-queue.ts` | Job scheduling |
| `audit-scheduler.ts` | Scheduled audits |
| `service-clients.ts` | External service clients |
| `intelligence-persistence.ts` | Persists intelligence |
| `stateful-intelligence.ts` | Maintains state |

**Count: 17+ agents**

---

## TOTAL AGENT COUNT

| Layer | Count | Purpose |
|-------|-------|---------|
| Layer 1: Ingest | 10 | Data collection |
| Layer 2: Detect | 10 | Gap detection |
| Layer 3: Analyze | 21 | Deep analysis |
| Layer 4: Synthesize | 20 | Strategy & decisions |
| Layer 5: Act | 17 | Execute & deliver |
| Support | 17+ | Infrastructure |

**TOTAL: 95+ agents/services**

---

## Animation Concept for Landing Page

### Visual: Circular Loop with 5 Rings

```
                    ┌─────────────────┐
                    │   LAYER 1       │
                    │    INGEST       │
                    │  (10 agents)    │
                    └────────┬────────┘
                             │
         ┌───────────────────┴───────────────────┐
         │                                       │
    ┌────┴────┐                             ┌────┴────┐
    │ LAYER 5 │                             │ LAYER 2 │
    │   ACT   │                             │  DETECT │
    │   (17)  │                             │   (10)  │
    └────┬────┘                             └────┬────┘
         │                                       │
         │         ┌─────────────────┐          │
         │         │                 │          │
         │         │   WORLDVIEW     │          │
         └────────►│   (center)      │◄─────────┘
                   │                 │
         ┌─────────┤   SYNTHESIS     ├──────────┐
         │         │                 │          │
         │         └─────────────────┘          │
         │                                       │
    ┌────┴────┐                             ┌────┴────┐
    │ LAYER 4 │                             │ LAYER 3 │
    │SYNTHESIZE│                            │ ANALYZE │
    │   (20)  │                             │   (21)  │
    └─────────┘                             └─────────┘
```

### Animation Sequence:
1. **Start**: Center "Worldview" pulses
2. **Layer 1 lights up**: Data flows in from edges
3. **Layer 2 activates**: Detection agents highlight
4. **Layer 3 processes**: Analysis agents work
5. **Layer 4 synthesizes**: Strategy forms
6. **Layer 5 executes**: Actions taken
7. **Loop back to Layer 1**: Continuous cycle

### Interactive Features:
- Hover on any layer → See all agents in that layer
- Click agent → See what it does
- Data particles flow between layers
- Real metrics pulse in center

---

## Implementation Notes

### Tech Stack:
- SVG for the circular diagram
- CSS animations for pulse/glow effects
- GSAP for data flow particles
- React state for hover interactions

### Key Visual Elements:
1. Concentric rings (5 layers)
2. Agent nodes on each ring
3. Connection lines between layers
4. Central "Worldview" hub
5. Data particles flowing clockwise
6. Glow effects per layer (color-coded)

### Colors:
- Layer 1 (Ingest): Blue #3B82F6
- Layer 2 (Detect): Red #EF4444
- Layer 3 (Analyze): Purple #8B5CF6
- Layer 4 (Synthesize): Orange #F5A623
- Layer 5 (Act): Green #10B981
- Center: White/Gold glow
