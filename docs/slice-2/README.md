# COSMISK — BATCH 2 — FINAL PRODUCT + UX + DEVELOPER HANDOFF

**Brand Understanding as an Intelligence Layer**

Status: final. This supersedes the Batch 2 discovery audit and the Batch 2 draft specification.
All technical claims were read from `origin/main` @ `2ef777da` via a read-only extraction.
Nothing was implemented, modified, committed or pushed.

---

## 1. EXECUTIVE SUMMARY

Cosmisk collects a website URL during onboarding and never reads it. It contains a regex website
analyser that is unreachable from signup. It contains a working LLM website analyser that is
commented out. It contains a purpose-built seam for injecting brand context into the reasoning
prompt, and that seam returns an empty string.

Batch 2 closes that loop: derive a small, defensible set of facts about the brand, let the user
correct them, persist them with provenance, and put them in front of the reasoning step alongside
the brand's own account and creative data — so that Cosmisk produces a finding it could not have
produced from the account numbers alone.

**Five established facts.** These were verified in the current tree, not assumed.

| # | Fact | Evidence |
|---|---|---|
| F-1 | **No brand record is ever created for a real user.** `INSERT INTO brands` has zero matches across `apps/api/src`. Rows exist only from `scripts/seed-brands.ts` ("Re-seed the 3 brands lost in the Railway sacrifice"). | grep, `apps/api/scripts/seed-brands.ts` |
| F-2 | **`/onboarding/scan` does not scan.** It is a bare `UPDATE users SET brand_name = ?, website_url = ?`. The frontend constant `ONBOARD_SCAN` is defined and invoked from nowhere. | `boot/account-routes.ts:40-52`, `environments/environment.ts:18` |
| F-3 | **A working LLM website analyser exists, commented out.** `POST /analyze-url` used `llmGateway` + `claude-haiku-4-5` over 15,000 chars of HTML to extract brand_name, product_name, product_description, target_audience, key_features, price, images — with a cache table. Disabled because "URL hero removed from UI". | `routes/creative-studio.ts:42-110`, `dev_reports/ai_serv/creative/DISCONNECTED_TS_MODULES.md` |
| F-4 | **The live regex analyser discards the meaning fields.** `analyzeWebsite()` returns 13 fields; only 6 reach a prompt. `headline`, `valueProposition` and `topCategories` — the only fields carrying positioning — appear nowhere in `audit-agent.ts`. | `audit/website-analysis.ts`, `audit/audit-agent.ts:356-366`, grep |
| F-5 | **The injection seam is built and empty.** `buildStrategicPromptSection()` returns `''`. It is interpolated into the Watchdog prompt at the exact right place and contributes nothing. | `services/intelligence-integration.ts:34-113`, `services/ad-watchdog/reasoning.ts:38-92` |

**The consequence.** Every finding Cosmisk currently produces is derived from numbers alone. It can
say a campaign's ROAS fell. It cannot say why that matters *for this brand*. Batch 2 is the
smallest change that makes the second sentence possible.

**The success test is not "context was extracted".** It is DoD-14 — §8 — *does the presence of
brand context produce a materially more specific finding than the account data alone?* Every other
deliverable in this document is scaffolding for that one property.

---

## 2. PROBLEM BEING SOLVED

**Product problem.** Cosmisk's outputs read like a dashboard with sentences. They describe movement
in metrics. A founder can already see movement in metrics — Meta shows it, GA shows it, Shopify
shows it. What no dashboard shows is the *interpretation*: whether the movement is consistent with
what this brand is trying to be.

Two brands can post identical numbers and require opposite advice:

- A discount-led fashion brand running heavy promotional creative at a 2.1 ROAS is executing its
  strategy correctly.
- A premium clinical skincare brand running heavy promotional creative at the same 2.1 ROAS is
  buying revenue at the cost of the positioning it charges a premium for.

The numbers are identical. The finding is not. Cosmisk today cannot tell these apart, because it
has never been told which brand it is looking at.

**System problem.** The capability is not missing — it is disconnected in four separate places, and
each disconnection is individually invisible:

1. The URL is captured and stored on `users`, and nothing reads it.
2. The analyser that could read it keys off `brands`, and nothing writes `brands`.
3. The analyser that would read it *well* is commented out.
4. The prompt seam that would consume the result returns `''`.

Any one of these can be fixed while the product still changes nothing. That is the defining risk of
this batch (R-9) and the reason D-1 must be answered before scheduling.

---

## 3. PRODUCT GOAL

> Make Cosmisk understand a specific brand well enough to interpret that brand's own marketing and
> account data in context, and produce a more specific, evidence-backed finding as a result.

The flow:

```
Brand Context  +  Own Account / Marketing Data
                 │
                 ▼
          Cosmisk Reasoning
                 │
                 ▼
      Brand-Specific Finding
                 │
                 ▼
      Evidence / Explanation
                 │
                 ▼
              Action
```

**What "understand" means here.** Not a brand profile. Not a persona document. Not a generic
marketing questionnaire. It means: a small set of statements about the brand that are specific
enough to *contradict* something in the account data. If a brand context field cannot participate
in a contradiction, it does not belong in Batch 2.

**What success feels like to the user.** One sentence:

> *"Cosmisk understood something about my business, and that understanding changed the quality of
> the analysis."*

Not *"Cosmisk filled in a form about my business."*

---

## 4. WHAT BATCH 2 IS

The locked scope is eight items. They map to seven implementation capabilities, N-1 through N-7.

| # | Locked scope item | Capability |
|---|---|---|
| 1 | Establish a usable brand record | **N-1** |
| 2 | Derive minimum useful brand context from website / business information | **N-2** |
| 3 | Persist that context | **N-3** |
| 4 | Store appropriate provenance and confidence | **N-3** (schema) + **N-4** |
| 5 | Allow the user to review and correct important context | **N-5** |
| 6 | Make approved brand context available to the existing reasoning flow | **N-6** |
| 7 | Make relevant ad / message context available alongside the brand context | **N-7** |
| 8 | Demonstrate that brand context materially improves the resulting finding | **DoD-14 / §8** |

### 4.1 Capability definitions

- **N-1 — Brand record creation.** A real signup produces a `brands` row owned by the user. This is
  the keystone. Nothing else in the batch is reachable without it (F-1).
- **N-2 — Context derivation.** Given a website URL, produce BC-1..BC-5 (§6) with evidence and
  confidence. The reference implementation already exists (F-3).
- **N-3 — Persistence.** Store the derived context with its provenance metadata, owned by the brand,
  owned by the user.
- **N-4 — Provenance and confidence surfaced.** Every field carries where it came from and how
  certain it is, and that survives to the UI and to the prompt.
- **N-5 — Review and correction.** The user can see and change the fields that matter, and the
  correction is durable and marked as user-authored.
- **N-6 — Context reaches reasoning.** The approved context is present in the assembled prompt of
  whichever path D-1 selects.
- **N-7 — Ad / message context reaches reasoning alongside it.** Creative copy is already handled in
  `audit-agent.ts:426,430`; it is absent from the Watchdog path. Whichever path D-1 selects must
  carry both.

### 4.2 Dependency graph

```
N-1 ──► N-2 ──► N-3 ──► N-5 ──► N-6 ──┐
                 │                     ├──► DoD-14
                 └──► N-4              │
                          N-7 ─────────┘
```

**Warning.** N-1, N-2 and N-3 together form a complete-looking increment that delivers no user
value and no product change. Do not ship them as a milestone and call the batch half-done. The
batch has one outcome, and it is on the right-hand side of that graph.

---

## 5. WHAT BATCH 2 IS NOT

Explicitly out of scope. This is an **exclusion list, not a deferral list** — do not add extension
points, configuration hooks, or abstractions in anticipation of any of it.

| Excluded | Why |
|---|---|
| Google Trends, market trend dashboards | External market intelligence is future scope. Batch 2 is the brand's *own* data interpreted in the brand's *own* context. |
| Social listening | Same. Also a data-acquisition problem, not a reasoning problem. |
| Autonomous research agents | Unbounded cost, unbounded latency, unverifiable output. |
| Competitor intelligence systems / Competitor Spy | Override 2. `competitor-creative-intel/` may be read as prior art; it may not be activated. |
| Learning loops, outcome feedback, prediction verification | Override 1. Not built, and must not be presented as built. |
| Brand customisation / theming / tone-of-voice settings | Cosmetic. Does not participate in a contradiction (§3). |
| Unrelated dashboard work | `GET /dashboard/insights` is threshold-rule code with no LLM. Rewriting it is its own batch. |
| Unrelated onboarding redesign | Batch 2 adds one review step. It does not restructure onboarding. |
| New intelligence categories | The capability is brand-aware reasoning, not a catalogue of detectors (§7.2). |
| A large manual brand questionnaire | Explicitly rejected in the brief. Derivation first, correction second. |
| `brand_brain.py` / creative generation | Different concern — creative production, not analysis. Out of scope. |
| Fixing the `Brand` type / `brands` table mismatch beyond what N-1 needs | Raised as D-5. Not resolved here. |

---

## 6. BRAND CONTEXT MODEL

Five fields. Nine candidates were considered and excluded. The test for inclusion was §3: *can this
field contradict something in the account data?*

### 6.1 The five fields

**BC-1 — `what_they_sell`**
- *What it is:* the product category and the specific products, in the brand's own words.
- *Why it earns its place:* without it, every creative-level observation is anonymous.
- *Source:* website — product listings, meta description, `topCategories`.
- *Typical confidence:* high.
- *Failure mode:* a marketplace or multi-category store yields a uselessly broad answer.
- *User-correctable:* yes.
- *Contradiction it enables:* spend concentrated on a product line the brand does not consider core.

**BC-2 — `price_positioning`**
- *What it is:* where the brand sits on price relative to its category — and the observed price
  range that justifies the claim.
- *Why it earns its place:* it is the single field that most often flips the interpretation of a
  discount or a ROAS number.
- *Source:* website product prices; the existing `determinePricePoint()` thresholds (500 / 1500 /
  5000) are INR-only and are a starting point, not an answer.
- *Typical confidence:* medium. High only when a real price range was observed.
- *Failure mode:* **`getDefaultSnapshot()` returns `pricePoint: 'mid'` on any fetch failure.** That
  is a fabricated fact with no evidence behind it. See §11 B1 SYSTEM BEHAVIOUR and DoD-13.
- *User-correctable:* yes.
- *Contradiction it enables:* premium positioning vs. discount-led creative.

**BC-3 — `core_promise`**
- *What it is:* the primary claim the brand makes — what it says it does for the customer.
- *Why it earns its place:* it is the reference against which ad messaging is judged.
- *Source:* website headline, hero copy, value proposition. Note that the live regex analyser
  captures `headline` and `valueProposition` **and then discards them** (F-4).
- *Typical confidence:* medium — hero copy is often marketing filler.
- *Failure mode:* the regex patterns match only `hero`, `tagline`, `subtitle` class names.
- *User-correctable:* yes — this is the field users most often need to fix.
- *Contradiction it enables:* the promise the site makes vs. the promise the ads make.

**BC-4 — `differentiators`**
- *What it is:* the specific reasons the brand claims to be different — ingredients, process,
  certification, guarantee, origin.
- *Why it earns its place:* it is the highest-signal input for "what should the ads be saying and
  are not".
- *Source:* website — feature lists, trust signals, about copy.
- *Typical confidence:* medium-low.
- *Failure mode:* generic claims ("premium quality") that differentiate nothing. These should be
  dropped, not stored.
- *User-correctable:* yes.
- *Contradiction it enables:* a stated differentiator absent from every ad.

**BC-5 — `target_audience`**
- *What it is:* who the brand says it is for.
- *Why it earns its place:* it is the bridge between brand context and targeting/creative data.
- *Source:* website copy; the commented-out `/analyze-url` already extracted this field explicitly.
- *Typical confidence:* low from a website alone. This is the field most in need of correction.
- *Failure mode:* the LLM invents a plausible demographic. Low confidence must be honest, and an
  invented audience is worse than an absent one.
- *User-correctable:* yes.
- *Contradiction it enables:* stated audience vs. the audience the spend actually reaches.

### 6.2 Mandatory metadata — every field, no exceptions

| Attribute | Meaning | Rule |
|---|---|---|
| `source` | `website` · `user` · `default` | `default` is not a source of truth. A `default` value must never be presented as a fact and must never be used as evidence. |
| `confidence` | `high` · `medium` · `low` | Derived from evidence quality, not from model self-report. |
| `evidence` | the literal text or observation the value came from | If a field has no evidence, it has no business being stored. |
| `captured_at` | timestamp | Websites change. A stale context is a known-quality problem, not an unknown one. |
| `corrected_by_user` | boolean | A user correction outranks any derived value permanently and is never silently overwritten by a re-scan. |

### 6.3 Excluded candidates and why

`brand_personality`, `tone_of_voice`, `competitors`, `founding_story`, `social_proof_claims`,
`shipping_and_returns_policy`, `seasonality`, `customer_lifetime_value`, `channel_mix`.

Each fails at least one of: cannot contradict account data; not derivable from a website with
defensible confidence; already covered by another field; belongs to a deferred batch. Note that
`differentiator`, `target_user`, `biggest_problem`, `social_proof`, `selling_proposition` and
`credibility_point` are already present as **empty strings** in the onboarding payload
(`onboarding.component.ts:323-347`) — the shape exists and has never carried a value. Do not treat
that payload as a specification.

---

## 7. BRAND-AWARE INTELLIGENCE MODEL

### 7.1 What changes in the reasoning step

Today the prompt contains an account snapshot and campaign metrics. After Batch 2 it contains the
account snapshot, the campaign metrics, **the brand context with provenance**, and **the ad/message
context** — and the instruction to interpret the first two in light of the third and fourth.

That is the entire mechanism. There is no new detector, no new service, no new intelligence
category.

### 7.2 Reason, do not detect — the guardrail

> Do not turn this into a fixed list of: positioning mismatch detector, messaging mismatch detector,
> product opportunity detector, pricing detector, audience detector.

The moment brand-aware reasoning is decomposed into named detectors, three things happen: the
system can only find what someone anticipated; the detectors accumulate as permanent maintenance;
and outputs become templated, which is exactly the anti-pattern Cosmisk exists to avoid.

**The underlying capability is brand-aware reasoning.** The illustrative examples in §12 are
examples of what the reasoning might produce. They are not a specification of what to implement,
and none of them may be hard-coded.

**Concretely:** if a developer writes `if (brand.price_positioning === 'premium' && discountAdRatio > 0.5)`,
the batch has failed its own guardrail regardless of how good the output looks.

### 7.3 The prompt is the deliverable

Because the mechanism is prompt-level, the assembled prompt string is the artifact under test. It
must be capturable and assertable. DoD-6 and DoD-7 are satisfied by asserting on the prompt, not by
asserting that a function returned a non-empty value.

### 7.4 Known failure mode — mirror findings

The most likely bad output is a finding that restates the brand context back to the user:

> *"Your brand is positioned as premium skincare focused on barrier repair."*

That is a summary of the input, not a finding. It contains no account data, would be identical for
any account attached to that website, and fails the governing test. §8's V-1 test exists
specifically to catch this class of output, and §13 requires that every finding cite at least one
account-derived fact and at least one brand-context fact.

---

## 8. INCREMENTAL REASONING VALUE

**This is the hard product requirement of Batch 2.**

### 8.1 What does not count as success

Batch 2 is **not** successful merely because:

- a website was scraped
- brand fields were extracted
- a brand record was created
- context was persisted
- context was inserted into an LLM prompt

Those are implementation steps. All five can be true while the product is unchanged.

### 8.2 The actual test

> **Does the presence of Brand Context allow Cosmisk to produce a materially more specific and
> useful finding than it could produce from the account data alone?**

### 8.3 Illustrative example — and its constraints

A brand positioned as premium skincare, whose core promise is barrier repair, is spending most of
its budget on discount-led creative. The brand-aware finding is a messaging tension between what
the brand charges a premium to be and what its highest-spend ads actually say.

Three constraints on this example:

1. **It is illustrative only.** It is not a requirement and not a target output.
2. **Do not fabricate real customer data** to demonstrate it.
3. **Do not hard-code this detector.** The system must reason from available evidence (§7.2).

### 8.4 The observable test — three assertions

**V-1 — Ablation.** Run the same account twice: once with brand context present, once with it
absent. The findings must differ materially. If they are the same, the context is decorative and
DoD-14 fails.

**V-2 — Differential.** Hold the account metrics constant and vary only the brand context. The
findings must diverge. This proves the reasoning is reading the context rather than reciting it.

**V-3 — Transplant.** Take a produced finding, attach it to a different brand's context, and assert
it no longer holds. This is the operational form of the Slice 1 governing test — *if an output could
have been written without reading this specific account, it does not ship* — extended to the brand.

### 8.5 How to run these honestly

- Same account data, same model, same seed conditions. Only the context varies.
- "Materially different" means a different subject or a different recommended action — not different
  wording of the same claim.
- The comparison must be recorded, with both outputs, so the result is reviewable rather than
  asserted.

### 8.6 If the test fails

Report the negative result. Do not relax the criterion, do not add a detector to force a difference,
and do not adjust the prompt until the test passes by construction. A failing V-1 means brand
context does not yet change the reasoning — that is a real finding about the product and is more
valuable than a green checkbox. Escalate it as a product decision.

---

## 9. USER JOURNEY

The required shape:

```
DISCOVER → UNDERSTAND → REVIEW / CORRECT → PERSIST → USE IN INTELLIGENCE
```

| Stage | What happens | What the user does | What the user must believe |
|---|---|---|---|
| **Discover** | The URL already collected in onboarding is actually fetched. | Nothing new — the URL is already captured. | "It's reading my site." |
| **Understand** | BC-1..BC-5 derived with evidence and confidence. | Waits. Bounded, honest progress copy. | "It's working out what I sell." |
| **Review / Correct** | The five fields are shown with what they were derived from. | Confirms, or corrects the ones that are wrong. | "It got most of this right, and I can fix the rest." |
| **Persist** | Confirmed context is stored, user corrections marked. | Continues. | "It will remember this." |
| **Use in intelligence** | The finding names the brand context it used. | Reads a finding that could only be about them. | *"Cosmisk understood something about my business, and that understanding changed the analysis."* |

**Constraints on the journey:**

- **No large manual questionnaire.** Derivation first. The user's job is correction, not data entry.
- **No screens that exist to look complete.** Two screens is the budget, and each is justified below.
- **The last stage is the point.** The first four stages are worthless without it, which is why the
  UX is deliberately small — the effort belongs in §8, not in the interface.

---

## 10. FINAL UI/UX FLOW

**Two new screens and one modification.** Nothing else.

| ID | Surface | Type | Justification |
|---|---|---|---|
| **B1** | Onboarding — Brand Understanding review | New screen | The correction step is load-bearing. Without it, low-confidence derived values (BC-5 especially) become silent fabrications that poison every downstream finding. This screen is what makes the confidence model honest. |
| **B2** | Settings — Brand Context | New screen | Context goes stale, businesses change, and a user who cannot revisit a correction will not trust the first one. Also the only place a user can see what Cosmisk believes about them. |
| **M1** | First Aha / finding card — brand context attribution | Modification | The finding must show *which* brand context it used. Without this, DoD-14 is unobservable to the user and the product's core claim is invisible. |

**Flow:**

```
Signup → Onboarding (existing) → [URL captured]
                                        │
                                        ▼
                              Derivation (background)
                                        │
                                        ▼
                              ┌──── B1 Review ────┐
                              │  confirm / correct │
                              └────────┬───────────┘
                                       ▼
                                 Persist context
                                       ▼
                            Connect Meta (existing)
                                       ▼
                            Analysis (existing path, D-1)
                                       ▼
                              M1 Finding + attribution

Settings ──► B2 Brand Context (view / edit / re-derive)
```

**What is not added:** no competitor step (Override 2), no brand-personality step, no
tone-of-voice step, no separate "brand profile" section, no progress gamification.

---

## 11. SCREEN SPECIFICATIONS

### B1 — Onboarding: Brand Understanding review

| Element | Specification |
|---|---|
| **Screen name** | Brand Understanding — review |
| **Purpose** | Convert derived, uncertain values into confirmed, owned context before anything is reasoned from them. |
| **User goal** | Check that Cosmisk read the site correctly and fix what it got wrong — in under a minute. |
| **Cosmisk goal** | Obtain BC-1..BC-5 with honest provenance, and mark corrections as user-authored. |
| **Content hierarchy** | 1. What we read from your site (the URL, visible). 2. The five fields, each with its derived value, its confidence, and the evidence it came from. 3. Inline edit on each. 4. Primary CTA. |
| **Important copy** | Heading: *"Here's what we understood about your brand."* Sub: *"We read your website. Correct anything that's wrong — this shapes every analysis we run."* Per-field evidence label: *"From your site:"* followed by the literal text. Low-confidence label: *"We weren't sure about this."* Never: "We learned", "We know", "Your brand profile is complete." |
| **Primary CTA** | **Confirm and continue** |
| **Secondary actions** | Edit any field inline · *"Skip for now"* (proceeds with an explicitly unconfirmed context — see below) |
| **Editable vs non-editable** | Editable: all five BC fields. Non-editable: the evidence text, the confidence label, the source URL, `captured_at`. The user corrects conclusions, not the record of what was observed. |
| **Loading state** | Bounded and honest: *"Reading yourdomain.com"* → *"Working out what you sell and who buys it"*. No fake percentage. If derivation exceeds the timeout, fall through to the error state rather than spinning. |
| **Error state** | Website could not be read: *"We couldn't read your website."* Show the five fields **empty**, not pre-filled. Offer: retry, enter a different URL, or fill in manually. **Do not show `pricePoint: 'mid'`.** |
| **Empty / insufficient-data state** | Site readable but a field underivable: leave that field blank and label it *"We couldn't work this out from your site."* Blank is an acceptable, honest state. A guessed value is not. |
| **Next step** | Connect Meta (existing onboarding step). |

> **SYSTEM BEHAVIOUR — MANDATORY**
>
> `analyzeWebsite()` catches every failure and returns `getDefaultSnapshot(domain)`, which contains
> `pricePoint: 'mid'` and empty arrays. **That value is indistinguishable from a real result at the
> call site.** If B1 renders it, the user will confirm a fabricated fact, it will be marked
> `corrected_by_user: false, source: website`, and it will be cited as evidence in findings.
>
> Any implementation must be able to distinguish *"analysis failed"* from *"analysis succeeded and
> the answer is mid"*. This is DoD-13 and it is not optional.

**"Skip for now"** stores the derived context with `confirmed: false`. Unconfirmed context may be
used in reasoning **only** if the finding's evidence block states it was not confirmed. Whether skip
should exist at all is D-4.

---

### B2 — Settings: Brand Context

| Element | Specification |
|---|---|
| **Screen name** | Brand Context |
| **Purpose** | Let the user see and change what Cosmisk believes about their brand, at any time. |
| **User goal** | Correct something that is now wrong, or check why a finding said what it said. |
| **Cosmisk goal** | Keep context accurate over time; capture corrections as the highest-authority source. |
| **Content hierarchy** | 1. The five fields with current values, source, confidence, and last-updated. 2. Edit controls. 3. Re-read website action. 4. The source URL. |
| **Important copy** | Heading: *"What Cosmisk understands about your brand"*. Per-field source labels: *"You set this"* / *"From your website"* / *"Not set"*. Re-read confirmation: *"Re-reading your site won't overwrite anything you've corrected."* |
| **Primary CTA** | **Save changes** |
| **Secondary actions** | Re-read website · Revert a field to the derived value · Clear a field |
| **Editable vs non-editable** | Editable: the five BC fields. Non-editable: source, confidence, timestamps, evidence. Editing a field sets `source: user`, `confidence: high`, `corrected_by_user: true`. |
| **Loading state** | Standard settings load. Re-read shows the same bounded copy as B1. |
| **Error state** | Save failure: preserve the user's input, state the failure plainly, offer retry. Never discard typed input. Re-read failure: leave existing context untouched and say the site could not be read. |
| **Empty / insufficient-data state** | No context yet (e.g. derivation failed at onboarding): show the empty fields with *"Cosmisk hasn't worked this out yet"* and offer both re-read and manual entry. |
| **Next step** | Return to dashboard. Saved corrections apply to the next analysis run — and the copy must say *next* run, not "updating your insights". |

> **RULE — user corrections are permanent.** A re-read may fill blank fields and may update fields
> with `source: website`. It must **never** overwrite a field with `corrected_by_user: true`. This
> is DoD-5 and a re-read must be safe to run at any time.

---

### M1 — Finding card: brand context attribution (modification)

| Element | Specification |
|---|---|
| **Screen name** | First Aha / finding card — existing screen, modified |
| **Purpose** | Make the use of brand context visible, so the product's core claim is observable to the user. |
| **User goal** | Understand why this finding is about *their* business and not a generic observation. |
| **Cosmisk goal** | Make DoD-14 user-observable, and make an unfounded finding obvious rather than plausible. |
| **Content hierarchy** | Existing finding content, unchanged. Then, within the existing evidence block: the brand context used, quoted with its source. |
| **Important copy** | Label: *"Based on what we understand about your brand:"* followed by the specific field(s) used and their values. If context was unconfirmed: *"You haven't confirmed this yet."* with a link to B2. |
| **Primary CTA** | Unchanged — the existing action. |
| **Secondary actions** | *"Correct this"* → B2. |
| **Editable vs non-editable** | Nothing editable inline. Corrections go to B2. |
| **Loading state** | Unchanged. |
| **Error state** | Unchanged. |
| **Empty / insufficient-data state** | If no brand context was used, the block does not render — no placeholder, no "no brand context available" message. A finding without brand context is still a valid finding; it simply is not a brand-aware one. |
| **Next step** | Unchanged. |

> **Constraints.** Override 1 applies in full: this block must not imply Cosmisk *learned* the
> context, that it is tracking an outcome, or that a baseline was captured. X5's actioned-state copy
> is locked and must not be extended to claim brand context improved anything. At most one loop
> stage — *Action recorded* — may render as complete.

---

## 12. EXAMPLE OUTPUTS

**All three are illustrative.** They use invented data. They are not targets, not templates, and
must not be hard-coded (§7.2). They exist to show the required *shape*: fact / inference /
recommendation kept separate, both data sources present, and a stated check.

### 12.1 Skincare — messaging tension

> **FACT.** 68% of your last-30-day spend (₹4.1L of ₹6.0L) ran on four creatives whose primary text
> leads with a discount ("FLAT 40% OFF", "LOWEST PRICE EVER"). Those four have a blended ROAS of
> 2.3. The two creatives leading with barrier-repair claims took ₹0.9L at a ROAS of 3.1.
>
> **INFERENCE.** Your site's core promise is barrier repair and your observed price range
> (₹1,450–₹3,200) places you above category median. The majority of your spend is therefore
> teaching new customers to buy on price, while your better-performing creative is the one that
> matches your positioning. The spend split appears to be inherited rather than chosen.
>
> **RECOMMENDATION.** Before scaling further, shift a defined share of budget from the discount set
> to the barrier-repair set and compare. This is a reallocation test, not a rewrite.

*V-1 check:* without BC-2 (`price_positioning: premium`) and BC-3 (`core_promise: barrier repair`),
this reduces to "your discount ads have lower ROAS" — a dashboard observation. The context is what
makes it a finding.

### 12.2 Fashion — the same numbers, the opposite reading

> **FACT.** 71% of spend ran on discount-led creative at a blended ROAS of 2.2.
>
> **INFERENCE.** Your stated positioning is accessible everyday wear at ₹400–₹1,100, and discounting
> is a normal acquisition mechanic in that position. The spend split is consistent with your
> strategy. The question is not whether to discount but whether the discount depth is necessary.
>
> **RECOMMENDATION.** Test a shallower discount on your highest-spend creative before changing the
> message.

*V-2 check:* 12.1 and 12.2 are built on deliberately similar metrics. The findings diverge because
BC-2 and BC-3 differ. If an implementation produces the same finding for both, V-2 has failed.

### 12.3 Furniture — insufficient evidence

> **There is not enough evidence to conclude anything about your creative messaging.**
>
> **FACT.** Your account has 6 active creatives; 4 have fewer than 40 conversions in the window.
>
> **What is missing.** We could not read a clear promise from your website — the pages we fetched
> were largely images — so we have no positioning to compare your ads against.
>
> **What would help.** Confirm your core promise in Brand Context, or let the account run until the
> lower-volume creatives reach a readable sample.

*Required behaviour.* This is DoD-11 and it is not a degraded output — it is a correct one. The
alternative, a confident finding built on four low-volume creatives and an unread website, is the
failure mode. See §13.3.

---

## 13. EVIDENCE / TRUST MODEL

### 13.1 The three labels

| Label | Definition | Rule |
|---|---|---|
| **FACT** | Something observed, with a source and a number or a quote. | Must be traceable to account data or to brand context evidence. No adjectives. |
| **INFERENCE** | An interpretation connecting facts. | Must name the facts it rests on. Must be phrased as interpretation ("appears", "is consistent with"), not certainty. |
| **RECOMMENDATION** | A proposed action. | Must follow from the stated inference and must be executable by the founder. |

These must be **visually and structurally distinct** in the output. A single paragraph blending all
three is the anti-pattern.

### 13.2 Every brand-aware finding must cite both sides

At minimum: **one account-derived fact** and **one brand-context fact**, each with its source. A
finding citing only brand context is a website summary (§7.4). A finding citing only account data is
what the product already does.

### 13.3 Insufficient evidence

When evidence does not support a conclusion, the required output is:

> *"There is not enough evidence to conclude X."*

plus what is missing and what would resolve it. This is a first-class output, not an error. It must
not be padded into a weak finding, and it must not be suppressed in favour of a lower-quality
finding that happens to be confident.

### 13.4 Confidence propagation

Low-confidence brand context must not produce high-confidence findings. If BC-5 is `low` and
`corrected_by_user: false`, a finding resting on BC-5 must either say so or not be produced.
`source: default` values may never be cited as evidence at all (§6.2).

### 13.5 Integration hazard — `factual-validation.ts`

An existing validation layer checks output claims. Brand context introduces a new class of claim —
statements about the brand rather than about the account — that this layer was not designed to
validate. Two risks: it silently passes unverifiable brand claims, or it strips them as
unsupported. Confirm the behaviour before relying on it, and do not assume either outcome.

---

## 14. TECHNICAL MAPPING

*All references are `origin/main` @ `2ef777da`.*

### 14.1 Assets that already exist and should be reused

| Asset | Location | Use |
|---|---|---|
| LLM URL analyser (commented out) | `routes/creative-studio.ts:42-110` | **The reference implementation for N-2.** Already extracts brand_name, product_name, product_description, target_audience, key_features, price, images. Already uses `llmGateway.createMessage` with `userId` + `operation`. Already caches. |
| Reconnect procedure | `dev_reports/ai_serv/creative/DISCONNECTED_TS_MODULES.md` | Documents why it was disabled ("URL hero removed from UI") and how to bring it back. |
| Cache table | `pg-schema.ts:503-507` `urlAnalysisCache { url PK, resultJson, analyzedAt }` | Currently write-dead. Available for N-2. |
| Regex analyser | `audit/website-analysis.ts` | Cheap structural signals: price range, product count, trust signals. Useful as corroboration for BC-2. **Not** a source of BC-3/BC-4/BC-5. |
| Context table | `pg-schema.ts:1223-1230` `brandContext { brandId PK, pricePoint, targetAudience, winningPatterns, failedApproaches, updatedAt }` | Partially overlaps BC-2 and BC-5. Has no provenance columns. Whether to extend or replace is D-3. |
| Cheerio extraction | `services/competitor-creative-intel/brand-context.ts:16-78` | Prior art for title/description/keyword extraction. **Read only — Override 2 forbids activating this subsystem.** |
| Prompt seam | `services/intelligence-integration.ts` + `ad-watchdog/reasoning.ts:38-92` | The injection point for N-6, already interpolated in the right place. |
| Ad copy handling | `audit/audit-agent.ts:426,430` | N-7 already solved on the audit path — `primaryText` sliced to 100 chars. Absent from the Watchdog path. |

### 14.2 The N-1 gap — the keystone

`INSERT INTO brands` has **zero matches** in `apps/api/src`. `brands` rows come only from
`scripts/seed-brands.ts`. Therefore:

- `runAudit()` — which gates website analysis on `brand.domain && brand.domain !== 'unknown'`
  (`audit/index.ts:132`) — has never been reachable from a real signup.
- `brandContext` has no writer.
- The URL captured at onboarding lives on `users.website_url` (`pg-schema.ts:42-63`) and is read by
  nothing.

**Any work that does not close this gap first will be built on an unreachable path.**

### 14.3 The injection point

```
reasoning.ts:38   const signals = watchdogSnapshotToSignals(snapshot);        // → []
reasoning.ts:39   strategicSection = await buildStrategicPromptSection(...);  // → ''
reasoning.ts:~50  ${strategicSection}                                          // interpolated, empty
```

N-6 makes this return real content. Nothing about the seam's shape needs to change.

### 14.4 Capability → change map

| Capability | Touch | Nature |
|---|---|---|
| N-1 | brand creation on signup/onboarding | New write path. Ownership must be explicit. |
| N-2 | reinstate `/analyze-url`-class extraction, mapped to BC-1..BC-5 | Reconnection + mapping, not new invention. |
| N-3 | persistence with provenance | Schema decision — D-3. |
| N-4 | provenance surfaced to UI and prompt | Plumbing. |
| N-5 | B1 + B2 | Frontend + a correction write path. |
| N-6 | `buildStrategicPromptSection()` | Replace the no-op on the D-1 path. |
| N-7 | ad/message context on the D-1 path | Exists on audit path; missing on Watchdog path. |

### 14.5 Must not change

- `llmGateway` bypass — forbidden by CLAUDE.md architecture rules.
- Slice 1 screens beyond M1's evidence block.
- The learning-loop rendering (Override 1).
- Competitor subsystem activation (Override 2).
- X5 actioned-state copy.
- `GET /dashboard/insights` threshold logic — out of scope (§5), unless D-1 selects it, in which
  case that selection is itself a significant scope decision and must be escalated.

### 14.6 Ownership and isolation

Brand context is per-brand, and brands are per-user. Every read must be scoped by the authenticated
user. This is DoD-12 and it inherits Slice 1's requirement that *"no request can reach a record it
does not own."* The `brandContext` table is keyed on `brandId` alone — ownership is therefore only
as strong as the `brands` row, which today is seeded rather than owned.

### 14.7 The pipeline question — D-1

Three candidate reasoning paths exist and they are not connected to each other:

| Path | Has LLM | Has website data | Has ad copy | Reachable by a real user |
|---|---|---|---|---|
| `audit-agent.ts` | yes | yes (6 of 13 fields) | yes | **no** (blocked by F-1) |
| `ad-watchdog/reasoning.ts` | yes | no | no | yes (6h cron) |
| `GET /dashboard/insights` | **no** | no | no | yes (this is what users see) |

There is no correct default. Choosing wrongly satisfies thirteen of fourteen DoD items and changes
nothing the user sees. **D-1 must be answered before scheduling.**

### 14.8 Documentation contradictions — raised, not resolved

1. **`CLAUDE.md` is materially wrong.** It states that elite-intelligence, strategic-cognition,
   quality-governance and intelligence-infrastructure "exist as complete code". Directory check:
   `elite-intelligence` **absent**, `strategic-cognition` **absent**, `quality-governance`
   **absent**, `intelligence-infrastructure` present. Do not plan against that claim.
2. **The `Brand` type and the `brands` table disagree.** `audit/types.ts:7-18` declares
   `googleAdsCustomerId` and `shopifyDomain`; `pg-schema.ts:1210-1221` has neither.
3. **`/onboarding/scan` is misnamed and unused** (F-2).

### 14.9 Corrections to my own earlier audit

Recorded so the developer does not inherit my errors:

| # | Earlier claim | Correction |
|---|---|---|
| C-1 | Ad copy is never analysed | **Wrong.** It is, at `audit-agent.ts:426,430`. It is absent only from the Watchdog and dashboard paths. |
| C-2 | Website data never reaches an LLM | **Wrong.** It does, at `audit-agent.ts:356-366` — but only 6 of 13 fields, and none of the messaging fields. |
| C-3 | No LLM URL analyser exists | **Wrong.** One exists, commented out, at `creative-studio.ts:42-110`. |
| C-4 | — | Missed `brand_context`, `url_analysis_cache`, and `brand_brain.py` entirely. |
| C-5 | The brands/users split "keys off a different field" | **Understated.** No code inserts into `brands` at all. |

---

## 15. DEFINITION OF DONE

All fifteen groups must hold. DoD-14 is critical and outranks the others.

| # | Criterion | Evidence required |
|---|---|---|
| **DoD-1** | **Brand record creation.** A new signup, in a clean environment with no seed data, produces a `brands` row owned by that user. | Fresh signup; query `brands` by user; row exists with the correct owner. |
| **DoD-2** | **Minimum brand context extraction.** For a representative website, BC-1..BC-5 are derived, with fields that cannot be derived left blank rather than guessed. | Run against a real site; inspect the five stored values; confirm blanks are blank. |
| **DoD-3** | **Provenance and confidence.** Every stored field carries `source`, `confidence`, `evidence`, `captured_at`, `corrected_by_user`. No field is stored without evidence. | Inspect the persisted record. |
| **DoD-4** | **Persistence.** Context survives session end, re-login, and server restart, and is scoped to the brand. | Persist, restart, re-read. |
| **DoD-5** | **User correction.** A correction in B1 or B2 persists, sets `source: user` / `corrected_by_user: true`, and **survives a re-read of the website**. | Correct a field; trigger re-read; assert the corrected value is intact. |
| **DoD-6** | **Corrected context reaches reasoning.** The assembled prompt on the D-1 path contains the user-corrected value, not the derived one. | Capture the prompt string; assert on its contents. Not a return-value assertion. |
| **DoD-7** | **Ad / message context reaches reasoning.** The same assembled prompt contains creative copy for the account. | Same captured prompt. |
| **DoD-8** | **Brand-specific finding.** The produced finding references this brand's specifics — not a category generality. | Read the output against the governing test. |
| **DoD-9** | **Evidence supports the finding.** Every claim traces to an account fact or a brand-context fact with a stated source. | Inspect the evidence block. |
| **DoD-10** | **Fact / inference / recommendation are distinguished** structurally, not just tonally. | Inspect output structure. |
| **DoD-11** | **Insufficient-evidence behaviour.** With thin data, the output states that there is not enough evidence — and does not manufacture a finding. | Run against a low-volume account. |
| **DoD-12** | **Isolation.** Brand A's context never appears in Brand B's reasoning, and no request can read a brand context it does not own. | Two users, two brands; cross-request attempt; assert denial. Assert prompt contents are disjoint. |
| **DoD-13** | **Failure behaviour when website analysis fails.** The system distinguishes "failed" from "succeeded", stores nothing as `source: website`, shows the honest error state, and **never surfaces `pricePoint: 'mid'` as a fact.** | Force a fetch failure; inspect stored record and UI. |
| **DoD-14** | **Incremental reasoning value. (CRITICAL)** V-1 ablation, V-2 differential and V-3 transplant all pass, with both outputs recorded for review. | §8.4. If it fails, report the negative result (§8.6). |
| **DoD-15** | **Non-regression.** Default suite **400/9**, pg suite **388/10**, `tsc --noEmit` baseline-only (`billing.ts:4` stripe), `madge --circular` **0 cycles**. | Run before commit. |

**A note on DoD-6 and DoD-7.** These are the two most likely to be falsely marked complete. A green
`tsc --noEmit` proves nothing here — `buildStrategicPromptSection()` compiles today and returns
`''`. Only the assembled prompt string is evidence.

---

## 16. END-TO-END VERIFICATION

### 16.1 Primary scenario

Run in a clean environment. No seed data. No demo mode. No developer intervention.

1. Create a new user through the real signup flow.
2. Complete onboarding, supplying a representative brand website URL.
3. Confirm a `brands` row now exists and is owned by that user. *(DoD-1)*
4. Confirm derivation ran against the supplied URL — not against a cached or seeded domain.
5. Inspect the derived BC-1..BC-5: values, evidence, confidence, source. *(DoD-2, DoD-3)*
6. On B1, correct at least one field — choose one whose derived value is wrong or low-confidence.
7. Confirm and continue. Verify persistence across a session end and restart. *(DoD-4)*
8. Trigger a re-read of the website. Verify the corrected field is unchanged. *(DoD-5)*
9. Connect the Meta account and run the analysis on the D-1 path.
10. **Capture the assembled prompt.** Assert it contains the corrected brand context. *(DoD-6)*
11. Assert the same prompt contains ad/message context for the account. *(DoD-7)*
12. Read the produced finding. Assert it is specific to this brand and this account. *(DoD-8)*
13. Assert every claim in the finding is supported by cited evidence, with fact / inference /
    recommendation structurally separated. *(DoD-9, DoD-10)*
14. Run **V-1**: re-run with brand context absent. Assert the finding differs materially. *(DoD-14)*
15. Run **V-3**: attach the finding to an unrelated brand's context. Assert it no longer holds — an
    unrelated brand would not receive this conclusion. *(DoD-14, governing test)*

Additionally, with a second user and a second brand, assert isolation in both directions. *(DoD-12)*

### 16.2 Defined failure behaviour

| Scenario | Required behaviour |
|---|---|
| **Website extraction fails** | Nothing is stored with `source: website`. `getDefaultSnapshot()` values are never surfaced as facts. B1 shows the honest error state with empty fields and offers retry / different URL / manual entry. Onboarding is not blocked. *(DoD-13)* |
| **Brand information incomplete** | Underivable fields stay blank and are labelled as such. Reasoning proceeds with what exists. A finding may not rest on a blank field, and must not infer a value to fill it. |
| **User corrects an extracted value** | The correction is authoritative and permanent. `source: user`, `confidence: high`, `corrected_by_user: true`. Subsequent re-reads never overwrite it. The next analysis uses the corrected value. *(DoD-5, DoD-6)* |
| **Evidence conflicts** — e.g. the site claims premium, observed prices are low | Do not silently pick a winner. State the conflict as a fact, and either produce a finding that is explicitly about the conflict or decline to conclude. Present both observations with their sources. |
| **Not enough evidence** | Output *"There is not enough evidence to conclude X"*, name what is missing, and name what would resolve it. Do not degrade into a weak generic finding. *(DoD-11)* |

### 16.3 Verification traps

- **Testing on a seeded brand.** `scripts/seed-brands.ts` rows will make the whole flow appear to
  work while N-1 is still missing. The scenario above must begin at signup.
- **Asserting on function returns instead of the prompt.** See DoD-6.
- **Running V-1 with anything other than the context varying.** Different model conditions produce
  different outputs for reasons unrelated to brand context, and will produce a false pass.
- **Accepting a rewording as "materially different".** §8.5 — a different subject or a different
  recommended action, not different phrasing.
- **Confirming a `mid` price point in B1 without noticing it was a failure default.** DoD-13.

---

## 17. EXPLICITLY DEFERRED

This is an **exclusion list, not a deferral list** in the operative sense: do not build against
these, and do not add extension points, configuration hooks, or abstractions in anticipation of
them. If a Batch 2 decision makes one of them harder later, that is acceptable — they will be
designed properly when they are in scope.

| Deferred | Notes |
|---|---|
| External market and trend intelligence | Explicitly future scope in the locked direction. |
| Google Trends, social listening, autonomous research | §5. |
| Competitor intelligence / Competitor Spy | Override 2. |
| Learning loop, outcome tracking, prediction verification | Override 1. Must not be presented as built. |
| Brand context derived from sources other than the website | Shopify, GA, catalogue feeds — later. |
| Multi-brand switching UX | Out of scope; the data model must not be *designed against* it either. |
| Re-derivation scheduling / staleness automation | Manual re-read only in Batch 2. |
| Rewriting `GET /dashboard/insights` to use an LLM | Its own batch, unless D-1 forces the question. |
| Fixing the `Brand` type / `brands` schema mismatch | D-5. Only what N-1 requires. |
| Reconstructing ownership for historical analysis records | Carried forward from Slice 1 open decision 2. |

---

## 18. RISKS

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| **R-1** | `getDefaultSnapshot()` fabricates `pricePoint: 'mid'` and is indistinguishable from a real result. | A fabricated fact is confirmed by the user and cited as evidence. | DoD-13. Make failure distinguishable at the call site before anything else. |
| **R-2** | The LLM invents a plausible `target_audience`. | Confident nonsense in every downstream finding. | Confidence must be honest; blank beats invented; BC-5 defaults to low. |
| **R-3** | Findings become website summaries (§7.4). | The product appears to work and delivers nothing. | §13.2 — both sides cited. V-1. |
| **R-4** | Developers implement named detectors. | Templated outputs, permanent maintenance, the anti-pattern the product exists to avoid. | §7.2 guardrail; review for conditional branches keyed on brand fields. |
| **R-5** | User corrections are overwritten by a re-read. | Trust destroyed at the exact point the product asks for trust. | DoD-5; `corrected_by_user` is authoritative. |
| **R-6** | Brand context leaks across users/brands. | Security failure and a catastrophic credibility failure. | DoD-12; scope every read by authenticated user. |
| **R-7** | `factual-validation.ts` strips or silently passes brand claims. | Either evidence disappears or unverifiable claims ship. | §13.5 — confirm behaviour before relying on it. |
| **R-8** | Regex analyser results are trusted for BC-3/BC-4. | Positioning derived from `class="hero"` matches. | Use the LLM path (F-3) for meaning fields; regex for structural corroboration only. |
| **R-9** | **D-1 answered wrongly or late.** Work lands on a path no user reaches. | Thirteen of fourteen DoD items pass; the product is unchanged. | Answer D-1 before scheduling. This is the most likely failure mode. |
| **R-10** | N-1..N-3 shipped as a "milestone". | The batch is declared half-done with zero value delivered. | §4.2 — one outcome, on the right-hand side of the graph. |
| **R-11** | DoD-14 is quietly softened when it fails. | The batch's only real criterion is discarded. | §8.6 — report the negative result. |
| **R-12** | Scope creep into market/competitor intelligence. | The batch never lands. | §5 and §17 are exclusion lists. |
| **R-13** | Planning against `CLAUDE.md`'s false module claims. | Work planned around three modules that do not exist. | §14.8. Verify before planning. |
| **R-14** | Website derivation latency blocks onboarding. | Users abandon at the new step. | Derive in background; B1 must have a bounded loading state and a working skip path (D-4). |

---

## 19. OPEN DECISIONS

**Developers must raise these. Developers must not resolve them in code.**

| # | Decision | Why it cannot be decided in code |
|---|---|---|
| **D-1** | **Which reasoning path consumes brand context** — `audit-agent.ts`, `ad-watchdog/reasoning.ts`, or `GET /dashboard/insights`. | Determines whether the batch changes anything a user sees (§14.7, R-9). **Blocks scheduling.** |
| **D-2** | Whether unconfirmed context may be used in reasoning at all, or only after explicit confirmation. | A trust and honesty decision, not a technical one. |
| **D-3** | Whether to extend `brandContext` or introduce a new provenance-carrying store. | Schema decision with migration and ownership consequences. |
| **D-4** | Whether B1 may be skipped, and what a skip implies downstream. | Product decision about how much unconfirmed context the product will reason from. |
| **D-5** | Whether the `Brand` type / `brands` table mismatch is fixed now or recorded. | Touches a shared type; scope beyond N-1. |
| **D-6** | Whether `/onboarding/scan` is repurposed as the derivation trigger, renamed, or removed. | It is misnamed, unused, and currently lies about what it does. |
| **D-7** | Whether re-derivation is offered at all in Batch 2, or context is captured once. | Interacts with D-2 and R-5. |

**Carried forward, unresolved, from Slice 1:**

- **X4** — Meta permissions: whether a write scope is requested while the UI states Cosmisk cannot
  write.
- **Slice 1 #2** — whether historical analysis records are retained with reconstructed ownership or
  discarded.
- **Slice 1 #3** — what the demo data source is.
- **Slice 1 #4** — whether demo mode ships at all.

> Standing rule: if a developer cannot find the answer in this document or in the Constitution, the
> correct action is to raise it. It is never to decide.

---

## 20. DEVELOPER HANDOFF SUMMARY

### A. PRODUCT INTENT

Make Cosmisk understand a specific brand well enough to interpret that brand's own account data in
context. The output is a finding the account numbers alone could not produce. Not a brand profile,
not a questionnaire, not market intelligence.

### B. USER EXPERIENCE

`DISCOVER → UNDERSTAND → REVIEW/CORRECT → PERSIST → USE IN INTELLIGENCE`. Two new screens (B1
onboarding review, B2 settings) and one modification (M1, brand context named on the finding). The
user's job is correction, not data entry. Success is one sentence: *"Cosmisk understood something
about my business, and that understanding changed the quality of the analysis."*

### C. SYSTEM BEHAVIOUR

Derive BC-1..BC-5 from the website with evidence and honest confidence. Store blanks rather than
guesses. Never present a failure default as a fact. User corrections are permanent and outrank
derived values. Insufficient evidence is a first-class output. Findings separate fact, inference and
recommendation, and cite both an account fact and a brand-context fact.

### D. TECHNICAL MAPPING

Seven capabilities, N-1..N-7 (§14.4). The keystone is N-1 — no code creates a brand record today.
The reference implementation for N-2 already exists, commented out, at `creative-studio.ts:42-110`.
The injection seam for N-6 already exists and returns `''`. N-7 is already solved on the audit path
and missing on the Watchdog path. Reuse before building.

### E. ACCEPTANCE CRITERIA

Fifteen DoD groups (§15) verified by the fifteen-step end-to-end scenario and five failure scenarios
(§16). DoD-14 — incremental reasoning value, proven by V-1 ablation, V-2 differential and V-3
transplant — outranks the rest.

---

### Read before starting

1. **`INSERT INTO brands` has zero matches.** Everything downstream depends on fixing that first.
   Do not test on seeded brands.
2. **The good analyser already exists and is commented out.** Read
   `dev_reports/ai_serv/creative/DISCONNECTED_TS_MODULES.md` before writing a new one.
3. **`getDefaultSnapshot()` returns `pricePoint: 'mid'` on any failure**, and the call site cannot
   tell that apart from a real result. Fix the distinguishability before building UI on top of it.
4. **`buildStrategicPromptSection()` returns `''`.** It compiles, it runs, it logs, and it does
   nothing. `services/intelligence-integration.ts:34-113` is a set of shape-correct no-ops —
   `watchdogSnapshotToSignals()` returns `[]`, `enhanceWatchdogDecisions()` returns its input
   unchanged, `isStrategicEnough()` returns `true` for every string. Compilation is not evidence of
   function. The only proof that brand context reached a prompt is the assembled prompt string
   itself — capture it and assert on it (DoD-6, DoD-7).
5. **D-1 must be answered before this batch is scheduled.** If it is left open, N-6 and N-7 can be
   implemented against a path no user reaches, every DoD item except 14 can pass, and the batch can
   close with zero user-visible change. That is R-9, and it is the most likely way this batch fails
   while appearing to succeed.

---

### Governing constraints

These are not Batch 2 decisions. They are already locked and carry forward unchanged.

| Constraint | Source | Effect on Batch 2 |
|---|---|---|
| **Override 1** — the learning loop is not implemented | `UX_CONSTITUTION.md` § Slice 1 Decision Override | Brand context must not be presented as something Cosmisk *learned*. It was extracted and confirmed. At most one loop stage — *Action recorded* — may render complete. No baseline, observation, outcome, verdict or learning. |
| **Override 2** — competitor capture is out of scope | Same | `services/competitor-creative-intel/` is not to be wired into onboarding. Its `extractBrandContext()` may be read as prior art (§14.1); it may not be activated. |
| **X5** — actioned-state copy is RESOLVED | Same | Do not re-open. Do not extend the confirmation copy to claim brand context improved anything. |
| **No direct LLM calls** | `CLAUDE.md` § Architecture Rules | Any extraction call goes through `llmGateway.createMessage` with a `userId` and an `operation` label. Bypasses are a billing and cost-tracking failure, not a style preference. The commented-out reference implementation already does this correctly — preserve that. |
| **Test invariant** | `CLAUDE.md` § Test Invariant | Before any commit: default suite **400/9**, pg suite **388/10**, `tsc --noEmit` baseline-only (`billing.ts:4` stripe), `madge --circular` **0 cycles**. New tests raise the numerator; they do not license a regression elsewhere. |
| **§17 is an exclusion list, not a deferral list** | `DEVELOPER_DIRECTION.md` §8 pattern | Do not add extension points, config hooks, or abstractions in anticipation of deferred items. If a Batch 2 decision makes market intelligence or the learning loop harder later, that is acceptable. |

---

### The test that outranks the others

Slice 1's governing test is unchanged and still applies:

> **If an output could have been written without reading this specific account, it does not ship.**

Batch 2 adds one clause, and it is the reason this batch exists:

> **If an output could have been written by reading only the brand's website, it is a summary, not a
> finding.**

A finding requires both sides — the brand's own context *and* the brand's own account data — and
must break if either is removed. That is V-1 and V-3 in §8, and it is DoD-14. Everything else in
this document is scaffolding for that one property. If DoD-14 fails, the batch is not done,
regardless of how many of the other thirteen pass. Report the negative result; do not relax the
criterion.

---

### Attestation

Nothing in this work was implemented. No source file was modified, no schema or migration was
written, no dependency was installed, no branch was created, no commit was made, no push was
performed. `main` and the developer branches are untouched. This document is the only artifact
produced, and it is written outside any git working tree.

Every technical claim in §14 and every line reference in this document was read from `origin/main` @
`2ef777da`, inspected through a read-only extraction (`git archive | tar -x`) at
`/Users/vishatjain/cosmisk-recovery/audit-b2/main`, which touched no git state in the working
repository. Where this document contradicts my earlier Batch 2 discovery audit, the contradictions
are listed explicitly in §14.8 and §14.9 — the corrections are recorded rather than silently
applied, so the developer does not inherit my errors.

Open decisions D-1 through D-7 are raised, not resolved. Per the standing rule: if the answer is not
in this document or the Constitution, raise it. Never decide it in code.

**END OF HANDOFF.**
