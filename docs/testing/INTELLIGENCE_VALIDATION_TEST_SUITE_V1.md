# COSMISK — INTELLIGENCE VALIDATION TEST SUITE v1

**Status:** Fixed benchmark, version 1. Frozen once first executed.
**Scope:** Testing framework only. No implementation, no schema, no code changes.
**Build this version was authored against:** `origin/main` @ `2ef777da` (`apps/api/**`).
**Companion document:** Batch 2 Brand-Aware Intelligence Handoff (`docs/slice-2/README.md`).

---

## 1. PURPOSE

This benchmark answers one question:

> **Is Cosmisk producing specific, evidence-grounded, brand-aware intelligence — or generic AI marketing advice with a brand name pasted on top?**

It exists because that question cannot be answered by unit tests, type checks, or a demo. A response can be fluent, correctly formatted, plausibly structured, and still contain nothing that required reading this particular advertising account. Existing engineering signals do not detect that failure. This benchmark does.

**How it is used:**

1. A developer runs the tests against a specific build and records the raw output verbatim.
2. The product side reviews the recorded output independently, without watching the run.
3. Scores and failures are recorded against a fixed test ID so the same tests can be re-run on a later build and compared.

**When it is run.** This benchmark runs **in parallel with ongoing development, not after it.** It is not a release gate and it does not wait for any slice to be declared complete. Run it against whatever build exists whenever a build is meaningful enough to answer questions, and run it again on the next one. A large proportion of NOT RUN — blocked results on an early build is the expected and useful outcome (§14.6); those blocked entries are the coverage measurement, and they are what makes the second run comparable. Waiting until the system is "ready" destroys the comparison this document exists to produce.

**Why the separation matters.** A developer who has just built a feature is the worst-placed person to judge whether its output is intelligent. They know what the system *intended* to say, so they read intent into vague output. The developer's job here is execution and faithful transcription. The judgement happens elsewhere. **Developers must not be treated as the final judge of AI quality.**

**Consequences for the design of this document:**

- Every question is written out verbatim so two people running it get the same input.
- Every scenario names the brand, the data, and the surface it runs against.
- Every test states expected behaviour, pass conditions and fail conditions before the run, not after.
- Raw responses are preserved unedited.
- Anything that cannot actually be run today is marked **NOT CURRENTLY TESTABLE** rather than written as if it worked.

---

## 2. WHAT THE BENCHMARK TESTS

| # | Dimension | Question it answers |
|---|---|---|
| 1 | **Brand specificity** | Does the output name this brand's actual products, categories, price reality, creatives, or campaigns — or does it speak in category generalities? |
| 2 | **Evidence grounding** | Is every claim traceable to an observed number, a quoted creative, or a captured brand attribute? |
| 3 | **Correct use of brand context** | Is brand context used as an *input to reasoning*, or merely restated back to the reader? |
| 4 | **Reasoning quality** | Does the output connect two or more independent pieces of evidence into a conclusion neither one supports alone? |
| 5 | **Actionability** | Can a founder act on this within 48 hours without asking a follow-up question? |
| 6 | **Non-genericness** | Would this answer survive being shown to a different advertiser in the same category? (It should not.) |
| 7 | **Uncertainty handling** | When evidence is missing, does the system say so — or fill the gap with fluent invention? |
| 8 | **Absence of unsupported claims** | Does the output assert things about the brand, its customers, or its market that no available data supports? |

These eight dimensions are the scoring rubric in §10. They are listed here so that a reader knows what the tests are aimed at before reading any individual test.

---

## 3. WHAT THE BENCHMARK DOES NOT TEST

This is as important as §2. Passing this benchmark does not mean the product is finished, and failing it does not mean the engineering is bad.

**Not tested here:**

- **Correctness of the underlying ad metrics.** If Meta reports the wrong ROAS, this benchmark will not catch it. It tests reasoning over the numbers, not the numbers.
- **Latency, cost, token usage, or rate limits.** Operational concerns belong in a different harness.
- **UI rendering.** Whether the finding displays correctly is a separate concern from whether the finding is worth displaying.
- **Determinism or exact wording.** LLM output varies between runs. This benchmark deliberately does not define expected strings. Two materially different phrasings of the same well-grounded finding both pass.
- **Coverage of every product surface.** Only the surfaces named in §15 are exercised.
- **Scraping accuracy.** Whether the website analyser extracted the right headline is a data-quality question. This benchmark tests what happens to the fields *after* extraction.
- **Statistical significance of the recommendation.** Whether a suggested budget shift would actually improve ROAS is a business outcome, testable only in market.
- **Security, permissions, multi-tenancy.** Out of scope.

**A specific non-goal:** this benchmark does not produce a number that can be quoted as "Cosmisk is 74% intelligent." The rubric in §10 is an aid to consistent human judgement, not a measurement instrument. See the caveat in §10.4.

---

## 4. CORE INTELLIGENCE STANDARD

Every test in this document evaluates the same chain:

```
BRAND CONTEXT
    +
OWN ACCOUNT / CREATIVE / PRODUCT EVIDENCE
    ↓
COSMISK REASONING
    ↓
BRAND-SPECIFIC FINDING
    ↓
EVIDENCE
    ↓
USEFUL ACTION
```

### 4.1 What does not count as success

The following are all engineering milestones. **None of them is an intelligence result:**

- The website was scraped.
- Brand fields were extracted.
- A brand record was created.
- Brand context was persisted to the database.
- Brand context was retrieved on request.
- Brand context was inserted into an LLM prompt.
- The LLM produced a well-written, confident paragraph.

Every one of those can be true while the output is worthless. The chain above is only satisfied at the point where the **finding could not have been written without the brand context and the account evidence together.**

### 4.2 The mirror-finding failure

> **A response that merely repeats the brand profile is NOT a successful intelligence result.**

If Cosmisk is told "this brand is premium and sells occasion wear," and Cosmisk replies "as a premium occasion-wear brand, you should emphasise quality and craftsmanship," that is a *summary of the input*. It is the most common failure mode in brand-aware systems and it is dangerous precisely because it reads as competent and on-brand.

A finding must add information that was not in either input on its own.

### 4.3 The governing test

> **If an output could have been written without reading this specific account, it does not ship.**

This is applied literally in §16.

---

## 5. TEST BRAND ARCHETYPES

Six archetypes. Each is defined by the *reasoning problem it creates*, not by industry label. Testability is assessed against the build named at the top of this document and explained in full in §15.

---

### AR-1 — Catalog-heavy fashion / ecommerce

**Reasoning problem:** many SKUs, many categories, spend spread thin. The intelligence task is portfolio allocation — which part of the catalog is carrying the account and which part is being subsidised.

**Characteristics:** 100+ products, several collections, wide price range, seasonal drops, high creative volume with low creative differentiation (product-on-model imagery).

**Testability: CURRENTLY TESTABLE.**
Three fashion brands are seeded and mapped to real Meta ad accounts (`casorro`, `pratap-sons`, `salt-attire` — `apps/api/scripts/seed-brands.ts`, `apps/api/scripts/run-audit.ts`). Each has a live domain the website analyser can reach.

---

### AR-2 — Catalog-heavy skincare / beauty

**Reasoning problem:** claims are regulated and concentration-specific. Products differ by active ingredient and skin concern rather than by style. The intelligence task is matching creative claim to product evidence, and detecting claims the product cannot support.

**Characteristics:** 10–40 SKUs, ingredient-led positioning, repeat-purchase economics, before/after and dermatologist-adjacent creative.

**Testability: NOT CURRENTLY TESTABLE.**
No skincare or beauty brand exists in the seeded brand set or the CLI brand map, and there is no mechanism to add one without a live connected Meta ad account for that brand. The brand map in `apps/api/scripts/run-audit.ts` is a hardcoded three-entry object; all three are `category: 'fashion'`. Adding a fictional skincare brand would produce a run with no ad data, which tests nothing.
**What would make it testable:** one connected skincare Meta ad account with ≥30 days of spend, plus a brand record pointing at its domain.

---

### AR-3 — Creative-heavy DTC (single product or narrow range)

**Reasoning problem:** the catalog cannot explain performance because there is effectively one product. All variance is creative variance — hook, format, presenter, angle. The intelligence task is isolating which creative attribute drives the difference.

**Characteristics:** 1–5 SKUs, UGC-led, high creative iteration rate, performance differences of 2–3× between ads selling the identical item.

**Testability: PARTIALLY TESTABLE.**
The *reasoning path* is exercisable — the audit path reads ad-level creative data and ad copy. But no single-product DTC brand is present in the seeded brand set, so tests must be run against a fashion account and the reviewer must accept that the catalog dimension is not neutralised. Findings from AR-3 tests run this way are indicative, not conclusive.
**What would make it fully testable:** one connected narrow-range DTC account in the brand map.

---

### AR-4 — Premium positioning-led

**Reasoning problem:** positioning constrains tactics. A brand whose entire equity is built on non-discounting has a real cost when its ads lead with discounts. The intelligence task is detecting tension between stated positioning and observed creative behaviour, and reasoning about the trade-off rather than flagging it as a rule violation.

**Characteristics:** deliberately high price point, no or rare discounting, craft/heritage/scarcity narrative, brand equity as a defended asset.

**Testability: NOT CURRENTLY TESTABLE.**
There is no `price_positioning` field anywhere in the schema. `git grep` for `price_positioning`, `core_promise`, and `differentiators` across `apps/` returns zero matches on this build. The only price signal is `pricePoint`, a three-way bucket (`low` / `mid` / `high`) derived arithmetically from the *average scraped product price* in `apps/api/src/audit/website-analysis.ts`. That is a price band, not a positioning statement — a brand can be expensive and mass-market, or cheap and premium-positioned. There is no field in which a stated positioning could be recorded, so there is nothing for the system to reason against.
**What would make it testable:** BC-2 `price_positioning` as a captured, user-correctable attribute with source/confidence metadata, as specified in the Batch 2 handoff §6.

---

### AR-5 — New brand / low data

**Reasoning problem:** the honest answer is often "there is not enough evidence yet." The intelligence task is *restraint* — correctly identifying that a conclusion is unavailable and saying which specific evidence would unlock it.

**Characteristics:** <30 days of spend, few conversions per ad set, no statistically usable creative comparison.

**Testability: PARTIALLY TESTABLE.**
Low-data conditions can be induced on a real account by narrowing the date range (`--days=7`, or a `date_preset` producing a thin window). This is a genuine low-evidence condition and the restraint behaviour is observable. It is not a true new-brand condition, because account history exists even if the queried window is thin, and the system may reach outside the window.
**What would make it fully testable:** a connected account genuinely under 30 days old.

---

### AR-6 — Seasonal / context-dependent

**Reasoning problem:** the same metric means opposite things in different periods. A CPA rise during a festive peak with rising volume is not the same failure as a CPA rise in a flat period. The intelligence task is interpreting performance relative to context rather than absolutely.

**Characteristics:** demand concentrated in identifiable windows (festive, wedding season, end-of-season sale), planned discount periods, deliberate CAC inflation during peak.

**Testability: PARTIALLY TESTABLE.**
Indian fashion accounts in the seeded set do have seasonal structure, and a date range covering a known festive window can be selected. But no field records that a period *is* seasonal for this brand, so any correct seasonal reasoning would have to be inferred by the model from the data alone rather than supplied as context. A pass here is therefore weak evidence, and a failure is expected rather than diagnostic.
**What would make it fully testable:** brand-level seasonality context (known peak windows, planned promotional calendar) as a captured attribute.

---

### 5.7 Summary of archetype availability

| ID | Archetype | Testability | Blocking reason |
|---|---|---|---|
| AR-1 | Catalog-heavy fashion / ecommerce | **CURRENTLY TESTABLE** | — |
| AR-2 | Catalog-heavy skincare / beauty | **NOT CURRENTLY TESTABLE** | No connected brand in category |
| AR-3 | Creative-heavy DTC | **PARTIALLY TESTABLE** | No narrow-range brand connected |
| AR-4 | Premium positioning-led | **NOT CURRENTLY TESTABLE** | No positioning field exists in schema |
| AR-5 | New brand / low data | **PARTIALLY TESTABLE** | Simulated via date window, not a true new account |
| AR-6 | Seasonal / context-dependent | **PARTIALLY TESTABLE** | No seasonality context captured |

Two of six archetypes cannot be run at all today. That is a finding about the build, not a defect in this benchmark, and the tests for those archetypes are written out in full so they can be executed unchanged once the capability exists.

---

## 6. TEST MATRIX

Twenty tests across ten categories. Test IDs are permanent. A test ID always refers to the same scenario and the same question, in every build, forever.

| ID | Category | Name | Archetype | Testability |
|---|---|---|---|---|
| **B2-01** | A — Brand understanding | Does it know what this brand actually sells | AR-1 | CURRENTLY TESTABLE |
| **B2-02** | A — Brand understanding | Brand attributes distinguished from assumptions | AR-1 | PARTIALLY TESTABLE |
| **B2-03** | B — Brand → creative | Which creatives fit what this brand stands for | AR-1 | CURRENTLY TESTABLE |
| **B2-04** | B — Brand → creative | Creative that contradicts the brand promise | AR-4 | NOT CURRENTLY TESTABLE |
| **B2-05** | C — Product → creative | Does the ad match the product it sells | AR-1 | CURRENTLY TESTABLE |
| **B2-06** | C — Product → creative | Claim without product evidence | AR-2 | NOT CURRENTLY TESTABLE |
| **B2-07** | D — Catalog / portfolio | Where the catalog is subsidising itself | AR-1 | CURRENTLY TESTABLE |
| **B2-08** | D — Catalog / portfolio | Category the spend is ignoring | AR-1 | CURRENTLY TESTABLE |
| **B2-09** | E — Creative-heavy | Isolating the winning creative attribute | AR-3 | PARTIALLY TESTABLE |
| **B2-10** | E — Creative-heavy | Fatigue vs. bad creative | AR-3 | PARTIALLY TESTABLE |
| **B2-11** | F — Positioning / offer tension | Discount dependency against positioning | AR-4 | NOT CURRENTLY TESTABLE |
| **B2-12** | F — Positioning / offer tension | Price reality vs. stated audience | AR-1 | PARTIALLY TESTABLE |
| **B2-13** | G — Opportunity identification | The unexploited proof point | AR-1 | CURRENTLY TESTABLE |
| **B2-14** | G — Opportunity identification | Seasonal context reading | AR-6 | PARTIALLY TESTABLE |
| **B2-15** | H — Insufficient evidence | Segment question with no audience evidence | AR-1 | CURRENTLY TESTABLE |
| **B2-16** | H — Insufficient evidence | Conclusion from a thin data window | AR-5 | PARTIALLY TESTABLE |
| **B2-17** | I — Cross-brand | Same question, two different brands | AR-1 / AR-2 | PARTIALLY TESTABLE |
| **B2-18** | I — Cross-brand | Context transplant | AR-1 | CURRENTLY TESTABLE |
| **B2-19** | J — Evidence grounding | Every claim traced to a source | AR-1 | CURRENTLY TESTABLE |
| **B2-20** | J — Evidence grounding | Default values presented as facts | AR-1 | CURRENTLY TESTABLE |

**Counts:** 10 currently testable · 7 partially testable · 3 not currently testable.

Tests are not padded to reach a round number. Each of the ten categories carries exactly two tests because each category has two genuinely distinct failure modes worth separating — a capability test and a discipline test. Categories where only one meaningful test existed would have carried one.

---

## 7. DETAILED TEST CASES

### 7.0 Surfaces and execution modes referenced by the tests

Four entry points exist on the build under test. They are named here once and referred to by ID throughout.

| ID | Surface | Invocation | Has LLM | Has website/brand data | Has ad copy |
|---|---|---|---|---|---|
| **S-1** | Audit CLI | `cd apps/api && npx tsx scripts/run-audit.ts --brand=<id>` | yes (`createMessage`, `audit/audit-agent.ts:497`) | yes — 6 of 13 scraped fields reach the prompt | yes |
| **S-2** | Chat | `POST /ai/chat` — `{ message, account_id, date_preset }` | yes | **no** | **no** — ad *names* only, never copy (see §7.0.1) |
| **S-3** | Watchdog | `POST /agent/watchdog/run` | yes | **no** — injection seam returns `''` | no |
| **S-4** | Dashboard insights | `GET /dashboard/insights` | **no** | no | no |

**S-1 is the only surface where brand-derived context and creative evidence reach an LLM together.** S-2 is the only surface that accepts a free-form question. No surface has both. This is the central constraint on the benchmark and it is discussed in §15.

Two execution modes follow from that:

- **ASK** — the question is typed verbatim into S-2 and the reply recorded. Used where the test targets conversational reasoning.
- **RUN-AND-READ** — the audit is run on S-1 and the produced report recorded in full. The benchmark question is then used by the reviewer as the *evaluation lens*: "does this output answer that question, and how well?" The question is not typed anywhere.

RUN-AND-READ is a compromise and is labelled as one. It is weaker than ASK because the system was never asked the question — a report may fail to address it simply because the fixed audit prompt does not cover that ground. Reviewers must distinguish *did not address* from *addressed badly*; the report template in §12 carries a field for exactly this.

Because it is a compromise, it is not the default. §7.0.1 sets out when each mode applies and is binding on every test below.

#### 7.0.1 Surface selection rule

**Where a test evaluates what happens when a founder asks Cosmisk a question, S-2 / ASK is the required surface whenever S-2 can actually answer that question.** RUN-AND-READ on S-1 is not an acceptable substitute for a question test merely because S-1 holds richer data. Testing a developer CLI tells us little about what a founder experiences.

**S-1 / RUN-AND-READ remains primary in exactly two situations:**

1. The test is explicitly evaluating the generated audit report itself — its evidence discipline, or its handling of its own default values — rather than a user question. B2-19 and B2-20 are those cases.
2. S-2 structurally cannot answer the question, because evidence the pass conditions require never reaches that surface.

**What "can actually answer" means.** S-2 must hold the evidence the test's PASS CONDITIONS require. Verified against the build under test:

| Evidence type | On S-2? | Where |
|---|---|---|
| Campaign / account ROAS, spend, CPA, conversions | **yes** | `handleRoas`, `handleSpend`, `handleCpa`, `handleOverview`, `handleComparison` |
| Ad-level performance + per-ad confidence assessment | **yes** | `handleCreative` — `assessConfidence` per ad |
| Age / gender segment performance | **yes** | `handleAudience` — `breakdowns: 'age,gender'` |
| **Ad copy** (`body`, `title`, creative object) | **no** | `handleCreative` requests `ad_name,campaign_name,${INSIGHT_FIELDS}` — names and metrics only |
| **Website / catalog data** (categories, price range, trust signals) | **no** | no website call anywhere under `routes/ai/` |
| **Brand context of any kind** | **no** | `git grep -il "brand" -- apps/api/src/routes/ai/` returns nothing |

Any test whose pass conditions require ad copy, catalog data, or a brand attribute therefore cannot be run on S-2 on this build. That is a finding about the build. It is recorded per test rather than worked around, and it is not allowed to inflate a testability classification.

**Intent routing must be recorded.** S-2 does not answer questions directly. It classifies the message into one of ten intents (`roas`, `spend`, `audience`, `creative`, `cpa`, `forecast`, `script`, `comparison`, `overview`, `help`) and each intent builds a different `dataContext`. A question can therefore fail because it was routed to a handler that never had the relevant data — a different defect from bad reasoning. **The developer must record which intent fired**; §12 carries a field for it. A mis-route is logged as a routing failure, not as an intelligence failure.

**Standard S-2 invocation.**
```
POST /ai/chat
{ "message": "<the QUESTION TO ASK COSMISK, verbatim>",
  "account_id": "<act_… for the brand under test>",
  "date_preset": "last_30d" }
```
The question is pasted unmodified. Do not rephrase a question to steer intent routing — if it mis-routes, that is the result.

**Note on expected wording.** No test below specifies the words Cosmisk should produce. Pass conditions describe properties of the reasoning. Two answers with no phrase in common can both score 2.

---

### B2-01

**TEST ID:** B2-01
**TEST NAME:** Does it know what this brand actually sells
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
An established Indian fashion retailer with a live Shopify-style storefront and an active Meta ad account. The catalog spans multiple collections at a range of price points. The founder has never told Cosmisk what the business is; everything the system knows about the brand comes from the domain.

**AVAILABLE DATA:**
- Brand record: `id`, `name`, `domain`, `category`, `stage`, `meta_ad_account_id` (seeded).
- Website snapshot from `analyzeWebsite()`: price range, price point bucket, product count, category count, top categories, headline, value proposition, trust signals, review/size-guide/free-shipping/returns booleans.
- Meta ad-level performance for the selected window.

**QUESTION TO ASK COSMISK:**
> "What does this brand actually sell, and who is it selling to? Answer using what you can see, and say where each part of your answer comes from."

**WHAT THE TEST IS VALIDATING:**
Whether brand understanding is grounded in observed evidence or assembled from category priors. This is the foundation test — if the system cannot correctly and specifically describe the business, nothing downstream can be brand-aware.

**EXPECTED BEHAVIOR:**
Names the actual product categories present on the site, cites the observed price range with real numbers, and distinguishes what was observed from what was inferred. Where the audience is not evidenced, says so rather than describing a demographic.

**PASS CONDITIONS:**
- At least two product categories named that are genuinely present in the catalog.
- A price figure or range that matches the recorded website snapshot.
- Audience statements are either evidenced (from ad-level demographic performance) or explicitly marked as inference.
- The description would be wrong if applied to the other two seeded fashion brands.

**FAIL CONDITIONS:**
- Describes the brand in category terms only ("apparel and accessories for the modern Indian consumer").
- States a target audience with no supporting data and no hedge.
- Quotes a price point bucket (`mid`) without the underlying number.
- Any product category named that does not exist on the site.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
`topCategories`, `priceRange.min/max/average`, `productCount`, `headline`, `valueProposition` from the website snapshot; ad-level demographic breakdown from Meta.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ. **CURRENTLY TESTABLE.**
**Why not S-2, despite this being a founder question.** Every pass condition here requires website or catalog evidence — product categories, an observed price figure. S-2 carries none of it: there is no website call anywhere under `routes/ai/`, and no brand reference at all. The question would route to `audience` (it contains `who`) or be classified by `detectIntentWithClaude`, and either way `handleAudience` returns age/gender performance, which cannot answer "what does this brand sell." Rule 2 of §7.0.1 applies; S-1 remains primary.
**Optional S-2 diagnostic run.** Worth doing once, because the failure is informative: if S-2 describes what the brand sells while holding no catalog data, that description was invented and must be recorded as a fabrication under §16.
Caveat that the reviewer must hold on the S-1 run: `headline`, `valueProposition` and `topCategories` are extracted by `analyzeWebsite()` but **do not reach the prompt** — `audit-agent.ts:355-364` passes only price range, price point, product count, trust signals, `hasReviews` and `hasFreeShipping`. A failure to name categories on this build is therefore an *expected* failure caused by a known gap, not a reasoning failure. Record it as a fail; note the cause.

---

### B2-02

**TEST ID:** B2-02
**TEST NAME:** Brand attributes distinguished from assumptions
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
Same brand as B2-01. The website analyser has run. Some fields were extracted successfully; others fell back to defaults because the page structure did not match the parser's expectations.

**AVAILABLE DATA:**
As B2-01, plus knowledge of which fields are real and which are defaults. A developer can determine this by comparing the recorded website snapshot against the live site.

**QUESTION TO ASK COSMISK:**
> "List everything you believe you know about this brand. For each item, say whether you observed it directly, inferred it, or assumed it."

**WHAT THE TEST IS VALIDATING:**
Whether the system can separate observation from assumption. This matters because a default value that is presented as an observation is worse than no value at all — it is a fabricated fact that is indistinguishable from a real one at the point of use.

**EXPECTED BEHAVIOR:**
Produces a list in which directly observed attributes are separated from inferred ones, and any attribute the system cannot substantiate is either omitted or flagged.

**PASS CONDITIONS:**
- Observed and inferred attributes are distinguishable in the output.
- No default or fallback value appears in the observed group.
- At least one attribute is correctly identified as unknown or uncertain.

**FAIL CONDITIONS:**
- A flat list presented uniformly as fact.
- A fallback value (notably `pricePoint: 'mid'`) asserted as an observation.
- Confidence language applied evenly across attributes of genuinely different reliability.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
The website snapshot with per-field provenance; the `getDefaultSnapshot()` return values for comparison.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ. **PARTIALLY TESTABLE.**
**Why not S-2.** The test asks the system to enumerate and grade its own brand knowledge. S-2 holds no brand knowledge to enumerate, so the question has no subject on that surface. Rule 2 of §7.0.1 applies.
The blocking limitation on S-1: no field in the snapshot records its own provenance. `analyzeWebsite()` returns the same shape whether it parsed the site successfully or fell through to `getDefaultSnapshot()` at `website-analysis.ts:226`, which hardcodes `pricePoint: 'mid'`. The system therefore has no way to know which of its own values are real. The test can still be executed and will record how the output behaves, but a pass would be accidental rather than earned. This test becomes fully meaningful once BC-1..BC-5 carry `source` / `confidence` metadata as specified in the Batch 2 handoff §6.

---

### B2-03

**TEST ID:** B2-03
**TEST NAME:** Which creatives fit what this brand stands for
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
The account is running 20+ active ads across several campaigns. Performance varies widely. Some creatives lead with product and craft; others lead with price and urgency. The brand's site positions on design and quality.

**AVAILABLE DATA:**
Ad-level spend, impressions, ROAS, CPA, and ad copy for each active ad; website snapshot including trust signals and value proposition.

**QUESTION TO ASK COSMISK:**
> "Looking at the ads currently running, which ones are consistent with what this brand appears to stand for, and which ones are not? Use the ad copy as your evidence."

**WHAT THE TEST IS VALIDATING:**
Whether brand context is used as a *lens on creative* rather than as an introductory paragraph. This is the core Batch 2 capability: reasoning that requires both the brand attribute and the creative evidence, and which collapses if either is removed.

**EXPECTED BEHAVIOR:**
Identifies specific named ads, quotes or paraphrases their actual copy, and explains the fit or mismatch by reference to a specific brand attribute. Does not simply rank ads by ROAS.

**PASS CONDITIONS:**
- At least two ads named individually.
- Actual ad copy quoted or specifically referenced.
- The judgement of fit is tied to a named brand attribute, not to performance.
- Removing the brand attribute from the reasoning would invalidate the conclusion.

**FAIL CONDITIONS:**
- Ads discussed as a group ("your creatives are performing inconsistently").
- Fit judged purely by performance — high ROAS treated as on-brand by definition.
- Brand attributes restated in an opening paragraph and then never used again (mirror finding, §4.2).
- Advice that would apply unchanged to any fashion advertiser.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Per-ad `body`, `title`, `name`; per-ad spend and ROAS; `valueProposition` and `trustSignals` from the website snapshot.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ. **CURRENTLY TESTABLE.**
**Why not S-2, despite this being a founder question.** This test needs both halves of the reasoning and S-2 has neither. It has no brand attribute to judge fit against, and — the harder blocker — **no ad copy**: the question routes to `creative`, and `handleCreative` requests `ad_name,campaign_name,${INSIGHT_FIELDS}`, so the copy the question explicitly asks it to use as evidence is never retrieved. Rule 2 of §7.0.1 applies. This test is the clearest single demonstration of why the chat surface cannot currently carry brand-aware creative reasoning, and that fact belongs in the run report.
Ad copy does reach the prompt on the S-1 path. Note that `valueProposition` does not (see B2-01), so the brand attributes available to the reasoning are limited to price band, product count, trust signals and the boolean flags. The test remains valid: reasoning from *those* attributes is still brand-aware reasoning. Record which attribute the output actually used.

---

### B2-04

**TEST ID:** B2-04
**TEST NAME:** Creative that contradicts the brand promise
**BRAND ARCHETYPE:** AR-4 — Premium positioning-led

**BUSINESS CONTEXT:**
A brand whose stated positioning is explicitly non-discounting: price integrity is part of the equity, and the founder has confirmed this. Despite that, roughly half of current ad spend sits behind creatives whose primary message is a percentage discount, and those creatives outperform on immediate ROAS.

**AVAILABLE DATA:**
Stated `price_positioning: premium` with `source: user_confirmed`; ad-level copy and performance showing the discount split.

**QUESTION TO ASK COSMISK:**
> "Is anything we're currently running working against how we want this brand to be seen? If so, what is the trade-off?"

**WHAT THE TEST IS VALIDATING:**
Whether the system can hold a genuine tension — a set of ads that is simultaneously the best performer and a strategic liability — instead of resolving it in one direction. This is the clearest separator between reasoning and rule-following.

**EXPECTED BEHAVIOR:**
Identifies the discount-led creatives specifically, quantifies their share of spend and their performance advantage, states the positioning cost in concrete terms, and presents the trade-off for the founder to decide. Does not issue a blanket instruction to stop discounting.

**PASS CONDITIONS:**
- The discount-led ads are named and their spend share quantified.
- The performance advantage is stated numerically, not dismissed.
- The positioning cost is articulated as a consequence, not as a rule violation.
- The recommendation leaves the decision with the founder while making it decidable.

**FAIL CONDITIONS:**
- "Premium brands should not discount" — a rule, not a finding.
- The tension is resolved silently in favour of whichever side is easier.
- The conclusion is reached by a threshold rather than by reasoning (see the guardrail below).
- The performance data is not acknowledged at all.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
`price_positioning` with provenance; per-ad copy identifying discount messaging; per-ad spend and ROAS; aggregate spend share of discount-led ads.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ. **NOT CURRENTLY TESTABLE.**
`price_positioning` does not exist on this build — zero matches across `apps/`. The nearest field, `pricePoint`, is a bucket derived from average scraped price and cannot express a positioning stance. Without a stated positioning there is no promise for the creative to contradict, so the test has no subject.
**Surface choice does not change this verdict.** S-2 would be the natural surface once the field exists — this is a founder question — but the blocker is a missing capture, not a missing surface, and S-2 is strictly worse off: it has neither `price_positioning` nor ad copy (`handleCreative` requests ad names and metrics only). When BC-2 lands, reassess this test for S-2 under §7.0.1; it will require ad copy to reach the chat surface as well.
**Guardrail for whoever implements this later:** if the finding is produced by a condition of the form `if (positioning === 'premium' && discountRatio > 0.5)`, the test fails regardless of how good the output text is. A detector that fires on a threshold is not reasoning, and it will fire identically for every brand that crosses the threshold — which is the exact failure this benchmark exists to catch.
**What would make it testable:** BC-2 `price_positioning` captured with source, confidence and evidence, and user-correctable.

---

### B2-05

**TEST ID:** B2-05
**TEST NAME:** Does the ad match the product it sells
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
The catalog contains products at materially different price points. Ad copy makes claims about value, quality and affordability. Whether those claims are appropriate depends on which product the ad actually drives to.

**AVAILABLE DATA:**
Ad copy per ad; website price range and average; product count; ad-level performance.

**QUESTION TO ASK COSMISK:**
> "Do the claims in our ad copy match what we actually sell? Point to any ad where the message and the product are mismatched."

**WHAT THE TEST IS VALIDATING:**
Product-to-creative grounding. A system that reasons only over metrics cannot answer this; it requires connecting the copy's assertion to observed product reality.

**EXPECTED BEHAVIOR:**
Names specific ads, quotes the claim, and compares it against the observed price or product evidence. Where an ad cannot be checked, says so.

**PASS CONDITIONS:**
- At least one specific claim quoted from a specific ad.
- The claim is compared against an observed product attribute with a number attached.
- Where a mismatch is asserted, both sides of the comparison are shown.
- Where no mismatch is found, the output says so rather than manufacturing one.

**FAIL CONDITIONS:**
- Generic advice about aligning messaging with product.
- A mismatch asserted without showing the product-side evidence.
- Claims evaluated against category norms rather than this catalog.
- Invents a product or price that is not in the recorded snapshot.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Per-ad copy; `priceRange.min/max/average`; `productCount`; `hasFreeShipping`, `hasEasyReturns`, `hasReviews` where the copy makes such claims.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ. **CURRENTLY TESTABLE.**
**Why not S-2, despite this being a founder question.** The test compares an ad claim against product reality. S-2 holds neither side: no ad copy (`handleCreative` retrieves names and metrics only) and no catalog or price data. Rule 2 of §7.0.1 applies.
Both sides of the comparison reach the S-1 prompt: ad copy, and price range / trust-signal booleans. Note that ads are not linked to individual SKUs on this build, so the comparison is against the catalog aggregate rather than the specific product an ad promotes. Reviewers should treat catalog-level grounding as a pass and not require SKU-level attribution.

---

### B2-06

**TEST ID:** B2-06
**TEST NAME:** Claim without product evidence
**BRAND ARCHETYPE:** AR-2 — Catalog-heavy skincare / beauty

**BUSINESS CONTEXT:**
A skincare brand running ads that make an efficacy claim — a visible result within a stated timeframe. The product page supports a weaker version of the claim than the ad makes. The ad performs well.

**AVAILABLE DATA:**
Ad copy containing the claim; website content describing the product's actual stated benefit; ad-level performance.

**QUESTION TO ASK COSMISK:**
> "Are any of our ads promising something the product page doesn't support? Show me the ad and the page evidence side by side."

**WHAT THE TEST IS VALIDATING:**
Whether the system will flag a *commercially successful* claim as unsupported. Systems that optimise toward performance will not, because the ad looks like a winner. This tests whether evidence grounding survives contact with a good number.

**EXPECTED BEHAVIOR:**
Identifies the specific claim, shows the corresponding product evidence, states the gap between them, and does so without being deterred by the ad's performance.

**PASS CONDITIONS:**
- The ad claim is quoted verbatim.
- The product-side evidence is quoted or specifically cited.
- The gap is described concretely rather than as a general compliance warning.
- Performance is acknowledged but does not suppress the finding.

**FAIL CONDITIONS:**
- General advice to ensure claims are substantiated.
- The claim is not flagged because the ad performs well.
- A gap is asserted without showing the product-side text.
- Regulatory language is generated with no reference to the actual claim.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Per-ad copy; product-page text for the promoted product; per-ad performance.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ. **NOT CURRENTLY TESTABLE.**
Two independent blockers. First, no skincare or beauty brand is connected (AR-2). Second, and more fundamental on any brand: `analyzeWebsite()` fetches the homepage and `/collections/all` only. It does not fetch individual product pages, and no product-page body text is captured in the snapshot. There is therefore no product-side evidence for the claim to be checked against, in any category.
**Surface choice does not change this verdict.** Both blockers are data blockers, not surface blockers. S-2 is worse on the third requirement too: the test needs per-ad copy to establish what was claimed, and `handleCreative` never retrieves it. Reassess for S-2 only once both product-page capture and ad copy are available.
**What would make it testable:** product-page content capture for promoted SKUs, plus a connected brand in a claims-sensitive category.

---

### B2-07

**TEST ID:** B2-07
**TEST NAME:** Where the catalog is subsidising itself
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
Spend is distributed across many campaigns and ad sets covering different parts of the catalog. Blended account ROAS looks acceptable. Underneath it, some segments are strongly profitable and others are consuming budget at a loss, and the blend conceals both.

**AVAILABLE DATA:**
Campaign- and ad-level spend, revenue, ROAS, CPA for the window; website category and price data.

**QUESTION TO ASK COSMISK:**
> "Our blended ROAS looks fine. Which part of the account is actually carrying it, and which part is being subsidised? Show me the money."

**WHAT THE TEST IS VALIDATING:**
Portfolio reasoning — the ability to decompose an aggregate into contributors and identify concentration. This is the highest-value reasoning task for AR-1 and the one most often replaced with a restatement of the top-line number.

**EXPECTED BEHAVIOR:**
Splits the account into named segments, attributes spend and return to each with real figures, identifies which segment is subsidising which, and quantifies the amount at stake.

**PASS CONDITIONS:**
- Named campaigns, ad sets or ads — not "your top performers."
- Spend and ROAS figures given per segment, and the figures reconcile with the account total.
- The subsidy relationship is stated with an amount attached.
- The recommended action names what to move and roughly how much.

**FAIL CONDITIONS:**
- Restates blended ROAS with commentary.
- "Reallocate budget from underperformers to top performers" with no names and no numbers.
- Figures given that do not reconcile with the totals.
- Identifies only the best and worst performer without quantifying the transfer.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Per-campaign and per-ad spend, revenue/purchase value, ROAS, CPA; account totals for reconciliation.

**DATA / CAPABILITY DEPENDENCIES:**
**Surface S-2, mode ASK — primary.** Type the question verbatim into `POST /ai/chat` with the brand's `account_id`. **CURRENTLY TESTABLE.**
This test needs no brand context at all — it runs entirely on account performance evidence, which is exactly what S-2 carries. Every pass condition (named segments, per-segment spend and ROAS, reconciliation against account totals) is satisfiable from the `dataContext` built by `handleRoas` / `handleSpend`. This is the cleanest question test in the suite.
Expect the message to route to `roas` (the string `roas` is present) or `spend`. Record the intent that fired. If it routes to `overview`, the account-level `dataContext` may not carry per-campaign breakdown — log that as a routing failure per §7.0.1, not as a reasoning failure.
**Control status.** This test is included deliberately as a control: if B2-07 passes while the brand-aware tests fail, the failure is isolated to the brand layer rather than to reasoning capability in general. That distinction is important when interpreting a bad overall result, and it is more meaningful now that the control runs on the same surface a founder actually uses.
**Optional paired run:** S-1 RUN-AND-READ on the same account and window. Not required. Where both are run, a strong S-1 result against a weak S-2 result localises the deficit to the chat surface rather than to the reasoning.

---

### B2-08

**TEST ID:** B2-08
**TEST NAME:** Category the spend is ignoring
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
The website carries several product categories. Ad spend is concentrated on a subset of them. Whether the neglected categories represent an opportunity or a correct exclusion is exactly the question — and answering it requires comparing what the brand *sells* against what it *advertises*.

**AVAILABLE DATA:**
Website category list and product counts; campaign and ad names and copy indicating which categories are being promoted; per-campaign spend.

**QUESTION TO ASK COSMISK:**
> "Is there anything we sell that we're barely advertising? If so, is that a mistake or a reasonable choice?"

**WHAT THE TEST IS VALIDATING:**
Reasoning across the boundary between catalog data and account data. Neither dataset alone can answer this. A system that only reads the ad account cannot see the gap, because the missing category leaves no trace in the account.

**EXPECTED BEHAVIOR:**
Names the under-advertised categories, quantifies the imbalance, and reasons about whether the gap is justified — including the possibility that it is.

**PASS CONDITIONS:**
- At least one specific category named that exists on the site and is under-represented in spend.
- The imbalance is quantified on both sides (share of catalog vs. share of spend).
- The output takes a position on whether the gap is a problem, with a reason.
- If the answer is "no meaningful gap," that is stated with the evidence that rules it out.

**FAIL CONDITIONS:**
- Generic advice to diversify or to test new categories.
- A category named that does not appear in the website snapshot.
- The gap identified but not evaluated — a list with no judgement.
- Only account data used; the catalog side of the comparison is absent.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
`topCategories`, `categoryCount`, `productCount` from the website snapshot; campaign/ad naming and copy; per-campaign spend distribution.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ. **CURRENTLY TESTABLE** — with a known and severe constraint.
**Why not S-2.** The test compares what the brand *sells* against what it *advertises*. S-2 has only the advertising half; it holds no catalog data at all, so the comparison cannot be formed there under any phrasing. Rule 2 of §7.0.1 applies.
`topCategories` and `categoryCount` are extracted by `analyzeWebsite()` but **do not reach the prompt** (`audit-agent.ts:355-364`). The catalog side of the comparison is therefore invisible to the model on this build. This test is expected to fail, and that expected failure is its purpose: it is the cleanest single demonstration of the F-4 field-discard gap described in the Batch 2 handoff. Run it, record the failure, and use it as the before-measurement when the discarded fields are wired through.

---

### B2-09

**TEST ID:** B2-09
**TEST NAME:** Isolating the winning creative attribute
**BRAND ARCHETYPE:** AR-3 — Creative-heavy DTC

**BUSINESS CONTEXT:**
Several ads promote materially the same offer. Performance between them varies by 2× or more. The difference is not the product, the audience or the budget — it is something about the creatives themselves.

**AVAILABLE DATA:**
Per-ad copy, format, spend, impressions, ROAS, CTR, CPA; ad names which often encode creative variant information.

**QUESTION TO ASK COSMISK:**
> "Two ads selling the same thing are performing very differently. What is actually different about the winner, and how confident are you that that's the cause?"

**WHAT THE TEST IS VALIDATING:**
Attribute isolation and causal restraint together. The system must both propose a specific difference and be honest about whether the evidence supports calling it the cause. Confident causal claims from two data points are a failure even when the proposed cause is plausible.

**EXPECTED BEHAVIOR:**
Names both ads, states the performance gap numerically, proposes a specific observable difference grounded in the copy or format, and qualifies the causal claim according to how much evidence supports it.

**PASS CONDITIONS:**
- Both ads named; the gap quantified.
- The proposed differentiator is specific and observable in the recorded data.
- Confidence is calibrated — a two-ad comparison is not presented as established causation.
- A way to confirm the hypothesis is suggested.

**FAIL CONDITIONS:**
- "Ad A's creative resonates better with your audience" — restates the outcome as the cause.
- A confident causal claim from an unsupported comparison.
- The differentiator named is not visible anywhere in the recorded data (invented).
- Generic creative best-practice advice substituted for analysis of these two ads.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Per-ad `body`, `title`, `name`, format/placement; per-ad spend, impressions, CTR, ROAS; conversion counts for reliability assessment.

**DATA / CAPABILITY DEPENDENCIES:**
**Surface S-2, mode ASK — primary.** Type the question verbatim into `POST /ai/chat`. **PARTIALLY TESTABLE.**
This is a founder question and S-2 can answer it: the question routes to `creative`, and `handleCreative` supplies per-ad ROAS, CTR, CPA, spend, conversions and — directly relevant to the second half of the question — a per-ad `assessConfidence` result. The calibration half of the pass conditions is therefore fully testable on S-2.
**Evidence limitation on S-2, which the reviewer must hold.** `handleCreative` requests `ad_name,campaign_name,${INSIGHT_FIELDS}` — it does **not** retrieve ad copy. The only creative-side evidence on this surface is the ad *name*. A differentiator drawn from a naming convention is a legitimate pass; a differentiator describing copy or a hook that appears nowhere in the recorded `dataContext` is an invention and fails under the existing fail condition.
**Paired S-1 run — recommended, not required.** Run the audit on the same account to obtain a copy-grounded answer to the same question. Where S-2 invents a copy-based differentiator and S-1 grounds one, the defect is the missing copy on the chat surface, not the reasoning. Record both.
**Brand-set limitation, unchanged:** no narrow-range DTC brand is connected, so the test runs on a fashion account where two ads promoting "the same thing" is an approximation. The reviewer must state which ad pair was used and how comparable it genuinely was. A pass on a poorly matched pair is weak evidence.
**Note:** no visual analysis of the creative asset occurs on either surface, so a purely visual difference cannot be found. Do not fail the system for missing a visual-only differentiator; record it as out of reach.

---

### B2-10

**TEST ID:** B2-10
**TEST NAME:** Fatigue vs. bad creative
**BRAND ARCHETYPE:** AR-3 — Creative-heavy DTC

**BUSINESS CONTEXT:**
An ad's performance has declined over the queried window. Two explanations produce the same chart: the creative was always weak and is now being seen by a colder audience, or the creative was strong and the audience has now seen it too many times. The correct action differs completely between the two.

**AVAILABLE DATA:**
Per-ad performance over time; frequency; impressions; spend trajectory; CTR trend; ad copy.

**QUESTION TO ASK COSMISK:**
> "This ad is getting worse. Is it worn out, or was it never good? What in the data tells you which?"

**WHAT THE TEST IS VALIDATING:**
Whether the system distinguishes two hypotheses that share a symptom, and whether it names the discriminating evidence rather than picking the more common explanation.

**EXPECTED BEHAVIOR:**
States both hypotheses, names the evidence that would separate them, checks that evidence, and reaches a conclusion — or states that the discriminating evidence is unavailable.

**PASS CONDITIONS:**
- Both explanations acknowledged.
- The discriminating signal is named specifically (e.g. frequency trajectory against CTR decay, or early-window performance).
- The conclusion follows from the signal actually checked, with numbers.
- If the signal is unavailable, the output says so instead of guessing.

**FAIL CONDITIONS:**
- Declares fatigue by default because performance declined.
- Recommends refreshing the creative without establishing which problem is being solved.
- Cites frequency without reference to its trajectory or to a threshold that means something for this account.
- Both hypotheses listed with no attempt to choose between them and no statement that the data cannot choose.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Time-series performance for the ad; frequency; CTR trend; impressions; first-week vs. last-week comparison.

**DATA / CAPABILITY DEPENDENCIES:**
**Surface S-2, mode ASK — primary.** Type the question verbatim into `POST /ai/chat`. **PARTIALLY TESTABLE.**
This is a founder question and S-2 can attempt it. The message exceeds 50 characters and contains `?`, so intent is resolved by `detectIntentWithClaude` rather than by the keyword regex; expect `creative`. `handleCreative` carries an explicit `fatigueDetection` block (ads whose CTR is below half the account average at >1,000 impressions), which is a genuine discriminating signal and is exactly what the question asks about. Record the intent that fired — on the keyword path this phrasing contains no matching token and would fall through to `overview`, which has no ad-level data at all. If `overview` fires, log a routing failure per §7.0.1.
**Limitation common to both surfaces:** neither S-2 nor S-1 supplies frequency trajectory or a within-window time series. The first-week vs. last-week comparison named in the pass conditions is not assembled anywhere on this build. Before scoring, the developer must record whether any time-decomposed data was present. If it was not, the test scores **NOT RUN**, not FAIL — the system cannot be marked down for failing to reason over data it never received.
**Optional paired S-1 run:** adds ad copy, which allows a "never good" judgement to be grounded in the creative rather than inferred from metrics alone.

---

### B2-11

**TEST ID:** B2-11
**TEST NAME:** Discount dependency against positioning
**BRAND ARCHETYPE:** AR-4 — Premium positioning-led

**BUSINESS CONTEXT:**
Over the last quarter the share of spend behind discount-led creative has risen steadily. Each individual decision was rational — the discount ads convert better. The cumulative effect is that the brand has trained its audience to wait for a sale, and full-price creative now underperforms partly because of that training.

**AVAILABLE DATA:**
Ad copy identifying discount messaging; spend share of discount-led ads across time; performance of full-price vs. discount-led creative; stated positioning.

**QUESTION TO ASK COSMISK:**
> "Are we becoming dependent on discounting? What would it cost us to stop, and what's the evidence either way?"

**WHAT THE TEST IS VALIDATING:**
Second-order reasoning — recognising that a series of individually correct decisions has produced a structural problem. This is the most demanding test in the suite and the one furthest from pattern-matching.

**EXPECTED BEHAVIOR:**
Quantifies the trend in discount-led spend share, connects it to the relative performance of full-price creative, states the mechanism, estimates the cost of correction, and leaves the decision with the founder.

**PASS CONDITIONS:**
- The trend is shown with figures at two or more points in time.
- Full-price creative performance is compared against discount-led performance with numbers.
- The mechanism linking the two is stated explicitly, not implied.
- The cost of stopping is estimated concretely enough to decide against.

**FAIL CONDITIONS:**
- Warns about discount dependency as a general risk with no account-specific evidence.
- Shows the trend without connecting it to any consequence.
- Recommends stopping discounts without estimating the cost.
- Reaches the conclusion by a threshold rule rather than by reasoning.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Discount-led spend share over ≥2 comparable periods; ROAS and CPA split by discount vs. full-price creative; stated `price_positioning`; total spend at risk.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ. **NOT CURRENTLY TESTABLE.**
Three blockers. (1) `price_positioning` does not exist, so there is no stated commitment for the dependency to violate. (2) Discount-led creative is not labelled anywhere; classifying ads as discount-led would have to be done by the model from copy, which is possible but unverified. (3) The audit runs over a single window; no period-over-period comparison is assembled, so the trend cannot be shown.
**Surface choice does not change this verdict, though it partially changes blocker (3).** S-2 has a period-over-period path that S-1 lacks: `handleComparison` fetches two windows and emits a `changes` object. It should not be relied on as-is, however — the two windows **overlap**. `previousPreset` is set to `last_14d` when the current preset is `last_7d`, and `last_14d` contains `last_7d`, so the "previous period" includes the period it is being compared against. Any trend computed from it is damped and, for a sharp recent move, directionally understated. Record this if `comparison` fires for any test.

Blockers (1) and (2) remain absolute on S-2 regardless: no positioning field exists anywhere, and `handleCreative` retrieves ad names and metrics but never ad copy, so the discount classification in (2) has no input at all. Two of three blockers survive the surface change, so the verdict stands. When BC-2 and ad copy land, this test should be reassessed for S-2 first.
**What would make it testable:** BC-2 `price_positioning`; a two-window audit comparison; and confirmation that the model can reliably classify discount messaging from copy — which is itself worth testing separately before this test is meaningful.

---

### B2-12

**TEST ID:** B2-12
**TEST NAME:** Price reality vs. stated audience
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
Ad copy and targeting imply one kind of buyer. The observed price range implies another. Where those diverge, either the targeting is wrong or the copy is misrepresenting the offer — and the mismatch usually shows up as high CTR with poor conversion.

**AVAILABLE DATA:**
Website price range and average; ad copy; ad-level CTR, conversion rate, CPA; demographic breakdown where available.

**QUESTION TO ASK COSMISK:**
> "Does the audience our ads are speaking to match the price of what we actually sell? If not, where does the mismatch show up in the numbers?"

**WHAT THE TEST IS VALIDATING:**
Whether the system connects a catalog fact to a performance symptom — the observed price reality to a specific pattern in the funnel. A system that reads only the ad account cannot make this connection.

**EXPECTED BEHAVIOR:**
States the observed price reality with figures, characterises the audience the copy addresses, identifies whether they are consistent, and points to the funnel evidence that supports or refutes the mismatch.

**PASS CONDITIONS:**
- The price range is cited with real numbers from the snapshot.
- The audience implied by the copy is described with reference to specific copy.
- Funnel evidence (CTR vs. conversion, or CPA pattern) is used to test the hypothesis.
- The conclusion is falsifiable — it says what would prove it wrong.

**FAIL CONDITIONS:**
- Cites `pricePoint: 'mid'` as the price reality without the underlying figures.
- Asserts an audience mismatch with no funnel evidence.
- Describes a target audience the data does not support and does not flag it as inference.
- Generic advice about audience-message fit.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
`priceRange.min/max/average`; per-ad copy; CTR, conversion rate, CPA per ad; demographic performance breakdown.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ. **PARTIALLY TESTABLE.**
**Why not S-2, despite this being a founder question.** The question has two halves and no single surface holds both. S-2 holds the audience half — `handleAudience` fetches `breakdowns: 'age,gender'` and returns real per-segment ROAS, CPA and CTR — but carries **no price, catalog or website data whatsoever**, so "the price of what we actually sell" has no referent on that surface. An S-2 answer would have to invent the price side, which the fail conditions already prohibit. S-1 holds the price side. Rule 2 of §7.0.1 therefore applies and S-1 remains primary.
**Optional S-2 diagnostic run.** Asking the same question on S-2 is informative precisely because it should fail: if the chat surface produces a confident price-to-audience conclusion with no price data available to it, that is a fabrication and should be recorded as one under §16. This is a useful check but it is not the test.
The price side reaches the S-1 prompt and the funnel side is available. The remaining limitation is on the audience side: no `target_audience` attribute is captured for the brand (BC-5 does not exist on this build), so the "stated audience" must be inferred by the model from ad copy alone. That is a weaker test than the one described, and reviewers should not credit a pass as evidence that audience context works — only that price-to-funnel reasoning works.
**Watch for a specific fabrication:** if the website fetch failed, `getDefaultSnapshot()` supplies `pricePoint: 'mid'` and a default price range. Any output built on those values is reasoning over invented facts. The developer must record whether the fetch succeeded before this test is scored.

---

### B2-13

**TEST ID:** B2-13
**TEST NAME:** The unexploited proof point
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
The website carries trust signals the ads never mention — reviews, a returns policy, free shipping, a size guide. These are the kind of asset that costs nothing to deploy in creative and often addresses the specific objection suppressing conversion.

**AVAILABLE DATA:**
`trustSignals`, `hasReviews`, `hasFreeShipping`, `hasEasyReturns`, `hasSizeGuide` from the website snapshot; ad copy for all active ads; conversion performance.

**QUESTION TO ASK COSMISK:**
> "Is there anything true about this business that our ads aren't using? Something we could say tomorrow that we're not saying?"

**WHAT THE TEST IS VALIDATING:**
Opportunity identification from the gap between two datasets — what the brand possesses versus what the brand says. This is the most directly useful output in the entire suite and it requires no new data collection to produce.

**EXPECTED BEHAVIOR:**
Names a specific asset present on the site and absent from the copy, explains why it would matter for this brand's buyers, and states what to do with it.

**PASS CONDITIONS:**
- The asset named is genuinely present in the website snapshot.
- Its absence from the ad copy is verifiable against the recorded copy.
- The reasoning connects the asset to a specific friction, not to generic persuasion theory.
- The action is executable within 48 hours without new production.

**FAIL CONDITIONS:**
- Suggests adding social proof or urgency in the abstract.
- Names an asset the site does not have (fabrication — this is a severe failure, see §16).
- Names an asset that is already present in the ad copy.
- Identifies the gap but gives no action.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
`trustSignals` array; the four boolean flags; full ad copy for all active ads; conversion rate for the ads in question.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ. **CURRENTLY TESTABLE.**

*Why not S-2 — §7.0.1 rule 2.* This test requires two inputs simultaneously and S-2 has neither. It needs website trust signals (`trustSignals`, `hasReviews`, `hasFreeShipping`) — no handler under `routes/ai/` makes a website call of any kind. It needs ad copy to establish what the ads actually promise — `handleCreative` requests `ad_name,campaign_name,${INSIGHT_FIELDS}` and stops there. Routing the question to chat would produce an answer built on ad names and ROAS figures, which is not the thing being tested. S-1 is not a compromise here; it is the only surface that holds the evidence.

*This asymmetry is the finding.* B2-13 is the strongest brand-aware test in the suite and it is **structurally unrunnable on the surface founders actually use.** The capability exists, and the product does not expose it. That is worth recording independently of how the test scores.

This is the strongest currently-runnable brand-aware test in the suite: both required inputs reach the prompt. `trustSignals`, `hasReviews` and `hasFreeShipping` are passed at `audit-agent.ts:355-364`, and ad copy is available. If any test in this benchmark should pass on the current build, it is this one. A failure here is a genuine reasoning failure and cannot be attributed to a missing field.

---

### B2-14

**TEST ID:** B2-14
**TEST NAME:** Seasonal context reading
**BRAND ARCHETYPE:** AR-6 — Seasonal / context-dependent

**BUSINESS CONTEXT:**
The queried window overlaps a known demand peak for this category. CPA has risen. Volume has also risen. In a seasonal peak, a CPA rise alongside a volume rise is often the correct outcome of deliberately buying more expensive incremental demand — not a failure.

**AVAILABLE DATA:**
Performance over the window including CPA, spend, conversion volume; date range; category.

**QUESTION TO ASK COSMISK:**
> "Our CPA went up this period. Is that a problem, given what's happening in the market right now?"

**WHAT THE TEST IS VALIDATING:**
Whether a metric is interpreted in context or absolutely. A system that always reads rising CPA as deterioration will give harmful advice during exactly the periods that matter most commercially.

**EXPECTED BEHAVIOR:**
Notes the volume change alongside the CPA change, considers whether the period is contextually unusual, and either reaches a contextual conclusion or states that it lacks the context needed to judge.

**PASS CONDITIONS:**
- CPA and volume are considered together, with figures.
- The output either applies seasonal context or explicitly notes that it does not have seasonality information for this brand.
- The conclusion does not treat rising CPA as self-evidently bad.
- Any action recommended is consistent with the interpretation reached.

**FAIL CONDITIONS:**
- Flags rising CPA as deterioration without reference to volume.
- Asserts a seasonal explanation with no evidence that the period is seasonal for this brand (unsupported claim, not a pass).
- Recommends cutting spend during a period the output itself identifies as a peak.
- Ignores the question of context entirely.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
CPA and conversion volume for the window and a comparable prior window; total spend; the date range; brand category.

**DATA / CAPABILITY DEPENDENCIES:**
Surface **S-2, mode ASK** (required — this is a founder question and S-2 holds the evidence the pass conditions need). Optional paired S-1 RUN-AND-READ run for comparison; and if S-2 is unreachable, S-1 is a permitted **labelled fallback** for this test specifically, because the audit does report CPA and conversion volume and the reviewer can apply the question as a lens without losing the thing being measured. **PARTIALLY TESTABLE.**

*Why S-2.* Both quantities the pass conditions turn on — CPA and conversion volume for the window — are assembled by `handleCpa`, and the question contains `cpa` explicitly. Under §7.0.1 rule 2 there is no structural blocker, so S-2 is the required surface.

*Execution.* Post the question verbatim per the §7.0.1 invocation block, with `date_preset` set to the window under test. Because the message exceeds 50 characters and contains `?`, `detectIntentWithClaude` is expected to fire; the anticipated intent is `cpa`. Record which intent actually fired. A route to `overview` still returns CPA and volume and remains scoreable; a route to `forecast` does not, and is logged as a routing failure rather than an intelligence failure.

*Why still PARTIALLY TESTABLE.* No seasonality context is captured for any brand on this build — not on S-2 and not on S-1 — so a correct seasonal reading would have to come from the model's own priors about the category and calendar, which is a different capability from brand-aware reasoning and one this benchmark does not otherwise test. The strongest available pass condition is therefore the honest one: the system notes that it lacks seasonality context for this brand. Treat that as a full pass, and treat a confident seasonal assertion with no brand evidence as a fail even if it happens to be correct.

---

### B2-15

**TEST ID:** B2-15
**TEST NAME:** Segment question with no audience evidence
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
The account has spend and conversions, but no audience research, no customer survey data, no CRM segmentation, and no LTV or repeat-purchase data. The only audience-adjacent signal is Meta's demographic breakdown of ad delivery, which describes who saw and clicked the ads — not who the brand's customers are or should be.

**AVAILABLE DATA:**
Ad-level demographic delivery breakdown; performance metrics; website snapshot. **No** customer data, **no** segmentation, **no** cohort or retention data.

**QUESTION TO ASK COSMISK:**
> "Which customer segment should we target next?"

**WHAT THE TEST IS VALIDATING:**
Restraint under an inviting question. This question is phrased the way a founder would ask it and it strongly solicits a confident answer. An LLM will produce a fluent segmentation recommendation whether or not any evidence exists. The correct behaviour is to decline the question as asked and say precisely what is missing.

**EXPECTED BEHAVIOR:**
Acknowledges that the question cannot be answered from available evidence, distinguishes delivery demographics from customer segments, names the specific data that would be needed, and offers whatever narrower question *can* be answered.

**PASS CONDITIONS:**
- The limitation is stated explicitly and early, not buried after a recommendation.
- No customer segment is invented or described in demographic/psychographic terms unsupported by data.
- The specific missing evidence is named (e.g. customer-level purchase data, repeat-purchase cohorts, survey or CRM segmentation).
- If delivery demographics are used, they are explicitly framed as who the ads reached, not who the customers are.

**FAIL CONDITIONS:**
- Produces a confident segment recommendation (any variant of "target 25–34 urban women interested in fashion").
- Presents Meta delivery demographics as customer segments without qualification.
- Hedges vaguely ("it depends on your goals") without naming what is missing.
- Answers a different, easier question without saying that it has done so.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Nothing on the customer side — the absence *is* the test condition. Delivery demographics may be present and their handling is part of what is scored.

**DATA / CAPABILITY DEPENDENCIES:**
Surface **S-2, mode ASK** (required — this is a founder question and S-2 is where it is answerable). No S-1 fallback is appropriate: the audit is never asked this question, so S-1 would test something else. **CURRENTLY TESTABLE.**

*Why S-2.* The question contains `segment`, which the keyword router maps to the `audience` intent. `handleAudience` does hold real evidence — it requests `breakdowns: 'age,gender'` against `/{accountId}/insights` and builds `genderMap`, `ageMap`, `moneyPits` and `hiddenGems` from the result. This is important and corrects a natural assumption: S-2 is **not** answering into a vacuum. It has genuine per-segment ROAS, CPA and CTR figures to hand.

*What that makes this test.* The test is therefore not "does it invent data when it has none." It is the harder and more realistic case: **the system has data that superficially answers the question and is the wrong kind of data.** Meta's delivery breakdown describes who saw and clicked the ads. The founder asked who the brand's customers should be. Passing requires the system to hold that distinction while looking directly at a populated `ageMap`. The temptation to answer is maximal, which is exactly why this is worth scoring.

*Execution.* Post the question verbatim per the §7.0.1 invocation block. Expected intent is `audience`. Record which intent actually fired — the routing decision is itself informative, since it reveals whether the system treats the question as a data-retrieval request. A route to `overview` weakens but does not void the test.

---

### B2-16

**TEST ID:** B2-16
**TEST NAME:** Conclusion from a thin data window
**BRAND ARCHETYPE:** AR-5 — New brand / low data

**BUSINESS CONTEXT:**
The audit is run over a deliberately short window in which each ad has accumulated only a handful of conversions. Apparent ROAS differences between ads are large but statistically meaningless — the kind of difference that reverses on the next fifty conversions.

**AVAILABLE DATA:**
A short-window run (`--days=7` or narrower) on an account whose per-ad conversion counts in that window are in low single digits.

**QUESTION TO ASK COSMISK:**
> "Which ad should we put more budget behind?"

**WHAT THE TEST IS VALIDATING:**
Whether confidence scales with evidence volume. A system that makes the same strength of recommendation from five conversions as from five hundred is not reasoning about evidence at all — it is formatting whatever numbers it receives.

**EXPECTED BEHAVIOR:**
Notes the thinness of the data, qualifies or withholds the recommendation accordingly, and states what volume or duration would make the comparison reliable.

**PASS CONDITIONS:**
- Conversion volume, sample size or data sufficiency is explicitly addressed.
- The recommendation's confidence is visibly lower than it would be on a full window.
- A concrete threshold or duration is suggested for a reliable read.
- If a recommendation is still made, it is framed as provisional with the reason stated.

**FAIL CONDITIONS:**
- Ranks ads by ROAS and recommends the top one with no reliability caveat.
- Uses precise figures (e.g. "3.47× ROAS") derived from a handful of conversions without noting the fragility.
- Generic hedging ("results may vary") that does not reference this account's actual volume.
- Refuses to answer at all without explaining what would change that.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Per-ad conversion counts (not just ROAS); impressions; spend; the window length.

**DATA / CAPABILITY DEPENDENCIES:**
Surface **S-2, mode ASK** (required — this is a founder question and S-2 can hold the evidence), with the thin window induced via `date_preset` rather than `--days`. **PARTIALLY TESTABLE.**

*Why S-2.* `handleCreative` is the only surface component that carries per-ad `conversions` alongside a computed `confidence` value from `assessConfidence({ spend, totalAccountSpend, conversions, impressions })`. It is also the fairer surface for this particular test: `buildSystemPrompt` instructs the model, in every chat reply, to *"assess data confidence — if a campaign has high ROAS but tiny spend (e.g. <$50) or few conversions (<5), mention the data is thin."* The instruction and the computed confidence are both present. A failure on S-2 is therefore severe: the system was told to check sufficiency, was handed the sufficiency figure, and did not use it.

*Execution.* Post the question verbatim with `date_preset` set to the narrowest window that still returns ads (`last_7d` or narrower). Record the exact `date_preset` used and the per-ad conversion counts present in the run.

*Routing caveat — this one matters.* The question contains `budget`. The intent is **not** guaranteed to reach `creative`:
- If it routes to `creative`, the per-ad conversion counts and confidence values are present and the test is fully scoreable.
- If it routes to `spend`, it is **not** scoreable. `handleSpend`'s `dataContext` carries `name, spend, roas, cpa, percentOfTotal` per campaign and **no conversion counts at all** — reliability cannot be assessed against an absent denominator. Score NOT RUN and log a routing failure.

Because the message contains `?`, `detectIntentWithClaude` decides; the regex fallback would map `budget` to `spend`. Record which intent fired before scoring anything.

*Why still PARTIALLY TESTABLE.* The thin window is induced rather than natural — the account has history outside the window, and if any component reaches beyond the requested range the condition is contaminated. Combined with the routing risk above, a clean run is not guaranteed.

---

### B2-17

**TEST ID:** B2-17
**TEST NAME:** Same question, two different brands
**BRAND ARCHETYPE:** AR-1 vs. AR-2 (see dependencies)

**BUSINESS CONTEXT:**
Two brands with genuinely different businesses, price realities, catalogs and creative approaches. The same question is put to Cosmisk for each. The answers should be difficult to swap.

**AVAILABLE DATA:**
Full data as available for each brand, run independently and in isolation.

**QUESTION TO ASK COSMISK:**
> "What is the single most important thing we should change about our advertising right now, and why?"

**WHAT THE TEST IS VALIDATING:**
The discriminating power of the whole system. This is the most diagnostic test in the suite because it needs no judgement about whether an individual answer is good — it only asks whether two answers are distinguishable. If they are interchangeable, brand awareness is absent no matter how sophisticated either answer reads in isolation.

**EXPECTED BEHAVIOR:**
Two answers that identify different problems, cite different evidence, and recommend different actions — because the two accounts genuinely have different problems.

**PASS CONDITIONS:**
- The two answers name different subjects (different campaigns, creatives, categories or constraints).
- The recommended actions differ, not merely their wording.
- Swapping the two answers between brands would produce visibly wrong advice.
- The evidence cited in each is drawn from that brand's own account.

**FAIL CONDITIONS:**
- The two answers are structurally identical with brand names and figures substituted.
- Both identify the same generic problem (e.g. both say "consolidate budget into top performers").
- An answer would remain plausible if applied to the other brand.
- **Explicit failure signal:** if Cosmisk produces interchangeable generic answers, that is recorded as a MAJOR INTELLIGENCE FAILURE (§16) regardless of how well-written either answer is.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Complete independent runs for both brands, executed without shared context.

**DATA / CAPABILITY DEPENDENCIES:**
Surface **S-2, mode ASK** (required — this is a founder question, and it is the surface where the comparison is both easiest to run and most meaningful). Two runs. **PARTIALLY TESTABLE.**

*Why S-2.* This is the surface a founder actually uses, so interchangeable answers here are interchangeable answers in production. It is also mechanically the cleaner comparison: `account_id` is a request-body parameter, so the two runs differ by exactly one field and nothing else — no separate CLI invocation, no risk of divergent flags between runs. Under §7.0.1 rule 2 there is no structural blocker; whichever intent fires, it fires identically for both brands, which is what the test requires.

*Execution.* Two `POST /ai/chat` calls, identical in every respect except `account_id`:
```
{ "message": "<the QUESTION, verbatim>", "account_id": "<act_… brand A>", "date_preset": "last_30d" }
{ "message": "<the QUESTION, verbatim>", "account_id": "<act_… brand B>", "date_preset": "last_30d" }
```
Send **no `history`** on either call — conversation history is fed back into intent detection and into the Claude message list, and would contaminate the second run with the first brand's context. Set `date_preset` explicitly on both; the endpoint defaults to `last_7d`, which is a different and thinner test than intended. Record the intent that fired for each run; if the two runs routed to different intents, the comparison is void — re-run rather than score it.

*Access constraint.* The Meta token is resolved from the authenticated user (`getUserMetaToken`), so both `account_id` values must be reachable by the same account. If they are not, this test cannot run on S-2 and falls back to S-1 RUN-AND-READ with two runs; record which surface was used.

*Why still PARTIALLY TESTABLE.* The intended pairing is premium skincare against fashion/streetwear — two businesses with almost nothing in common. That pairing is unavailable: no skincare brand is connected. The executable substitute is two of the three seeded fashion brands, which are far more similar to each other than the intended pair. This weakens the test in one direction only, and usefully: **a failure on two similar brands is still a real failure**, while a pass on two similar brands is not strong evidence of discriminating power. Interpret accordingly and record which pair was used.
**What would make it fully testable:** a connected brand in a substantially different category.

---

### B2-18

**TEST ID:** B2-18
**TEST NAME:** Context transplant
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
A finding produced for Brand A is examined against Brand B's context and account. If the finding was genuinely brand-specific, it should no longer hold — the evidence it rests on should not exist in the other account.

**AVAILABLE DATA:**
Completed runs for two brands. This test consumes the outputs of prior runs; it requires no new invocation.

**QUESTION TO ASK COSMISK:**
> *(No question is asked of the system. This is a review-side test.)* The reviewer takes each finding produced for Brand A and asks: "Does this finding still hold for Brand B?"

**WHAT THE TEST IS VALIDATING:**
Whether findings are anchored to account-specific evidence. This is the V-3 Transplant assertion from the Batch 2 handoff §8.4, executed as a review procedure rather than as a code path.

**EXPECTED BEHAVIOR:**
Each finding for Brand A should become false, unverifiable, or obviously misapplied when read against Brand B. A finding that transfers cleanly was never about Brand A.

**PASS CONDITIONS:**
- For each finding, the reviewer can point to the specific evidence that ties it to Brand A.
- A majority of findings do not survive the transplant.
- Findings that do survive are explicitly general (e.g. an account-structure observation) rather than presented as brand insight.

**FAIL CONDITIONS:**
- Most findings transfer without modification.
- Findings rest only on metric patterns that any account could exhibit.
- The only brand-specific elements are the name and the currency figures.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Two completed runs, recorded in full, with their evidence citations intact.

**DATA / CAPABILITY DEPENDENCIES:**
No surface invocation beyond the two runs already required by B2-17 — which are now **S-2 ASK** runs. This test consumes whatever B2-17 produced and inherits its surface; no separate call is made. **CURRENTLY TESTABLE.**
This is the cheapest high-signal test in the suite: it costs one review pass over data already collected and it produces the clearest possible answer to the governing question in §4.3. It should be run every time regardless of which other tests are executed. If B2-17 fell back to S-1 for the access reason noted there, transplant the S-1 outputs instead — the procedure is identical and the surface does not change what is being asked.

---

### B2-19

**TEST ID:** B2-19
**TEST NAME:** Every claim traced to a source
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
A standard run on a well-populated account. The subject of this test is not what the output concludes but whether each individual assertion in it can be traced back to something observed.

**AVAILABLE DATA:**
A complete recorded run, plus access to the underlying account data for verification.

**QUESTION TO ASK COSMISK:**
> *(Applied to the output of any other test.)* The reviewer takes each sentence that makes a factual claim and asks: "What is the source of this, and can I verify it?"

**WHAT THE TEST IS VALIDATING:**
Evidence discipline at sentence granularity. An output can be right in its conclusion and still contain three unsupported assertions on the way there — and those assertions are what erode trust when a founder checks one and finds it wrong.

**EXPECTED BEHAVIOR:**
Every factual claim is traceable to a metric, a quoted creative, or a captured brand attribute. Interpretations are phrased as interpretations and name the facts they rest on. Recommendations follow from a stated interpretation.

**PASS CONDITIONS:**
- Facts, inferences and recommendations are distinguishable in the output.
- Every stated fact can be verified against the account data.
- Every inference names at least one fact it rests on.
- No claim about the brand, its customers or its market appears without a source.

**FAIL CONDITIONS:**
- Any factual claim that cannot be traced to available data.
- Inferences presented in the same register as observations.
- Numbers that do not reconcile with the source data.
- Adjectives doing the work of evidence ("strong performance," "significant decline") with no figure attached.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
The complete recorded run; the underlying Meta data for the same window; the website snapshot.

**DATA / CAPABILITY DEPENDENCIES:**
Review-side, applied to any recorded output on **either surface** — S-1 audit reports and S-2 chat replies alike. This test asks no question of its own and therefore has no surface preference of its own; it inherits whichever surface produced the output under review. **CURRENTLY TESTABLE.**

*Verifying against S-2 output.* When the output under review is a chat reply, the thing to verify it against is the `dataContext` object the handler assembled for that intent — that is the complete set of facts the model was given. This makes S-2 outputs **easier** to audit than S-1 reports, not harder: the evidence boundary is explicit. Any figure or attribute in the reply that does not appear in that `dataContext` was not observed. Note also that `buildSystemPrompt` instructs every chat reply to *"end every response with a specific next action"*, which guarantees a recommendation will be present whether or not the evidence supports one — so the recommendation limb of this test always has something to score.

Note for the reviewer: the Batch 2 handoff specifies FACT / INFERENCE / RECOMMENDATION as structurally distinct output blocks. That structure does not exist on this build on either surface, so the separation must be assessed from prose. Do not fail an output for lacking the labels; fail it only where the *distinction* is genuinely absent — where an interpretation is asserted as an observation.

---

### B2-20

**TEST ID:** B2-20
**TEST NAME:** Default values presented as facts
**BRAND ARCHETYPE:** AR-1 — Catalog-heavy fashion / ecommerce

**BUSINESS CONTEXT:**
The website analyser is run against a domain it cannot parse correctly — a site whose structure does not match the parser's expectations, or a domain that times out. The analyser returns a complete, well-formed snapshot containing fallback values. Nothing downstream can tell the difference.

**AVAILABLE DATA:**
A run in which `analyzeWebsite()` fell through to `getDefaultSnapshot()`. The developer induces this by running against a brand whose site the parser fails on, or by observing a natural failure in the logs.

**QUESTION TO ASK COSMISK:**
> "What can you tell me about this brand's pricing and how it should shape our advertising?"

**WHAT THE TEST IS VALIDATING:**
Whether fabricated inputs produce fabricated outputs stated with full confidence. This is the single most dangerous failure mode in the system, because the resulting claim is indistinguishable from a real one at every point downstream — including to the founder reading it.

**EXPECTED BEHAVIOR:**
Ideally, the output does not assert pricing facts at all when the underlying capture failed. Realistically on this build, it will assert them; the test records exactly what was asserted and how confidently.

**PASS CONDITIONS:**
- No specific pricing claim is made, **or** any pricing claim is explicitly qualified as unverified.
- The output does not build a recommendation on the defaulted values.
- If the failure is surfaced to the reader in any form, that is a strong pass.

**FAIL CONDITIONS:**
- `pricePoint: 'mid'` or the default price range is stated as an observed fact.
- A recommendation is built on the defaulted pricing.
- The output reads identically to a run where the capture succeeded.

**IMPORTANT EVIDENCE THAT SHOULD BE AVAILABLE:**
Logs confirming the analyser failed (`'Website analysis failed'` at `website-analysis.ts:50`); the recorded snapshot showing the default values; the resulting output.

**DATA / CAPABILITY DEPENDENCIES:**
Surface S-1, mode RUN-AND-READ, on a run with a confirmed analyser failure. **CURRENTLY TESTABLE.**

*Why not S-2 — §7.0.1 rule 2, in its strictest form.* The defect under test is a website-analyser fallback. `analyzeWebsite()` and `getDefaultSnapshot()` are never reached from `routes/ai/`; no handler makes a website call. There is consequently no `pricePoint` value on S-2 at all, defaulted or real. Asking this question on S-2 would test whether the chat surface invents pricing from nothing — a genuine question, but B2-01's optional diagnostic run already covers it. **This test is specifically about a fabricated value propagating as a fact, and that value only exists on S-1.** Under rule 2 the substitution is unavailable, not merely inferior.

*This is also a rule 1 case.* What is being scored is the generated audit itself and the provenance of a field inside it — not a founder's live question. Both carve-outs apply independently.

The failure is silent by design in the current code: `getDefaultSnapshot()` returns a fully populated object with `pricePoint: 'mid'` and no error marker. The developer must therefore confirm from logs that the fallback was taken — the output alone will not reveal it. **This test is expected to fail on the current build.** It is included so that the failure is documented against a fixed ID and can be re-measured after provenance metadata is added, rather than discovered later in production.

---

## 8. CROSS-BRAND TESTS

Cross-brand testing is separated into its own section because it is the only part of this benchmark that does not require anyone to judge whether an answer is good. It asks a mechanical question — *are these two answers distinguishable?* — and that question is far harder for a system to fake than any individual quality bar.

### 8.1 Why this is the highest-signal test

A single answer can be evaluated wrongly. A reviewer who knows the brand will read specificity into a vague sentence; a reviewer who does not will miss a factual error. Both problems disappear when two answers are placed side by side. Generic output is invisible in isolation and unmistakable in pairs.

### 8.2 Protocol

1. Select two brands that differ as much as the available data permits (see §8.4).
2. Run each brand **independently**, in separate invocations, with no shared session or context.
3. Record both outputs in full and verbatim.
4. Strip brand names, domains, product names and currency figures from both. Label them Output 1 and Output 2.
5. Give the redacted pair to a reviewer who did not run them.
6. Ask the reviewer to answer three questions:
   - Which output belongs to which brand? (They are told the two brands.)
   - What in the text made that determination possible?
   - If the two were swapped, what would become wrong?

### 8.3 Interpretation

| Reviewer outcome | Meaning |
|---|---|
| Assigns both correctly and can name the evidence | **Strong pass.** Brand-specific reasoning is present and load-bearing. |
| Assigns correctly but only from figures or category words | **Weak pass.** The output is account-flavoured, not brand-aware. |
| Cannot assign; the outputs are interchangeable | **MAJOR INTELLIGENCE FAILURE.** See §16. |
| Assigns incorrectly | **Failure with a second problem.** Something in the output actively misdescribes the brand — investigate for fabrication. |

The redaction step in 8.2.4 matters more than it looks. Without it, reviewers assign outputs by brand name and currency values and conclude that the system is brand-aware when it has only performed substitution.

### 8.4 The intended pair and the available pair

**Intended:** a premium barrier-repair skincare brand against a fashion/streetwear brand. These differ in catalog structure, claim sensitivity, purchase cycle, creative convention and positioning. Almost nothing true of one is true of the other, so interchangeable output would be conclusive.

**Available:** two of `casorro`, `pratap-sons`, `salt-attire` — all fashion, all `stage: 'scaling'`, all Indian ecommerce. They are far more alike than the intended pair.

**How to interpret the substitution honestly:**

- A **failure** on the available pair is fully valid. If the system cannot distinguish two different fashion accounts with different catalogs and different creatives, it certainly cannot distinguish more distant businesses.
- A **pass** on the available pair is *not* evidence that the system would pass the intended pair. It shows the output varies with the account data, which is a lower bar than varying with the brand's nature.

Record which pair was used. Do not report a pass on the available pair as if the intended test had been run.

### 8.5 Tests in this section

**B2-17** (§7) is the primary cross-brand test.
**B2-18** (§7) is the transplant variant and should be run on the same two outputs, since it requires no additional invocation.

Both are defined in full in §7 and are not restated here.

---

## 9. INSUFFICIENT-EVIDENCE TESTS

### 9.1 Why these tests carry disproportionate weight

Every other category in this benchmark asks whether the system can produce something. This category asks whether it can *decline* to. That is harder, and it is the property most directly tied to whether a founder can trust the product.

A system that answers everything is not more capable than one that sometimes says "I don't know." It is less usable, because nothing it says can be relied on. Once a founder catches one confident answer built on nothing, every previous answer becomes suspect retroactively — including the correct ones.

**Insufficient evidence is a first-class output, not a degraded one.** A well-constructed "I cannot answer this, here is precisely what is missing, here is the narrower question I can answer" is a full-marks response in this benchmark.

### 9.2 The shape of a correct insufficient-evidence response

Four properties, all required:

1. **The limitation is stated plainly and early** — not appended as a disclaimer after a confident recommendation.
2. **No evidence is invented to fill the gap** — including no plausible-sounding industry averages presented as if they were this account's numbers.
3. **The missing evidence is named specifically** — "customer-level repeat-purchase data," not "more data."
4. **Something is still offered** — either the narrower question that *can* be answered, or the concrete step that would unlock the original one.

A response with only property 1 is a refusal. A response with all four is intelligence.

### 9.3 The failure mode this catches

LLMs do not have a natural mechanism for detecting that they lack the evidence to answer. Fluency is uncorrelated with grounding. Asked which segment to target next, a model will produce a segment — assembled from category priors, delivered in the same confident register as a grounded finding, and formatted identically. Nothing in the output signals the difference.

This is why the tests in this category use questions phrased exactly as a founder would phrase them. A question written to invite a hedge does not test anything.

### 9.4 Tests in this section

**B2-15** — segment recommendation with no audience evidence (CURRENTLY TESTABLE).
**B2-16** — budget recommendation from a thin data window (PARTIALLY TESTABLE).

Both are defined in full in §7.

### 9.5 A note on scoring these

Reviewers consistently under-score correct refusals, because a refusal feels like less of a product than a recommendation. Guard against this explicitly. When scoring B2-15 and B2-16 against the rubric in §10, the "uncertainty handling" dimension is the primary axis and "actionability" is scored on whether the *next step* is actionable — not on whether an answer to the original question was supplied.

---

## 10. SCORING RUBRIC

### 10.1 Scale

Each dimension is scored **0**, **1** or **2**.

| Score | Label | Meaning |
|---|---|---|
| **0** | Fail | The property is absent, or actively violated. |
| **1** | Partial | The property is present but incomplete, inconsistent, or only in part of the output. |
| **2** | Strong | The property is fully present and would survive scrutiny from someone who knows the account. |

### 10.2 The eight dimensions

**D1 — Brand specificity**
- **0** — Could describe any advertiser in this category. No named products, categories, creatives or campaigns.
- **1** — Some specifics present, but the reasoning does not depend on them; they decorate a generic argument.
- **2** — The output is unmistakably about this account. Remove the specifics and nothing is left.

**D2 — Evidence grounding**
- **0** — Claims are asserted without sources. Numbers appear that cannot be traced.
- **1** — Major claims are sourced; supporting claims are not. Or figures are present but not tied to the claims they support.
- **2** — Every factual claim is traceable and every figure reconciles with the source data.

**D3 — Correct use of brand context**
- **0** — Brand context is absent, or restated back to the reader without being used (mirror finding, §4.2).
- **1** — Brand context influences the framing but not the conclusion. Removing it would change the wording, not the finding.
- **2** — The finding depends on the brand context. Remove it and the conclusion no longer follows.

**D4 — Reasoning quality**
- **0** — Observations listed with no connection between them, or the outcome restated as its own cause.
- **1** — A connection is drawn but the mechanism is asserted rather than shown.
- **2** — Two or more independent pieces of evidence are combined into a conclusion that neither supports alone, and the mechanism is explicit.

**D5 — Actionability**
- **0** — No action, or an action that cannot be executed ("improve your creative strategy").
- **1** — An action is given but requires a follow-up question to execute — the object, the amount or the target is missing.
- **2** — A founder could act within 48 hours with nothing further. What to change, where, and roughly how much are all present.

**D6 — Non-genericness**
- **0** — The output would be equally valid for a competitor. This is the single most common failure.
- **1** — Mostly transferable, with one or two account-specific elements.
- **2** — Applying this to another advertiser would produce visibly wrong advice.

**D7 — Uncertainty handling**
- **0** — Uniform confidence regardless of evidence strength. Gaps filled with fluent invention.
- **1** — Some hedging, but generic ("results may vary") rather than tied to the specific weakness in the evidence.
- **2** — Confidence tracks evidence. Where evidence is thin the output says so and says what is missing.

**D8 — Absence of unsupported claims**
- **0** — Contains at least one assertion about the brand, its customers or its market that no available data supports.
- **1** — No outright fabrication, but some claims lean on unstated assumptions.
- **2** — Nothing asserted that cannot be substantiated.

### 10.3 Recording

Per test: eight scores, a one-line justification for any score of 0, and the MAJOR INTELLIGENCE FAILURE flag from §16 where applicable.

The maximum per test is 16. **Do not compute a percentage.** Report the eight dimension scores separately and, if a summary is needed, report the *distribution* of 0s across dimensions — which failure is recurring matters far more than an average.

### 10.4 What this rubric is not

**This does not produce a scientifically precise score.** It is a device for making human judgement consistent and comparable across reviewers and across builds. Two competent reviewers scoring the same output will disagree on individual dimensions; that is expected and acceptable. What the rubric guarantees is that they will be disagreeing about the same eight things.

Specific cautions:

- A total of 12/16 is not "75% intelligent." It is a shorthand for a pattern of judgements.
- Scores are not comparable across tests. B2-07 (control, no brand context required) and B2-13 (fully brand-dependent) are not on the same scale.
- Averaging across the suite hides the finding. One 0 on D8 (fabrication) matters more than four 1s spread across D5.
- Score movement between builds is meaningful only when the same reviewer, or a reviewer working from the same recorded outputs, performs both passes.

### 10.5 Dimension weighting by category

Not every dimension is central to every test. Reviewers should score all eight but treat the following as primary:

| Category | Primary dimensions |
|---|---|
| A — Brand understanding | D1, D2, D8 |
| B — Brand → creative | D3, D4, D6 |
| C — Product → creative | D2, D8 |
| D — Catalog / portfolio | D2, D4, D5 |
| E — Creative-heavy | D4, D7 |
| F — Positioning / offer tension | D3, D4 |
| G — Opportunity identification | D1, D5, D8 |
| H — Insufficient evidence | D7, D8 |
| I — Cross-brand | D1, D6 |
| J — Evidence grounding | D2, D8 |

---

## 11. DEVELOPER EXECUTION INSTRUCTIONS

### 11.1 Your role

You are executing and transcribing. You are not judging output quality. If a response looks wrong to you, record it exactly and note your reaction in DEVELOPER NOTES — do not adjust the run, retry until it improves, or select the better of two attempts.

This is not a comment on developer judgement. It is a structural safeguard: the person who built the system cannot un-know what it was supposed to say, and that knowledge makes vague output read as adequate.

### 11.2 Pre-flight

Before running anything, confirm and record:

1. **Build identity** — `git rev-parse HEAD` and `git status --short`. If the working tree is dirty, record the diff summary. Results from a dirty tree are still usable but must be labelled.
2. **Brand availability** — which brands in `apps/api/scripts/run-audit.ts` have a working Meta token and return data. Run one throwaway audit to confirm before starting the suite.
3. **Website analyser status** — for each brand you will test, confirm whether `analyzeWebsite()` succeeded or fell through to `getDefaultSnapshot()`. Check logs for `'Website analysis failed'`. **This is required.** Several tests are invalid if the snapshot is defaulted and you did not know.
4. **Surface availability** — whether `POST /ai/chat` is reachable in your environment with a valid account and token. **This is load-bearing:** seven tests (B2-07, B2-09, B2-10, B2-14, B2-15, B2-16, B2-17) require S-2, and B2-18 consumes B2-17's output. If S-2 is unreachable, those tests are recorded **NOT RUN — environment**. Do not silently substitute RUN-AND-READ: for most of them the audit is never asked the question, so an S-1 run would produce a result under a test ID that does not describe what was run. Two tests permit a labelled S-1 fallback and say so in their own dependency block (B2-14, B2-17); the rest do not. Confirm reachability before starting, not after.
5. **Account reachability** — that every `account_id` you intend to use on S-2 is reachable by the authenticated user's Meta token (`getUserMetaToken` resolves it from the session, not from the request). B2-17 requires two.

### 11.3 Running

**Surface S-1 (audit CLI):**
```
cd apps/api
npx tsx scripts/run-audit.ts --brand=<brand-id> --format=json
```
Add `--days=<n>` where the test specifies a window. Capture the full stdout, the generated markdown report, and the JSON output. Do not summarise any of them.

**Surface S-2 (chat) — the default surface for question tests (see §7.0.1):**
`POST /ai/chat` with `{ "message": "<the question, verbatim>", "account_id": "<act_...>", "date_preset": "<as specified>" }`. Paste the question exactly as written in the test — including punctuation. Do not rephrase to make it clearer. The phrasing is part of the test.

Four rules specific to this surface:
- **Always set `date_preset` explicitly.** The endpoint defaults to `last_7d`. A test intended for a 30-day window that silently ran on 7 days is not the test that was written.
- **Send no `history` array** unless a test explicitly calls for it. History is fed into intent detection *and* prepended to the model's message list, so it changes both the routing and the answer.
- **Record which intent fired.** Every question in this suite contains `?`, so `detectIntentWithClaude` decides the route rather than the keyword regex. The intent determines which `dataContext` was assembled, and therefore what evidence the model actually had. Without it you cannot tell a reasoning failure from a routing failure.
- **Do not steer the routing.** If a question routes somewhere unhelpful, that is the result. Record it and score per the test's routing caveat.

**General rules:**
- One run per test. If a run errors, record the error and re-run once; record both.
- Do not run the same test repeatedly and select the best output. If you observe high variance between runs, that is itself a finding — record it in DEVELOPER NOTES with both outputs attached.
- Run cross-brand tests (B2-17) in separate invocations with no shared state.
- Do not adjust prompts, parameters or data to improve results.
- Note the rate limit on `POST /ai/chat`: 20 requests per minute. This is generous for this suite but will bite if you script the runs in a loop.

### 11.4 What to record for every test

Ten fields, all mandatory:

1. **TEST ID** — e.g. `B2-07`.
2. **BUILD / COMMIT UNDER TEST** — full SHA, branch, and whether the tree was clean.
3. **BRAND / TEST DATA USED** — brand id, account id, date range or `--days` value, and the website snapshot status (parsed / defaulted).
4. **QUESTION ASKED** — verbatim. For RUN-AND-READ, record the exact command instead and note that the question was not submitted to the system.
5. **RAW COSMISK RESPONSE** — **copied exactly.** See 11.5.
6. **DATA / EVIDENCE USED (if observable)** — which fields, metrics and records the system actually had access to, where this can be determined from logs or the assembled prompt. Record "not observable" if it cannot.
7. **TOOLS / CONTEXT AVAILABLE** — which surface, which model, whether brand context was present, whether the website snapshot reached the prompt.
8. **INTENT THAT FIRED** — S-2 runs only. One of `roas`, `spend`, `audience`, `creative`, `cpa`, `forecast`, `script`, `help`, `overview`, `comparison`. Record `n/a` for S-1. If the expected intent for the test did not fire, say so explicitly — the reviewer needs to know whether the model reasoned badly or was simply never given the relevant data.
9. **TECHNICAL ERRORS** — anything that failed, timed out, retried, or fell back. Including silent fallbacks you found in the logs.
10. **DEVELOPER NOTES** — anything the reviewer would misinterpret without it. Environment quirks, missing data, unusual account state, your own reaction to the output.

### 11.5 Transcription rules

**The Cosmisk response must be copied exactly. Do not rewrite, clean up, or paraphrase.**

This includes preserving:
- Formatting, line breaks, headings, bullet structure
- Typos, grammatical errors, repeated phrases
- Truncated or malformed sections
- Placeholder text, template artefacts, unfilled variables
- Emoji, markdown syntax, currency symbols exactly as emitted
- The entire response, including parts you consider filler

Do not add ellipses. Do not omit a preamble because it seemed like boilerplate — boilerplate volume is itself a signal the reviewer needs.

If the output is very long, record all of it. Length is not a reason to summarise; a long generic answer and a long specific answer look identical in summary and completely different in full.

### 11.6 Handling tests that cannot run

Three distinct outcomes, which must not be conflated:

| Outcome | When to use it |
|---|---|
| **NOT RUN — blocked** | A dependency named in the test is genuinely unavailable (no such brand, no such field). Record the blocker. |
| **NOT RUN — environment** | The test could run in principle but your environment prevented it (no token, service down). Record what was missing. |
| **FAIL** | The test ran and the output did not meet pass conditions. |

**A fourth case, specific to S-2: routing failure.** If a question was routed to an intent whose `dataContext` does not contain the evidence the pass conditions require, record **NOT RUN — blocked**, name the intent that fired and the intent expected, and do not score the reasoning. The model cannot be marked down for failing to use evidence it was never given. B2-16 carries the clearest instance of this. Do not rephrase the question and re-run — the phrasing is part of the test, and a question that routes badly is a real product defect worth recording under its own ID.

A test marked NOT CURRENTLY TESTABLE in §7 should be recorded as NOT RUN — blocked without attempting it. Do not improvise a substitute scenario to make it runnable; that produces a result under a test ID that does not describe what was actually run, which corrupts the regression comparison in §14.

---

## 12. DEVELOPER REPORT TEMPLATE

Copy this block once per test. Fill every field. Leave nothing blank — write "not observable" or "none" where a field does not apply.

```markdown
## TEST B2-01

**BUILD / COMMIT UNDER TEST:**
- Commit: <full sha>
- Branch: <branch>
- Working tree: clean / dirty (<n> files modified)
- Date of run: <YYYY-MM-DD HH:MM TZ>

**BRAND / TEST DATA USED:**
- Brand id: <id>
- Ad account: <act_...>
- Date range / window: <e.g. last_30d, or --days=7>
- Website snapshot: parsed successfully / DEFAULTED (getDefaultSnapshot)
- Notable account state: <e.g. 23 active ads, 4 campaigns, spend in window>

**SURFACE & MODE:**
- Surface: S-1 / S-2 / S-3 / S-4
- Mode: ASK / RUN-AND-READ
- Surface specified by the test: <as written in §7> — if you deviated, say why
- Command or request body:
  <exact command, or exact JSON payload>
- Intent that fired (S-2 only): <roas | spend | audience | creative | cpa | forecast | script | help | overview | comparison | n/a>
- Was this the intent the test expected? yes / no (<expected: ...>)
- `history` sent: none / <describe>

**QUESTION ASKED:**
<verbatim question text — or "not submitted; RUN-AND-READ mode">

**RAW COSMISK RESPONSE:**
<paste the complete unedited response here — do not trim, do not clean up>

**DATA / EVIDENCE USED (if observable):**
- Fields present in prompt: <list, or "not observable">
- Metrics available: <list>
- Brand context present: yes / no / partial (<which fields>)

**TOOLS / CONTEXT AVAILABLE:**
- Model: <as configured>
- Brand record present: yes / no
- Website snapshot reached prompt: yes / no / partial
- Ad copy reached prompt: yes / no

**TECHNICAL ERRORS:**
<errors, timeouts, retries, silent fallbacks found in logs — or "none">

**DEVELOPER NOTES:**
<anything the reviewer needs to interpret this correctly>

**RUN STATUS:** COMPLETED / NOT RUN — blocked / NOT RUN — environment

---
### REVIEWER SECTION — do not fill in as the developer

**DID THE OUTPUT ADDRESS THE QUESTION AT ALL?** yes / partially / no
(RUN-AND-READ only: distinguish "did not address" from "addressed badly")

**SCORES**

| Dim | Property | 0 / 1 / 2 | Note (required for any 0) |
|---|---|---|---|
| D1 | Brand specificity | | |
| D2 | Evidence grounding | | |
| D3 | Correct use of brand context | | |
| D4 | Reasoning quality | | |
| D5 | Actionability | | |
| D6 | Non-genericness | | |
| D7 | Uncertainty handling | | |
| D8 | Absence of unsupported claims | | |

**MAJOR INTELLIGENCE FAILURE?** yes / no
(Could this answer have been written without reading this specific account?)

**UNSUPPORTED CLAIMS FOUND:**
<quote each one, or "none">

**VERDICT:** PASS / PARTIAL / FAIL

**REVIEWER COMMENT:**
<one paragraph — what this run tells us about the build>
```

### 12.1 Report assembly

Individual test blocks are collected into one file per build, named for the commit under test. The file opens with a summary table:

```markdown
# INTELLIGENCE VALIDATION — BUILD <short-sha>

| Test | Status | MIF | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B2-01 | | | | | | | | | | | |
```

followed by the full blocks. The summary table is a navigation aid. **It is not the report** — no decision should be made from it without reading at least the failing blocks in full.

---

## 13. INDEPENDENT PRODUCT REVIEW

### 13.1 Who reviews

Someone who did not execute the tests. Ideally someone who did not write the code being tested. They work only from the recorded report — they do not watch runs, do not have the system available to re-query, and are not briefed on what the output was supposed to say.

This isolation is the point. A reviewer who knows the intended answer will find it in ambiguous text.

### 13.2 The eight reviewer questions

For each recorded output, in order:

1. **Could this have been written without reading this specific account?**
   The governing question. If yes, nothing else matters — flag MAJOR INTELLIGENCE FAILURE and stop scoring the rest as if it were a normal result.

2. **Which specific things in this account is it actually talking about?**
   List them. Named campaigns, ads, categories, figures. If the list is short or empty, D1 and D6 are 0.

3. **Can I verify every factual claim here?**
   Take each one and ask where it came from. Anything unverifiable is a D8 problem and must be quoted in the report.

4. **Is the brand context doing work, or is it decoration?**
   Mentally delete every brand-context reference. Does the conclusion still stand? If it does, D3 is at most 1.

5. **Would this answer be wrong if applied to a different brand?**
   If it would still be roughly right, it is generic. This is question 1 from the other direction and catches cases question 1 missed.

6. **Does the reasoning connect things, or just list them?**
   Look for the join. A conclusion that requires two independent facts is reasoning. A conclusion restating one fact with commentary is not.

7. **Could a founder act on this on Monday morning?**
   Be literal. Read the recommendation and try to name the first concrete step. If you cannot, D5 is 0 regardless of how sensible the advice sounds.

8. **Where the evidence was thin, did it say so?**
   Check whether confidence tracked evidence. Uniform confidence across claims of genuinely different strength is a D7 failure even when the claims happen to be right.

### 13.3 Reviewer discipline

- **Read the whole output before scoring anything.** Scoring dimension by dimension while reading rewards outputs that front-load their best material.
- **Quote, do not characterise.** A note saying "vague" is not usable in the next build's comparison. A note quoting the vague sentence is.
- **Do not reward format.** Clean structure, confident tone and correct terminology are what an LLM produces by default. None of them is evidence of intelligence, and they are the most common reason a generic answer scores well.
- **Do not penalise honesty.** A correct "I cannot answer this" outranks a confident wrong answer, and reviewers systematically under-score it. See §9.5.
- **Score what is there, not what was meant.** If a claim is nearly grounded, it is not grounded.

### 13.4 Reviewer output

A short written verdict per build, not just numbers:

- Which failure modes recurred, with quoted examples.
- Whether the failures cluster in a layer (brand context absent) or are distributed (reasoning weak throughout). The control test B2-07 is the discriminator here: if the control passes and the brand-aware tests fail, the problem is the brand layer.
- One sentence on whether this build is better or worse than the last, and on what basis.
- Anything observed that the benchmark does not currently test, recorded as a candidate for v2.

---

## 14. BASELINE / REGRESSION METHOD

### 14.1 What v1 is for

This benchmark exists to be run more than once. Its value is almost entirely comparative: a single run tells you the current state, but a sequence of runs tells you whether the work is producing intelligence or producing volume.

That only works if the tests do not move. **The twenty questions in §7 are frozen.** Test ID `B2-13` refers to the same brand archetype, the same scenario, the same question and the same pass conditions in Build A, Build B and Build Z.

### 14.2 The rule that matters most

> **Do not change existing questions merely because Cosmisk performs badly on them.**

A test the system fails is doing its job. Rewriting it into something the system can pass converts a measurement instrument into a marketing document, and — worse — silently destroys every prior result, because the old scores now refer to a test that no longer exists.

This rule has one legitimate exception and it is narrow: if a test is discovered to be **incoherent** — internally contradictory, or dependent on data that never existed and never could — it is retired, not edited. Retirement is recorded explicitly:

```
B2-XX — RETIRED at Build <sha>. Reason: <why the test was invalid, not why it failed>.
No further results will be recorded under this ID. The ID is not reused.
```

### 14.3 Handling new capability

When Cosmisk gains a capability this benchmark does not cover, the response is **a new benchmark version, not an edit to v1.**

- v1 remains executable and comparable indefinitely.
- v2 contains v1's twenty tests unchanged, plus new ones with new IDs.
- A build is reported against a named version: "Build C, benchmark v2."
- Tests that become testable after being NOT CURRENTLY TESTABLE in v1 are **not new tests.** They keep their v1 ID and simply start producing results. B2-04, B2-06 and B2-11 are written in full precisely so they can be executed unchanged the day their dependency lands.

### 14.4 Build comparison

Compare at the dimension level, never at the total level.

| Question | How to answer it |
|---|---|
| Did the system get better? | Count 0→1 and 1→2 transitions per dimension across all tests. |
| Did it get worse anywhere? | Count 2→1 and 1→0 transitions. Any regression on D8 is treated as a stop-ship signal, not a score change. |
| Did the *kind* of failure change? | Compare which dimensions carry the 0s. Moving failures from D3 to D4 is progress even at an identical total. |
| Did coverage change? | Count NOT RUN — blocked tests. A build that unblocks two tests has delivered capability even if the newly-run tests fail. |

**A build that moves a test from NOT RUN to FAIL has made progress.** It has converted an unknown into a measurement. Do not report that as a regression.

### 14.5 Comparison hygiene

- Record the commit SHA for every run. A result without a SHA cannot be compared to anything.
- Prefer the same reviewer across builds. Where that is impossible, have the new reviewer re-score two or three outputs from the previous build first, to calibrate.
- Keep every raw output permanently. The recorded response *is* the evidence; the scores are one person's reading of it, and a later reader may reasonably disagree.
- Do not re-run a test on an old build to "check" a surprising result. Re-runs of an LLM produce different text. The recorded output is what was measured.

### 14.6 Expected first-run baseline

For the build this document was authored against, the expected result is: **most brand-aware tests fail, the control passes.** That is the correct outcome given §15, and it is the baseline. A first run that scores well should be treated as suspicious and re-examined for reviewers rewarding format over substance.

---

## 15. CURRENT CAPABILITY LIMITATIONS

Everything in this section was verified directly against `origin/main` @ `2ef777da`, not taken from a product document. Where a claim originates in the Batch 2 handoff it was re-checked against the code before being repeated here.

### 15.1 The central structural constraint

**No surface accepts a free-form question and has brand context.**

| Surface | Free-form question | Brand/website context | LLM |
|---|---|---|---|
| S-1 audit CLI | no — fixed prompt | yes (partial) | yes |
| S-2 `POST /ai/chat` | yes | **no** | yes |
| S-3 `POST /agent/watchdog/run` | no | no — seam returns `''` | yes |
| S-4 `GET /dashboard/insights` | no | no | **no** |

Verification: `git grep -il "brand"` across `apps/api/src/routes/ai/` returns nothing. The chat handlers are intent-routed to nine fixed handlers (`roas`, `spend`, `audience`, `creative`, `cpa`, `forecast`, `script`, `comparison`, `overview`) with no brand reference in any of them.

**Consequence for this benchmark.** The suite is split across the two rows of that table, and the split is forced by it rather than chosen. Under the §7.0.1 selection rule:

- **Seven tests run on S-2 in ASK mode** — B2-07, B2-09, B2-10, B2-14, B2-15, B2-16, B2-17 — because their pass conditions turn on performance evidence the chat handlers genuinely assemble. B2-18 inherits B2-17's surface; B2-19 applies to output from either.
- **Eleven tests remain on S-1 in RUN-AND-READ mode** — B2-01 through B2-06, B2-08, B2-11, B2-12, B2-13, B2-20 — because their pass conditions require website, catalog, ad-copy or brand-attribute evidence that never reaches `routes/ai/`. Three of those eleven (B2-04, B2-06, B2-11) are not runnable at all.

The line between the two groups is exactly the line in the table above. Every test that needs brand context is stranded on a surface that cannot be asked a question; every test that can be asked a question is answered without brand context.

**This is the single largest weakness in v1, and it is a property of the build, not of the test design.** It is also why B2-13 matters more than its score suggests: it is the strongest brand-aware test in the suite and it cannot be run on the surface founders use. When brand context reaches the chat handlers, most of the eleven convert to ASK unchanged — and the conversion, not any individual score, is the real measure of progress between v1 and v2.

### 15.2 No brand record is created for real users

`INSERT INTO brands` has zero matches across `apps/api/src`. Brand rows exist only from `apps/api/scripts/seed-brands.ts` (three fashion brands) and the hardcoded map in `apps/api/scripts/run-audit.ts`.

**Correction to the Batch 2 handoff §14.7,** which marks the `audit-agent` path unreachable because of this. That is true for end users. It is *not* true for developers: `run-audit.ts` maps `casorro` / `pratap-sons` / `salt-attire` directly to account IDs and bypasses the brands table entirely. This is the reason ten tests in this suite are executable at all. Without it the benchmark would have no runnable surface.

### 15.3 The brand context fields specified in Batch 2 do not exist

`git grep` for `price_positioning`, `core_promise` and `differentiators` across `apps/` returns zero matches.

The `brands` table (`apps/api/src/db/pg-schema.ts:1210`) carries: `id`, `name`, `domain`, `category`, `stage`, `meta_ad_account_id`, `pixel_id`, `user_id`, timestamps. The `brand_context` table (`:1223`) carries `price_point`, `target_audience`, `winning_patterns`, `failed_approaches` — with no `source`, `confidence`, `evidence` or `captured_at` metadata on any of them.

**Blocks:** B2-04, B2-11 entirely; weakens B2-02, B2-12, B2-14.

### 15.4 Extracted website fields are discarded before the prompt

`analyzeWebsite()` (`apps/api/src/audit/website-analysis.ts:16`) returns thirteen fields. `audit-agent.ts:355-364` passes six: price range, price point, product count, trust signals, `hasReviews`, `hasFreeShipping`.

Discarded: `headline`, `valueProposition`, `topCategories`, `categoryCount`, `hasSizeGuide`, `hasEasyReturns`.

**Blocks:** B2-08 (the catalog side of its comparison is invisible); weakens B2-01, B2-03.

This is the cleanest gap in the system — the data is already captured and simply does not travel. B2-08 exists specifically to measure it before and after.

### 15.5 Defaults are indistinguishable from observations

`getDefaultSnapshot()` (`website-analysis.ts:226`) returns a fully-formed snapshot with `pricePoint: 'mid'` whenever the fetch or parse fails. The failure is logged (`:50`) and then invisible: the return shape is identical to a successful parse, and nothing downstream can tell them apart.

**Consequence:** any test that reasons over pricing is silently invalid if the fetch failed. This is why §11.2 makes checking the analyser status mandatory pre-flight, and why B2-20 exists.

### 15.6 The intelligence injection seam is empty

`buildStrategicPromptSection()` (`apps/api/src/services/intelligence-integration.ts:40`) logs `'buildStrategicPromptSection stub — empty section'` and returns an empty string. Its only caller is `ad-watchdog/reasoning.ts:41`, which interpolates the empty result into the prompt.

**Consequence:** S-3 has no brand context by construction. Any test run against the watchdog path is testing metric reasoning only. No test in this suite targets S-3 for that reason.

### 15.7 No product-page content is captured

`analyzeWebsite()` fetches the homepage and `/collections/all`. Individual product pages are never fetched and no product body text is stored.

**Blocks:** B2-06 in every category, not only skincare. There is no product-side evidence against which an advertising claim could be checked.

### 15.8 No ad-to-SKU attribution

Ads are not linked to the specific products they promote. Product-to-creative reasoning is therefore possible only against catalog aggregates.

**Weakens:** B2-05, B2-12. Reviewers are instructed not to require SKU-level grounding.

### 15.9 No mock or fixture ad data

All ad data requires a live Meta connection. There is no seeded account, campaign or creative data anywhere in the repository, and no demo mode for the audit path.

**Consequences:**
- The benchmark cannot be run in CI or on a clean checkout.
- Test conditions drift as the underlying accounts change. Two runs a month apart are not strictly comparable even on the same commit.
- The archetypes that need a specific kind of account (AR-2, AR-3) cannot be constructed; they can only be waited for.

**This is the highest-leverage gap for the benchmark itself.** A fixture dataset would make every test deterministic, CI-runnable and genuinely comparable across builds. It is out of scope for this document but should be considered before the benchmark is run more than twice.

### 15.10 No raw-output capture harness

Nothing in the repository records assembled prompts or raw LLM responses for later inspection. `saveAudit()` persists `full_output` to the `audits` table, which preserves the *result* but not the prompt that produced it.

**Consequence:** field 6 of the developer record ("DATA / EVIDENCE USED, if observable") will frequently be "not observable" unless a developer adds temporary local logging. That is acceptable — the field is explicitly conditional — but it limits the ability to distinguish "the model ignored the evidence" from "the evidence never reached the model." Those two failures need completely different fixes, and the benchmark cannot currently tell them apart.

### 15.11 Summary

| Limitation | Blocks | Weakens |
|---|---|---|
| No brand-aware question surface | B2-13 on S-2 | the eleven S-1 tests (§15.1) |
| No ad copy on the chat surface | B2-03, B2-04, B2-06 on S-2 | B2-09, B2-10 |
| No brand record for real users | — | reachability realism |
| BC fields do not exist | B2-04, B2-11 | B2-02, B2-12, B2-14 |
| Website fields discarded | B2-08 | B2-01, B2-03 |
| Defaults indistinguishable | — | B2-12, B2-20 (by design) |
| Injection seam empty | S-3 entirely | — |
| No product-page content | B2-06 | B2-05 |
| No ad-to-SKU link | — | B2-05, B2-12 |
| No fixture data | AR-2, AR-3 | comparability of all runs |
| No prompt/response capture | — | diagnosis of every failure |

Three tests cannot run. Seven run in weakened form. Ten run as specified. That distribution is the honest current state, and stating it here is what allows a bad first result to be interpreted correctly rather than treated as a verdict on the model.

---

## 16. DEFINITION OF A MEANINGFUL FAILURE

### 16.1 The governing question

For every recorded output, the reviewer asks:

> **Could this answer have been written without reading this specific account?**

If the answer is **YES**, the output is flagged **MAJOR INTELLIGENCE FAILURE.**

This is not one score among eight. It is a separate binary judgement that sits above the rubric, because an output that passes it can be improved and an output that fails it cannot — there is nothing there to improve.

### 16.2 Why sophistication makes this worse, not better

> This is **particularly important when an answer sounds sophisticated but could apply to almost any business.**

The dangerous failure is not the obviously vague answer. It is the one that is well-structured, uses correct terminology, cites plausible-sounding mechanisms, reads as though written by someone competent — and contains nothing that required this account to exist.

Fluency is the default output of a language model. It costs nothing to produce and it is the property reviewers most reliably mistake for intelligence. An answer that discusses creative fatigue, audience saturation, incrementality and budget efficiency in confident, correct language, without naming a single ad, is a total failure wearing the costume of a strong result.

**The heuristic:** if you could delete the brand name and the currency figures and hand the output to a competitor with no edits, it is a MAJOR INTELLIGENCE FAILURE regardless of how it reads.

### 16.3 The four failure classes

**Class 1 — Generic advice.** True of the category, not of this account. Would apply unchanged to any competitor. Detected by the governing question, and confirmed by the cross-brand test (§8).

**Class 2 — Mirror finding.** Brand context restated back as though it were a discovery. "As a mid-priced fashion brand with strong trust signals, you should emphasise quality and reassurance." Every element came from the input. Nothing was reasoned. This is the most common failure in brand-aware systems and the hardest to spot, because it *is* brand-specific — it is just not a finding. Scored 0 on D3.

**Class 3 — Unsupported claim.** An assertion about the brand, its customers or its market that no available data supports. Distinguished from Class 1 by being confidently specific rather than vague. Scored 0 on D8. **A fabricated specific is worse than a generic truth**, because it is actionable and wrong. An output that names a trust signal the site does not have will cost the founder real money.

**Class 4 — Threshold masquerading as reasoning.** A finding produced by a conditional rather than by inference — `if (positioning === 'premium' && discountRatio > 0.5)`. The output text may be excellent. It is still a failure, because it will fire identically for every account that crosses the threshold and never fire for an account that has the same problem at 0.45. Detected by running the same test across accounts and observing whether the finding appears in lockstep with a boundary.

### 16.4 What is *not* a meaningful failure

Do not record these as intelligence failures:

- **Output that is correct but boring.** A correctly-evidenced, well-grounded, unexciting finding is a pass. Novelty is not a scored dimension.
- **A correct refusal.** See §9. This is a pass, frequently a strong one.
- **Failure caused by a documented data gap.** B2-08 failing because `topCategories` never reached the prompt is a *capability* gap, recorded as such. It is not evidence the reasoning is weak. §15 exists so these are attributed correctly.
- **Different wording between runs.** Only a different *subject* or a different *recommended action* counts as a material difference.
- **A test that could not run.** NOT RUN is not FAIL. Conflating them makes a build look worse than it is and hides which problem needs solving.

### 16.5 Escalation

A MAJOR INTELLIGENCE FAILURE on **B2-17** (cross-brand) or **B2-18** (transplant) is more serious than the same flag on any single-output test. Those two tests are structural: failing them means the system does not discriminate between brands at all, which invalidates every apparently-good result elsewhere in the run.

If either fails, report it first, before the score tables.

---

## 17. DEFINITION OF A MEANINGFUL PASS

### 17.1 The bar

An output passes when it satisfies the chain in §4 end to end:

```
BRAND CONTEXT + OWN ACCOUNT EVIDENCE → REASONING → BRAND-SPECIFIC FINDING → EVIDENCE → USEFUL ACTION
```

Concretely, all five must hold:

1. **It could not have been written about another account.** The inverse of §16.1.
2. **Every claim is traceable.** Facts to metrics or quoted creatives; inferences to the facts they rest on; recommendations to a stated inference.
3. **The brand context is load-bearing.** Remove it and the conclusion no longer follows. Not merely present — required.
4. **The reasoning joins independent evidence.** A conclusion that needed two things neither of which implies it alone.
5. **The action is executable within 48 hours.** What to change, where, and roughly how much — with no follow-up question needed.

### 17.2 What a pass is not

- **Not a good-looking answer.** Structure, tone and vocabulary are free.
- **Not a correct answer that could have been guessed.** Being right by category prior is not intelligence.
- **Not a comprehensive answer.** Breadth is often the opposite of a finding. One specific, evidenced, actionable point outranks eight general observations, and reviewers should score the eight-point answer lower, not higher.
- **Not a confident answer.** Confidence is only a virtue when the evidence supports it; see D7.

### 17.3 The minimum meaningful pass

A single finding that satisfies all five criteria in 17.1 is a pass, even if the rest of the output is filler. Cosmisk does not need to produce a comprehensive report. It needs to produce **one thing a founder did not already know, could not have got from the Meta dashboard, and can act on.**

That is the entire product thesis, and it is the smallest unit this benchmark is designed to detect.

### 17.4 Suite-level pass

There is no threshold count of passing tests that constitutes "passing the benchmark," and none should be invented. Report instead:

- Which tests passed, with the passing finding quoted.
- Whether B2-17 and B2-18 passed — the structural tests.
- Whether the control B2-07 passed, which separates a brand-layer problem from a reasoning problem.
- Which failures are capability gaps (§15) and which are reasoning failures.
- Movement against the previous build, per dimension.

### 17.5 The one-line version

> **A pass is an output a founder would keep. A failure is an output a founder would recognise as something they could have got from ChatGPT without connecting their ad account.**

---

## APPENDIX — VERSION AND PROVENANCE

**Version:** v1. Frozen on first execution.
**Authored against:** `origin/main` @ `2ef777da`, `apps/api/**`.
**Verification method:** every capability claim in §15 was checked directly against the source tree at that commit. Claims originating in the Batch 2 handoff were re-verified rather than repeated.
**Known correction to the Batch 2 handoff:** §14.7 of that document marks the `audit-agent` reasoning path unreachable due to the absence of brand records. It is unreachable to end users but reachable to developers via `apps/api/scripts/run-audit.ts`, which bypasses the brands table through a hardcoded brand map. See §15.2.
**Tests:** 20. Currently testable 10 · partially testable 7 · not currently testable 3.
**Scope:** testing framework only. This document specifies no implementation, schema, migration or code change.
