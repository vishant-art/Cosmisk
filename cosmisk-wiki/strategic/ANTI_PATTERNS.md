# Anti-Patterns — LOAD EVERY SESSION

> These are permanent rules. Violating them is architectural regression.

**Related:**
- [[FOUNDER_DIRECTIVES]] — Source of these rules
- [[QUALITY_CRISIS_AUDIT]] — Why these rules exist
- [[strategic-cognition]] — System that must follow these rules
- [[what-works]] — Patterns that DO work
- [[what-fails]] — More failure patterns

## NEVER SHIP

| Pattern | Example | Why It Fails |
|---------|---------|--------------|
| Score without cause | "Trust score: 50" | Founder can't act on a number |
| Fatigue without creative name | "Fatigue detected" | Which creative? What to do? |
| Opportunity without action | "Try social_proof" | Try how? With what? By when? |
| Recommendation without timeline | "Consider refreshing" | When? Tomorrow? Next month? |
| Insight visible in Ads Manager | "ROAS is 4.2x" | Founder already knows this |
| Averages without segments | "Avg CTR 2.3%" | Hides the real problem |
| Metrics without mechanism | "Conversions dropped" | WHY did they drop? |

## NEVER BUILD

| Pattern | Why It Fails |
|---------|--------------|
| Dashboard-style reports | Founders don't need more dashboards |
| Score systems without explanation | Numbers without meaning are noise |
| Evidence without decision | Data isn't insight |
| Synthesis without action | Understanding isn't operating |
| Quality gates that log but don't reject | Mediocrity still ships |

## NEVER SAY

```
❌ "Consider monitoring..."      → Say exactly what to watch and when
❌ "May indicate..."             → Say what it DOES indicate or don't say it
❌ "Potential opportunity..."    → Be specific or don't mention it
❌ "Further analysis needed..."  → Do the analysis or don't mention it
❌ "Market is maturing..."       → This means nothing operationally
❌ "Performance is declining..." → WHY is it declining? WHAT creative?
❌ "Trust is eroding..."         → WHY? From what behavior? What to do?
```

## ALWAYS REQUIRE

Every output must have:
1. **Specific creative/campaign name** — No generic references
2. **Specific numbers** — No ranges or approximations
3. **Specific timeline** — "Tomorrow" or "by Friday", not "soon"
4. **Causal explanation** — WHY this is happening
5. **Doable action** — Something founder can do in 48 hours

## THE FIVE GATES

Before any output ships, it must pass ALL:

1. **Specificity Gate** — Names specific entities with actual numbers
2. **Causality Gate** — Explains WHY, not just WHAT
3. **Action Gate** — Includes doable action within 48 hours
4. **Leverage Gate** — Reveals something impossible to see in 5 minutes manually
5. **Founder-Care Gate** — Founder would pay Rs 5,000 for this insight

**If ANY gate fails: DO NOT SHIP.**

## QUALITY MANTRAS

```
"Rejection is the feature."
"We don't generate outputs. We block mediocrity."
"Specific or silent."
"Decide, don't describe."
"One action beats ten insights."
```

## ARCHITECTURAL LESSONS LEARNED

1. Building more agents doesn't fix quality
2. Evidence providers are necessary but not sufficient
3. Synthesis without decision is worthless
4. Types shape outputs — design for action, not display
5. Quality gates must BLOCK, not LOG
6. LLM prompts must DEMAND specificity
7. Intelligence without operationalization is waste

---

*This file is foundational memory. Load in every session.*
