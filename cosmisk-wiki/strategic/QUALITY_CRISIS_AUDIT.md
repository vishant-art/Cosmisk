# Quality Crisis Audit — 2026-05-15

> Brutal honest assessment of why outputs are still mediocre despite sophisticated architecture.

**Related:**
- [[FOUNDER_DIRECTIVES]] — Vishant's explicit rules
- [[ANTI_PATTERNS]] — Rules derived from this audit
- [[VISUAL_CREATIVE_MEMORY_SYSTEM]] — Memory fix for token waste
- [[strategic-cognition]] — System being audited
- [[evidence-providers]] — Pattern we fixed
- [[pratapsons]] — Client we tested on

## THE CORE PROBLEM

We built **architecture** but not **judgment**.

The system generates outputs. It doesn't ask "should this exist?"

---

## PART 1: WHY MEDIOCRITY IS STILL SHIPPING

### 1. Quality Gates Check Structure, Not Value

Current quality-gate.ts checks:
- Did the LLM return valid JSON?
- Are required fields present?
- Is confidence above threshold?

It does NOT check:
- Would a founder care about this?
- Does this change any behavior?
- Is this impossible to manually see?
- Does this explain WHY, not just WHAT?

**Example of what passes:**
```
"Trust score: 50, trajectory: building"
```

This passes because:
- Valid format ✓
- Has confidence ✓
- Has interpretation ✓

But it's **operationally useless**.

### 2. Mediocrity Detector Is Toothless

`mediocrity-detector.ts` exists but:
- Runs AFTER generation (too late)
- Flags but doesn't reject
- Uses keyword matching, not semantic judgment
- Has no "founder-grade" test

**What it should do:** Block shipping entirely if output doesn't meet bar.

**What it does:** Log a warning and continue.

### 3. Evidence Providers Collect Data, Not Insight

Today's test showed:
```
EMOTIONAL EVIDENCE
  Current territory: excitement
  Fresh opportunities: aspiration, belonging, curiosity, trust, status
```

This is **database output**, not **strategic insight**.

A founder doesn't need to know "territory is excitement."

A founder needs to know:
- "Your aspiration hooks are exhausted because you've been running the same 'dream wardrobe' angle for 6 weeks"
- "Competitor X just launched trust-heavy UGC—you need to counter with founder story content in 48 hours"
- "Your skeptical audience segment (35%) is seeing the same ads 4.2x—they're actively tuning out"

### 4. Synthesis Engine Averages Instead of Decides

`synthesis-engine.ts` takes evidence and produces a "worldview."

But the worldview is a **weighted average**, not a **decision**.

```
dominantProblem: "none_identified"
primaryLeverage: "none_identified"
```

This means: "I looked at everything and concluded nothing."

A human strategist would say:
- "Your #1 problem is trust contamination from the 16 high-urgency issues"
- "Stop scaling until you fix the COD spike"
- "Your next 3 creatives should be founder-face trust rebuilders"

### 5. LLM Prompts Ask for Reports, Not Decisions

The prompts in ad-watchdog.ts and synthesis-engine.ts say:
- "Analyze the performance..."
- "Summarize the findings..."
- "Generate insights..."

They should say:
- "What is the ONE thing the founder must do tomorrow?"
- "What would you bet Rs 50,000 on being the root cause?"
- "If you could only give ONE recommendation, what would it be?"

### 6. No "So What?" Gate

Every output should pass a "So What?" test:

| Output | So What? Test |
|--------|---------------|
| "Trust score 50" | ❌ So what? What do I do? |
| "Fatigue detected" | ❌ So what? Which creative? Replace with what? |
| "Fresh opportunities: social_proof" | ❌ So what? What specific creative? |

Currently: No gate enforces this.

### 7. Dashboard Thinking Is Baked Into Types

Look at `FatigueEvidence`:
```typescript
exhaustedHooks: string[];
exhaustedFormats: string[];
freshOpportunities: string[];
```

This is **dashboard schema**. It's designed for display, not action.

Operator schema would look like:
```typescript
topPriorityCreativeToKill: {
  creativeId: string;
  creativeName: string;
  whyKill: string;
  expectedSavings: number;
  replacementRecommendation: string;
}
```

---

## PART 2: THE "DO NOT SHIP MEDIOCRITY" SYSTEM

### Principle: Rejection Is The Feature

The system's job is NOT to generate.
The system's job is to **block mediocrity from reaching founders**.

### The Five Gates

Every output must pass ALL five:

#### Gate 1: Specificity Gate
- Does it name specific campaigns/creatives/products?
- Does it include actual numbers (not ranges)?
- Does it reference actual dates/timelines?

**Fail example:** "Consider refreshing fatigued creatives"
**Pass example:** "Kill 'DSG_TOF_CATALOG_IND_CBO' (Rs 12,700 wasted this week). Replace with founder-story hook."

#### Gate 2: Causality Gate
- Does it explain WHY, not just WHAT?
- Does it trace cause → effect?
- Does it explain mechanism, not just correlation?

**Fail example:** "Trust is declining"
**Pass example:** "Trust is declining BECAUSE your COD rate spiked 23% after the price increase—customers are hedging against quality uncertainty"

#### Gate 3: Action Gate
- Is there a specific action?
- Is the action doable in 24-48 hours?
- Is the action within founder's control?

**Fail example:** "Monitor trust signals"
**Pass example:** "Record a 60-second 'behind the scenes' video today showing fabric quality check. Post tomorrow."

#### Gate 4: Leverage Gate
- Is this insight impossible to see manually in 5 minutes?
- Does it connect dots across multiple data sources?
- Does it reveal hidden leverage?

**Fail example:** "Your ROAS is 4.2x"
**Pass example:** "Your 4.2x ROAS is masking a problem: 67% of purchases are from 3 creatives, all using aspiration hooks. When those fatigue (est. 14 days), ROAS will cliff."

#### Gate 5: Founder-Care Gate
- Would a founder spending Rs 50L+/month actually change behavior from this?
- Would they forward this to their team?
- Would they pay Rs 5,000 just for this insight?

If any gate fails: **DO NOT SHIP**.

---

## PART 3: FOUNDATION MEMORY SYSTEM

### What Must Be Permanently Remembered

#### Anti-Patterns (NEVER DO)
```yaml
never_ship:
  - trust_score_without_cause
  - fatigue_detected_without_creative_name
  - opportunity_without_specific_action
  - recommendation_without_timeline
  - insight_founder_could_see_in_ads_manager

never_build:
  - dashboard_style_reports
  - score_without_explanation
  - metrics_without_mechanism
  - averages_without_segments
  - general_without_specific

never_say:
  - "consider monitoring"
  - "may indicate"
  - "potential opportunity"
  - "further analysis needed"
  - "market is maturing"
  - "performance is declining"
```

#### Architectural Lessons
```yaml
lessons_learned:
  - evidence_providers_are_necessary_but_not_sufficient
  - synthesis_without_decision_is_worthless
  - quality_gates_must_block_not_log
  - llm_prompts_must_demand_specificity
  - types_shape_outputs_design_for_action_not_display
  - building_more_agents_doesnt_fix_quality
  - intelligence_without_operationalization_is_waste
```

#### Founder Expectations
```yaml
founder_bar:
  - specific_creative_names_always
  - specific_numbers_always
  - specific_timelines_always
  - cause_explanation_always
  - action_within_48_hours_always
  - would_pay_5000_for_this_insight
```

---

## PART 4: OBSIDIAN STRATEGIC MEMORY STRUCTURE

```
cosmisk-wiki/
├── strategic/
│   ├── QUALITY_CRISIS_AUDIT.md          ← This file
│   ├── ANTI_PATTERNS.md                  ← Things we must never do
│   ├── FOUNDER_EXPECTATIONS.md           ← What founders actually need
│   ├── ARCHITECTURAL_LESSONS.md          ← Mistakes made, directions failed
│   ├── QUALITY_STANDARDS.md              ← The five gates
│   └── INTELLIGENCE_PHILOSOPHY.md        ← Why we exist
├── failures/
│   ├── DASHBOARD_THINKING.md             ← Why dashboards fail
│   ├── SCORE_WITHOUT_CAUSE.md            ← Why naked metrics fail
│   ├── GENERIC_SYNTHESIS.md              ← Why averaging fails
│   └── CONSULTANT_LANGUAGE.md            ← Why AI-speak fails
└── principles/
    ├── SPECIFICITY_OVER_COMPLETENESS.md
    ├── DECISIONS_OVER_REPORTS.md
    ├── REJECTION_IS_THE_FEATURE.md
    └── FOUNDER_GRADE_OR_NOTHING.md
```

---

## PART 5: QUALITY-FIRST INTELLIGENCE REDESIGN

### Current Flow (Broken)
```
Data → Evidence → Synthesis → Output → Quality Check → Ship
                                            ↓
                                      (always passes)
```

### Fixed Flow
```
Data → Evidence → "Is this evidence specific?"
                        ↓ NO → REJECT
                        ↓ YES
              → Synthesis → "Does this decide, not just describe?"
                                 ↓ NO → REJECT
                                 ↓ YES
                         → Action → "Is this doable in 48 hours?"
                                         ↓ NO → REJECT
                                         ↓ YES
                                  → Founder Gate → "Would they pay for this?"
                                                        ↓ NO → REJECT
                                                        ↓ YES
                                                   → SHIP
```

### The Key Change

**Before:** Quality gate is a checkpoint at the end.
**After:** Quality rejection is embedded at every stage.

---

## PART 6: VISUAL + STRATEGIC OUTPUT DESIGN

Current output:
```
Trust score: 50
Fatigue: detected
Opportunity: social_proof
```

Founder-grade output:
```
┌─────────────────────────────────────────────────────────────┐
│ 🚨 TRUST CRISIS DETECTED                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [SCREENSHOT: Your top ad with 4.1 frequency]                │
│                                                             │
│ This ad is being shown 4.1x to the same people.             │
│ Your skeptical segment (35% of audience) is tuning out.     │
│                                                             │
│ WHY: You increased prices 15% but your ads still say        │
│ "affordable luxury." The message-reality gap is eroding     │
│ trust.                                                      │
│                                                             │
│ DO THIS NOW:                                                │
│ 1. Pause 'DSG_TOF_CATALOG_IND_CBO' (wasting Rs 12,700/week) │
│ 2. Record 60-sec founder video showing fabric quality       │
│ 3. Launch as new ad tomorrow with "Why we raised prices"    │
│                                                             │
│ EXPECTED IMPACT: Trust score 50 → 65 in 14 days             │
│ CONFIDENCE: 78% (based on similar intervention at Casorro)  │
└─────────────────────────────────────────────────────────────┘
```

---

## PART 7: PREVENTING ARCHITECTURE LOOPS

### The Loop We Keep Repeating

1. Identify quality problem
2. Build new system/agent/layer
3. Feel good about architecture
4. Outputs are still mediocre
5. Identify quality problem
6. Repeat

### How To Break The Loop

**Rule:** No new architecture until existing outputs pass founder-grade test.

**Rule:** Every architectural discussion must start with: "Show me the last 3 outputs. Do they pass the five gates?"

**Rule:** If outputs don't pass gates, the problem is NOT missing architecture. The problem is weak prompts, weak gates, or weak rejection.

---

## PART 8: LOW TOKEN + HIGH CONTINUITY

### What To Load Every Session
```
cosmisk-wiki/strategic/ANTI_PATTERNS.md        (~200 tokens)
cosmisk-wiki/strategic/QUALITY_STANDARDS.md    (~300 tokens)
cosmisk-wiki/current/sprint.md                 (~200 tokens)
```

### What To Load On-Demand
```
Everything else via context routing.
```

### What To NEVER Load
```
Giant conversation history.
Repeated architecture explanations.
Full codebase context when debugging one file.
```

---

## PART 9: IMPLEMENTATION PRIORITY

### Phase 1: Fix The Prompts (This Week)
The LLM prompts are asking for reports. Change them to ask for decisions.

**Before:** "Analyze the performance data and generate insights"
**After:** "What is the ONE action the founder must take tomorrow? Name the specific creative. Explain why. Give the expected impact."

### Phase 2: Implement Hard Gates (This Week)
Make quality-gate.ts actually REJECT, not just log.

```typescript
if (!hasSpecificCreativeName(output)) {
  throw new Error('REJECTED: No specific creative named');
}
if (!hasSpecificAction(output)) {
  throw new Error('REJECTED: No specific action');
}
if (!hasCausalExplanation(output)) {
  throw new Error('REJECTED: No causal explanation');
}
```

### Phase 3: Persist Anti-Patterns (Today)
Write the strategic memory files. Make them part of every session's context.

### Phase 4: Redesign Output Types (Next Week)
Change the TypeScript interfaces from dashboard-style to action-style.

---

## FINAL TRUTH

The architecture isn't the problem.
The judgment is.

We built pipes. We didn't build taste.

The fix is not more pipes.
The fix is: **refuse to ship mediocrity**.

---

*This document must be loaded in every session.*
*This is foundational strategic memory.*
*Violations of these principles are architectural regression.*
