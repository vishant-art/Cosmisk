# The Gap Framework

> **Sales/Messaging Framework** — How we EXPLAIN what we do to clients.
> This is NOT the infrastructure. See [[strategic-cognition]] and [[memory-system]] for actual architecture.

## What Is The Gap?

The space between platforms where money disappears — nobody watches it.

```
META ←───── THE GAP ─────→ SHOPIFY
     (money leaks here)
```

**Important Distinction:**
- "The Gap" = **Messaging framework** (how we sell)
- Strategic Cognition + Memory = **Actual infrastructure** (what we built)

## The 5 Gaps (Agent Outputs)

These are the OUTPUTS of specific agents, packaged for client understanding:

| Gap | What Leaks | Agent That Detects It |
|-----|------------|-----------------------|
| **Gap 1: Inventory ↔ Ads** | Ads spending on OOS products | `oos-detector.ts` |
| **Gap 2: Discount Codes ↔ Margins** | Leaked codes on coupon sites | `discount-leakage-detector.ts` |
| **Gap 3: Clicks ↔ Purchases** | High CTR, low ATC (bait clicks) | `creative-scorer.ts` |
| **Gap 4: Acquisition ↔ LTV** | Scaling discount buyers (low LTV) | `cohort-ltv-analyzer.ts` |
| **Gap 5: Ad Comments ↔ Product** | Feedback ignored (sizing issues) | `comment-mining-agent.ts` |

## Real Numbers (Use These)

- Rs 14Cr waste identified across 3 brands
- 2,600 OOS products found (one scan)
- 77 zombie campaigns found (one scan)
- Rs 1.35Cr discount leakage found
- 31x Click-to-ATC difference (Casorro case)

## Positioning Rules

| DO SAY | DON'T SAY |
|--------|-----------|
| "We catch money leaks between platforms" | "AI generates ads" |
| "We watch The Gap" | "We're an AI creative tool" |
| "Intelligence that produces creatives" | "Creative generation platform" |

## The Gap vs The Infrastructure

| Layer | What It Is | Where It Lives |
|-------|-----------|----------------|
| **The Gap (Messaging)** | How we explain value to clients | This file |
| **Strategic Cognition** | Worldview synthesis, contradiction resolution | [[strategic-cognition]] |
| **Memory System** | Episodes, predictions, cross-client learning | [[memory-system]] |
| **Evidence Providers** | 8 types of evidence feeding synthesis | [[evidence-providers]] |
| **Quality Governance** | Rejection systems, anti-mediocrity | [[FOUNDER_DIRECTIVES]] |

## Links
- [[positioning]] — Competitive moat (what Meta+Claude can't do)
- [[service-model]] — How we deliver
- [[strategic-cognition]] — The actual brain (READ THIS)
- [[memory-system]] — How agents learn (READ THIS)
- [[evidence-providers]] — Agent pattern
- [[BRUTAL_AUDIT_2026-05-16]] — Full positioning audit

## Last Updated
2026-05-17 by Claude (Session 11 - Clarified messaging vs infrastructure)
