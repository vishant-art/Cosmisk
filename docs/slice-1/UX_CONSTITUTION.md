# Cosmisk — Product & UX Constitution

**Status:** Foundational. This document governs how Cosmisk behaves, reasons and presents.
**Audience:** Everyone building Cosmisk — engineers, designers, AI/prompt authors, QA.
**Authority:** Where this document and a ticket disagree, this document wins. Where this
document and a developer's judgement disagree, this document wins. Where this document is
silent, ask — do not decide.

**Scope note.** This is the foundation, not the whole product. It defines the rules that must
hold for anything Cosmisk ever ships. It deliberately does not describe features beyond
Slice 1. The screen-by-screen contract lives in `COSMISK_SLICE_1_DEVELOPER_SPEC.md`.

---

## 1. Why Cosmisk Exists

A D2C operator running Meta ads has more data than they have time. Ads Manager will answer
any question they can already formulate. It will not tell them which question to ask.

So the operator ends up in one of two failure states:

- **Reporting paralysis.** They can see spend, ROAS, CTR, frequency, breakdowns by placement
  and age and device. They cannot see *what is wrong*. Everything is a number and nothing is
  a conclusion.
- **Reactive firefighting.** They notice ROAS fell, they guess at a cause, they change
  something, and they never find out whether the change was the reason things got better or
  worse. There is no memory, so there is no learning.

Cosmisk exists to close that gap. It reads the account, works out what is actually happening,
says so in plain language, shows the numbers that justify the claim, recommends one specific
action, and then measures whether it was right.

The thing being sold is not analysis. It is **a defensible conclusion that the operator can
act on, and a system that checks itself afterwards.**

---

## 2. The User Problems We Are Solving

There are two. Both are real. The second one is the reason this document exists.

### 2.1 The operator's problem

| Problem | What it looks like in practice |
|---|---|
| Cannot tell signal from noise | "ROAS is down 0.4. Is that a bad week or a real problem?" |
| Cannot locate the cause | Blended numbers hide the fact that four creatives are fine and two are bleeding. |
| Cannot judge severity | Everything in a dashboard has the same visual weight, so nothing has priority. |
| Cannot act with confidence | An unexplained recommendation is indistinguishable from a guess, so it is ignored. |
| Never learns | No baseline, no follow-up, no verdict. The same mistake repeats next quarter. |
| Drowns in creative data | 47 creatives, no way to see the pattern across them. |

### 2.2 The founder / product communication problem

This is the problem that historically caused bad implementation, and it is being solved by
documentation rather than by conversation.

The founder holds a very specific model of how Cosmisk should work, feel, reason and present.
That model was previously transmitted verbally and in fragments. The result was predictable:

- Features were built without a complete UX definition.
- Functionality worked technically but did not feel like the intended product.
- AI outputs came back generic — "here are some possible reasons" — instead of
  Cosmisk-style intelligence.
- Features were left partially complete.
- Scope expanded sideways instead of finishing vertically.
- Very little was ever truly finished.
- Developers were forced to interpret product decisions that should have been stated.

**That pattern is over.** The remedy has three parts, and all three are required:

1. **The visual prototype** (`apps/web/src/app/proto/`) is the visual and interaction
   reference. It is not a mockup to be improved on. It is the target.
2. **This Constitution** defines the reasoning and presentation rules that the prototype is an
   expression of — so that new surfaces, ones the prototype does not contain, can be built
   without a new conversation.
3. **The Slice 1 Developer Spec** defines every screen, state, output and acceptance
   criterion, so that "I wasn't sure what you wanted" is not an available sentence.

A developer who has read all three should never have to invent product behaviour. If they
find a gap, the correct action is to **raise it**, not to fill it.

---

## 3. What Cosmisk Is

Cosmisk is **an analyst that lives inside the account.**

Concretely, it is a system that:

- **Understands the business first.** It reads the brand's website before it reads a single
  ad, so that every later number is judged against what this business actually sells, at what
  price, to whom. A ROAS of 2.1 means something different for a ₹599 product than a ₹2,499 one.
- **Holds that understanding as memory.** The brand model is stored, reused and correctable by
  the user. It is not a setup step that gets thrown away.
- **Diagnoses rather than reports.** It moves from "revenue is flat while spend rose 12%" to
  "the entire decline is concentrated in two creatives that crossed frequency 5.0 three weeks
  ago."
- **Separates what it measured from what it inferred.** Always. Visually and in language.
- **Recommends one specific, bounded action** with the reasoning, the projection, the
  assumption behind the projection, and the caveat.
- **Records the action, locks a baseline, observes, and returns a verdict** — including a
  verdict of "I was wrong."
- **Reasons about creative, not just delivery.** Hook, angle, format, concept, fatigue and the
  pattern across them.
- **Answers questions in the same structure it uses to present findings.** Ask Cosmisk is not
  a different product with a chat box; it is the same intelligence, addressed directly.

---

## 4. What Cosmisk Is NOT

Each of these is a real failure mode this product has drifted toward before. They are listed
with the reason, because "don't do X" without "because Y" gets rationalised away.

### 4.1 Not another analytics dashboard

**Why not:** the operator already has Ads Manager, and it is better at reporting than we will
ever be. A dashboard answers questions the user already has. Cosmisk's job is to tell them
which question matters. If our page leads with a KPI strip, we have shipped a worse Ads
Manager.

**Rule:** metrics exist to *support* a conclusion that is already on screen above them. In the
Slice 1 dashboard, the KPI strip sits below the findings and is explicitly labelled
"Account numbers — for reference, not a finding." That ordering is a product decision, not a
layout preference.

### 4.2 Not a generic "ChatGPT for ads"

**Why not:** a general chat interface puts the burden of knowing what to ask back on the user,
which is the exact burden we exist to remove. It also produces hedged, structureless prose
that reads as plausible and commits to nothing.

**Rule:** Cosmisk leads with a conclusion it arrived at unprompted. Chat is a *secondary*
surface for interrogating that conclusion. Every answer, chat or not, follows the output
structure in §6.

### 4.3 Not a collection of AI features

**Why not:** "AI creative scoring", "AI copy generator", "AI audience finder" bolted onto a
dashboard is a feature list, not a product. None of them compound. Each one is separately
ignorable.

**Rule:** every capability must sit somewhere on the intelligence chain in §5 and must feed
the loop in §10. If a feature produces an output that nothing downstream consumes and that
nothing later measures, it does not ship.

### 4.4 Not a feature-heavy Meta Ads Manager replacement

**Why not:** we cannot win on surface area, and trying to spreads the team thin enough that
nothing gets finished. It also puts us in the business of write operations and account
management, which is a different, heavier product with a different risk profile.

**Rule:** the user acts in Ads Manager. Cosmisk tells them precisely what to do there. Any
future in-product execution is a deliberate, separately-scoped decision — not a natural
extension.

---

## 5. Core Intelligence Model

Every Cosmisk capability sits on this chain. If you cannot say which link your feature
occupies, the feature is not defined yet.

```
DATA
  → UNDERSTANDING       what this business is, what it sells, to whom, at what price
    → EVIDENCE          measured facts, attributable to a source, checkable
      → INTERPRETATION  what Cosmisk thinks those facts mean, stated as inference
        → STRATEGIC     the pattern across findings; what this account rewards
          LEARNING
          → RECOMMENDATION   one specific action, with projection and assumption
            → ACTION         taken by the user, in their Ads Manager
              → OUTCOME      measured against a baseline locked at the moment of action
                → LEARNING   Cosmisk updates its model of this account
```

Two properties of this chain are load-bearing:

**It is directional.** You may not present a link without the links to its left. A
recommendation with no evidence is a guess. Evidence with no understanding is a spreadsheet.
Interpretation presented before evidence is an assertion.

**It closes.** The last link feeds the first. A system that recommends and never returns is
guessing in public. This is the single property that most distinguishes Cosmisk from a report
generator, and it is the property most likely to be quietly dropped under delivery pressure.
It must not be.

---

## 6. Cosmisk Output Principles

This is one of the most important sections in this document. It is where "generic AI output"
gets caught.

### 6.1 The forbidden shape

> "Your ROAS has decreased. Here are some possible reasons: audience fatigue, seasonality,
> increased competition, creative wear-out. You may want to review your campaigns."

This is unacceptable output. Not because it is wrong, but because:

- It restates something the user already knows.
- It offers a menu of causes instead of a diagnosis.
- It is not attached to any number in this account.
- It recommends "reviewing", which is not an action.
- It cannot be wrong, so it cannot be checked, so nothing can be learned from it.

**If an output could have been written without reading this specific account, it does not
ship.**

### 6.2 The required structure

Every intelligence output — a finding card, a dashboard signal, an Ask Cosmisk answer, a
future email digest — uses this structure. Sections may be compressed for smaller surfaces;
they may not be reordered, and the first five may not be omitted.

| # | Block | What it must contain |
|---|---|---|
| 1 | **WHAT COSMISK FOUND** | One sentence. Specific, quantified, and it names the thing. |
| 2 | **EVIDENCE** | The measured facts that force the conclusion. Numbers with sources and comparisons. |
| 3 | **WHAT COSMISK THINKS IS HAPPENING** | The inference. Written in sentences, visually distinct from evidence. |
| 4 | **WHY IT MATTERS** | The consequence in money or risk. May be folded into 1 or 3 on compact surfaces. |
| 5 | **WHAT TO DO** | One concrete action a competent operator can execute today. |
| 6 | **ASSUMPTION / CONFIDENCE** | What must be true for this to hold, and how sure Cosmisk is. |
| 7 | **EXPECTED IMPACT** | The projection, shown as arithmetic the user can audit — not one number. |
| 8 | **COSMISK CHECKS ITSELF** | What Cosmisk will measure, when, and what it will do with the answer. |

**This structure is not merely visual. It is how Cosmisk reasons.** An implementation that
produces prose and then chops it into eight boxes has not implemented this. The generation
step must produce the blocks.

### 6.3 Working example (from Slice 1, `proto-data.ts` → `FIRST_FINDING`)

| Block | Content |
|---|---|
| **Found** | ₹4.9L a month is going to two creatives that stopped working three weeks ago. |
| **Evidence** | "Summer Sale 40% Off" — ROAS 1.8, was 3.4 in its first 14 days, CTR 1.1% (was 2.6%), ₹3,50,000 spent, ₹6,30,000 back, frequency 6.8, live 42 days. · "Before/After 60 Days" — ROAS 2.1, was 3.6, CTR 1.2% (was 2.4%), ₹1,40,000 spent, ₹2,94,000 back, frequency 5.2, live 35 days. · Account average ROAS 3.2 — both are ~40% below the account's own average. · "₹999 for 30 Days" — ROAS 5.2, frequency 2.1, still improving, not budget-capped. |
| **Interpretation** | These are the two oldest live creatives and both are above frequency 5.0 — the audience has seen each five to seven times. This is not a creative quality problem: both opened above ROAS 3.4, at or above account average. They worked, and then the audience ran out. |
| **Why it matters** | Both are still at full budget. Together they are the second and fourth largest line items in the account. |
| **What to do** | Pause both and move the combined ₹4,90,000 to "₹999 for 30 Days" — highest ROAS at 5.2, frequency only 2.1, not budget-capped, so it has room before it saturates. Effort: 2 minutes in Ads Manager. |
| **Assumption** | Modelled at ROAS 3.5, not the 5.2 that creative does today. Efficiency almost always falls when you put 6x the budget behind one creative. Confidence: high. |
| **Expected impact** | ₹4,90,000 today → ₹9,24,000 back (blended ROAS 1.89). Same spend at 3.5 ROAS → ₹17,15,000 back. Difference: +₹7,91,000 / month, if the assumption holds. |
| **Checks itself** | Re-check frequency after 7 days; if it passes 4.0 this creative is saturating too. Cosmisk compares the next 7 days against the locked baseline of ₹3.5L / 1.8 ROAS and returns a verdict on day 7. |

Note what this example does that generic output does not: it names creatives, quotes the
before-value alongside the after-value, compares to the account's own average rather than an
industry benchmark, discounts its own projection, and states the condition under which it is
wrong.

### 6.4 Language rules

- **Say the number.** "₹4.9L a month", not "significant spend".
- **Say the name.** "Summer Sale 40% Off", not "an underperforming creative".
- **Compare against this account.** The account's own average and its own history are the
  benchmark. Industry benchmarks are not evidence about this business.
- **One conclusion per output.** If there are three findings, that is three outputs, ranked.
- **No hedging that removes the claim.** "may be", "could potentially", "it is possible that"
  as the main verb of a finding is banned. Uncertainty is expressed in the confidence and
  assumption blocks, where it is legible, not smeared across the prose.
- **No menus of causes.** Pick one, state the alternative reading explicitly as a caveat, and
  say why the chosen one is stronger. Example from Slice 1: *"One alternative reading: a
  competitor may have entered the same auction and pushed your CPMs up. Cosmisk cannot see
  competitor auction data yet, so frequency is the stronger explanation."*
- **Name what Cosmisk cannot see.** Blind spots stated are trust. Blind spots hidden are the
  reason a wrong answer destroys the relationship.

### 6.5 Numbers must survive being checked

Every figure in an output must be arithmetically consistent with every other figure in the
product. The Slice 1 demo data carries an explicit arithmetic contract in `proto-data.ts`:
per-creative `spend × roas = revenue` exactly; the six shown creatives sum to ₹10.1L of the
₹18.4L account spend; the account tells one story (spend +12.3%, revenue −0.2%, ROAS 3.6 →
3.2, waste ₹4.9L) and the finding, the dashboard and the Ask answer must never contradict it.

**Rule:** if a user can find two numbers in Cosmisk that cannot both be true, the product has
failed regardless of how good the reasoning was.

---

## 7. Evidence vs Interpretation

A user must **never** have to guess which of the four things they are reading.

| Layer | Definition | How it is presented |
|---|---|---|
| **Measured fact** | A number read from a source. Reproducible. Cannot be argued with. | Monospace / tabular, on white, with the source and period attached. |
| **Inference** | Cosmisk's reading of those facts. Could be wrong. | Sentences, on a tinted panel, in the first person of the product ("Cosmisk thinks"). |
| **Hypothesis** | A candidate explanation Cosmisk has not confirmed. | Explicitly labelled as an alternative reading, with why it was not chosen. |
| **Recommendation** | A proposed action, downstream of the inference. | Its own block, visually distinct, with effort, projection and caveat. |

Slice 1 implements this literally: on the First Aha screen, Evidence is a mono/tabular card on
white, and Interpretation is a tinted accent panel with a `brain` icon, sat side by side so
the difference between a measurement and a judgement is impossible to miss.

**Hard rules:**

- **Cosmisk must not present uncertain inference as fact.** If it is inferred, it is written
  as inference and it lives in the interpretation surface.
- **Confidence must be visible on every finding**, not buried. Slice 1 shows
  "High confidence" as a chip next to the severity chip.
- **The evidence base must be stated.** Slice 1: *"42 days of account history · 47 creatives ·
  8 campaigns"*. A pattern drawn from six creatives must say six, not imply forty-seven.
- **A pattern is a working pattern, not a law.** Slice 1 phrases it exactly this way:
  *"Cosmisk holds that as a working pattern from six creatives, not a rule."*
- **When Cosmisk is blind, say so.** Competitor auction data, offline conversions, creative it
  cannot fetch — named, not silently excluded.

---

## 8. Creative Intelligence Principles

Creative is where the strategic value is. Delivery metrics tell you *that* something decayed.
Creative reasoning tells you *what to make next.*

The full chain Cosmisk reasons along:

```
Creative → Hook → Concept → Angle → Format → Visual → Message → Creator
        → Audience → Performance → Fatigue → Pattern
        → Strategic implication → New recommendation → Learning
```

**This section is a principle to design toward. Do not build it in Slice 1.** Slice 1 carries
hook, format, frequency, days-live and performance, and draws exactly one pattern from them.
That is the whole of it.

### Principles

- **Format is not an angle.** These are independent dimensions and conflating them produces
  false conclusions. Slice 1 demonstrates the discipline: the two decaying creatives are a
  static and a carousel, and the best performer is *also* a static — therefore format cannot
  be the discriminator, and the finding says the angle is. Any creative claim must be checked
  against the possibility that a counter-example shares the proposed cause.
- **Fatigue is a delivery fact, not a creative verdict.** A creative that opened above account
  average and then decayed as frequency crossed 5.0 did not fail — its audience ran out. Those
  two situations demand opposite actions and must never be described the same way.
- **A pattern needs a stated population.** "Price Anchor hooks outperform by 2.1x" is only
  meaningful with "across N creatives, over D days" attached.
- **Patterns are revisable.** Cosmisk states its current working pattern and commits to
  revising it as more creatives run. It does not present an early pattern as an account law.
- **Creative reasoning must terminate in a recommendation about what to make or run next**,
  otherwise it is trivia.

---

## 9. Brand Understanding / Memory

Cosmisk reads the brand's website **before** it reads any ad data. This ordering is
deliberate and is the first moment the product says something about the user's business
rather than asking for more input.

### What is understood

Name, website, category, positioning, price range and price point, product count, top
products with prices, audience, geography, trust signals, and a confidence rating on the
extraction. (See `DiscoveredBrand` in `proto-data.ts`.)

### Principles

- **Ask only for what cannot be inferred.** Slice 1 asks for exactly one thing: the website
  address. It deliberately does not ask for brand name (read from the site) or monthly spend
  (read from Meta). Asking a user to type facts the product is about to discover teaches them
  it is a form, not an analyst. Asking them to *estimate* spend gives Cosmisk a worse number
  than the one it already has.
- **Show what was understood, before proceeding.** The user sees the extracted brand model and
  confirms or corrects it before any analysis runs.
- **It is memory, not setup.** It is stored, reused, and every later finding, number and
  recommendation is read against it. The Slice 1 screen states this explicitly, because
  without that line the table reads as a one-off onboarding step.
- **The user can correct it at any time, and the findings change with it.** Corrections are
  authoritative over extraction.
- **Extraction confidence is surfaced.** Low-confidence extraction must not silently become
  the basis for high-confidence findings.

---

## 10. Learning Loop

```
Recommendation
  → Action recorded (by the user)
    → Baseline locked (the numbers at the moment of action)
      → Observation period
        → Outcome measured against the baseline
          → Evaluation: Right / Wrong / Inconclusive
            → Learning stored
              → Future recommendations improve
```

**Document this. Do not implement the engine in Slice 1.**

### The rule that matters most

**Clicking "I have done this" does NOT mean Cosmisk has learned anything.** It means the user
has confirmed the recommended action was taken. Nothing more.

This distinction is easy to blur and blurring it is dishonest, because it lets the product
claim a capability it does not have. Slice 1 handles it by rendering the loop as five stages
with their real status, so the button is visibly step one of five:

| # | Stage | Status when actioned | Status when not |
|---|---|---|---|
| 1 | Action recorded | By you | Waiting for you |
| 2 | Baseline locked | ₹3.5L · 1.8 | Today's numbers |
| 3 | Cosmisk observes new data | — | Next 7 days |
| 4 | Outcome evaluated | — | Verdict on day 7 |
| 5 | Cosmisk adjusts its model | — | After the verdict |

Only stages 1 and 2 can complete in Slice 1. Stages 3–5 require time to pass, which the
product does not have and must not pretend to. Their status strings say **when**, not
**whether**.

### Principles

- **A baseline must be captured at the moment of action**, or the outcome is unmeasurable
  forever. This is the one piece of the loop that is irrecoverable if skipped.
- **"Wrong" is a first-class verdict.** Cosmisk must be able to say the call was wrong and say
  what it changed as a result. A system that only reports successes is marketing.
- **"Inconclusive" is also a first-class verdict.** Forcing a binary produces false learning.
- **Learning is account-specific.** It updates Cosmisk's model of *this* account.
- **Never show a stage as complete because time has not yet disproved it.**

---

## 11. UX Principles

These are the design rules that fall out of everything above. Each is testable.

1. **Intelligence before analytics.** Conclusions appear above metrics on every surface.
   Metrics support a conclusion; they do not open the page.
2. **One important thing before everything.** There is a single lead finding, ranked by
   consequence. Everything else is secondary and looks secondary.
3. **Evidence before recommendation.** The user sees why before they see what to do.
4. **Recommendation before action.** No action is offered without a stated reason,
   projection, assumption and caveat.
5. **Never hide uncertainty.** Confidence, evidence base, assumptions and alternative
   readings are on screen, not in a tooltip, not in a footnote.
6. **Do not overwhelm with data.** Show the numbers that force the conclusion. A table of
   everything is an abdication. Where a subset is shown, say so explicitly
   ("6 of 47 shown · ₹10.1L of ₹18.4L spend").
7. **Every insight needs a "so what?"** An output with no consequence and no action does not
   belong on the screen.
8. **Do not create UI for capabilities that do not exist.** If it is not built, it either is
   not rendered, or it is rendered visibly disabled and labelled as not built. Slice 1 uses a
   dashed "⌁ Future — Not built" treatment and greyed "Soon" nav items. A disabled control
   with an honest label is acceptable; a control that looks live and does nothing is not.
9. **The user remains in control of consequential actions.** Cosmisk finds the problem and
   says exactly what to do. The user makes the change, in their Ads Manager. Any future
   change to this is a deliberate product decision with its own permission and trust design.
10. **Hierarchy is carried by weight and colour, not by size.** Making the important thing
    bigger is the lazy solution and it degrades as content grows. Slice 1's dashboard uses
    identical type sizes for all four section labels — two navy and semibold with a rule, two
    muted grey — so the ranking survives long content.
11. **Prototype and demo states are labelled as such, always.** Sample data carries a chip.
    Simulated behaviour carries a disclaimer. A reviewer must never mistake a scripted
    response for a working system.
12. **Deterministic demo.** The same click path produces the same output every time. Review
    and QA are impossible otherwise.

---

## 12. Feature Prioritization Rule

A feature is prioritised **only** if it materially improves at least one of these six:

| | Capability | Test question |
|---|---|---|
| 1 | **Understanding** | Does Cosmisk know this business better afterwards? |
| 2 | **Diagnosis** | Can Cosmisk correctly identify a cause it previously could not? |
| 3 | **Decision** | Does the user reach a confident decision faster or more often? |
| 4 | **Action** | Is the recommended action more specific, or easier to execute correctly? |
| 5 | **Measurement** | Can an outcome now be measured that previously could not be? |
| 6 | **Learning** | Does a future recommendation get better because of this? |

If it improves none of them, it goes to the backlog. It does not go into the current slice
"since we're in there anyway."

**Failing tests to apply:**

- *"It would look impressive in a demo"* — not a reason.
- *"A competitor has it"* — not a reason.
- *"It is only a small addition"* — small additions are how the six previous problems in §2.2
  happened.
- *"The AI can already do it, we just need to surface it"* — surfacing an unstructured model
  output violates §6.

---

## 13. Scope Discipline

**Build complete vertical slices. Do not build many incomplete features simultaneously.**

A slice is complete when a real user can walk the whole path from entry to outcome without
encountering a dead end, an unhandled state, or a control that does not work.

### Rules

1. **One slice at a time, finished.** A finished narrow product beats a broad unfinished one,
   every time, and it is the only thing that can actually be tested with a user.
2. **A slice is not done until loading, empty, error and success states are all defined and
   built.** A feature with only a happy path is not a feature.
3. **Future capability is documented, not half-built.** The correct representation of an
   unbuilt capability is an honest label, or nothing.
4. **Do not expand the data contract mid-slice.** In particular, do not expand Meta
   permissions or redesign the OAuth architecture to make a nice-to-have possible. Permission
   scope is a trust decision, not an implementation detail.
5. **Scope changes are product decisions.** A developer who finds the spec insufficient raises
   it. They do not resolve it in code.
6. **The prototype is the reference, not a starting point for improvement.** Divergence from
   it is a bug unless it was explicitly agreed.

### What is explicitly out of scope right now

Slice 2 and beyond, the learning engine implementation, Creative Studio, Competitor Spy,
Reports, and full Analytics. These are named here so that "should we start this?" has a
written answer: **no, not yet.**

---

## Appendix — How to use this document

**Before writing code:** read §5, §6, §7 and §11. Most implementation mistakes in this product
are violations of those four.

**When the spec is silent:** raise it. Do not infer. See §2.2.

**When reviewing a PR, ask:**

- Could this output have been generated without reading this specific account? (§6.1)
- Can a user tell which parts are measured and which are inferred? (§7)
- Is there any control on screen that looks live and is not? (§11.8)
- Do all the numbers on this screen agree with all the numbers on every other screen? (§6.5)
- If this is a recommendation, is there a baseline being captured? (§10)

---

# Slice 1 Decision Override

**This section governs Slice 1 implementation.** It does not amend, replace or delete any
principle above it. Everything above this line is preserved exactly as originally written.
Where this section and an earlier section conflict, this section wins **for Slice 1 only**; the
earlier section remains the product direction beyond Slice 1.

## Override 1 — The learning loop is not implemented in Slice 1

**Decision.** Slice 1 does **not** implement an active learning or self-checking loop.

The loop described in §10 — Action → Baseline → Observation → Outcome → Verdict → Learning —
remains the product direction. It is not built, and Slice 1 must not present it as built.

**Slice 1 must not present any of the following as functioning:**

- a persisted learning baseline
- scheduled observation
- outcome measurement
- a post-action verdict
- "Cosmisk checked itself"
- "Cosmisk learned from the result"
- model adjustment based on an observed outcome

**What is permitted.** The First Aha may communicate that outcome tracking and learning are a
**future** capability, provided they are explicitly represented as future or unavailable. §13
rule 3 already states the correct form: *"The correct representation of an unbuilt capability is
an honest label, or nothing."*

**What this does not change.** The learning concept remains part of the product philosophy. §10
is neither deleted nor rewritten. No learning engine is to be built. No simulated learning
behaviour is to be added. The goal is to preserve the product vision without making a false
product claim.

### Effect on §6.2 — the eighth block

§6.2 requires every intelligence output to carry an eighth block, **COSMISK CHECKS ITSELF**,
containing "what Cosmisk will measure, when, and what it will do with the answer." §10 and §13
place the learning engine out of scope. These are in direct tension.

**Resolution for Slice 1.** The eighth block is retained as a **statement of future capability**,
not as a status display of work in progress. It must carry an explicit future/unavailable label.
No stage of it may render as complete.

This resolves the contradiction for Slice 1 only. Beyond Slice 1, §6.2 applies as written.

### Affected passages in this document

**These passages are superseded for Slice 1 by X5.** They are otherwise left exactly as written —
nothing above the Override line has been edited. Each remains the product direction beyond Slice 1.

The two passages a developer is most likely to misread as a current Slice 1 requirement are the
first two rows. They are the reason this table exists.

| Location | What it says | Status for Slice 1 |
|---|---|---|
| **§10, *The rule that matters most*, first line** — "Only stages 1 and 2 can complete in Slice 1. Stages 3–5 require time to pass, which the…" | Two stages complete when the user actions the finding. | **SUPERSEDED by X5.** Read as: *Only stage 1 can complete in Slice 1.* Stage 2 (*Baseline locked*) does not complete, because Slice 1 persists no baseline. Stages 2–5 all remain pending. |
| **§10, the stage table, row 2** — `\| 2 \| Baseline locked \| ₹3.5L · 1.8 \| Today's numbers \|` | Under *Status when actioned*, stage 2 shows the locked baseline values ₹3.5L · 1.8. | **SUPERSEDED by X5.** Row 2 renders its *pending* value — *Today's numbers* — in both the default and the actioned state. No baseline value may be displayed as locked. |
| **§6.3, the working example, *Checks itself* row** — "Cosmisk compares the next 7 days against the locked baseline of ₹3.5L / 1.8 ROAS and returns a verdict on day 7." | A worked specimen of the eighth block. | **SUPERSEDED as a specimen to copy.** It describes scheduled observation, a locked baseline and a verdict — three things Override 1 prohibits presenting as functioning. Do not ship this sentence. The block is retained only under an explicit future/unavailable label. |
| **§3** — "Records the action, locks a baseline, observes, and returns a verdict" | Definition of what Cosmisk does. | **Product direction. Not a Slice 1 requirement.** None of *locks a baseline*, *observes* or *returns a verdict* is built in Slice 1 or may be presented as built. |
| **§5, the model diagram** — "→ OUTCOME  measured against a baseline locked at the moment of action" | Diagram of the intelligence model. | **Product direction. Not a Slice 1 requirement.** |
| **§10, the loop diagram** — "→ Baseline locked (the numbers at the moment of action)" and "→ Outcome measured against the baseline" | Diagram of the five-stage loop. | **Product direction.** The diagram may be *rendered*, per Override 1, only with stages 2–5 pending and an explicit future label. |
| **§10, *The rule that matters most*** — "**A baseline must be captured at the moment of action**, or the outcome is unmeasurable forever." | The strongest imperative in §10. | **Product direction. Explicitly out of scope for Slice 1.** Slice 1 captures no baseline. A developer must not implement baseline capture to satisfy this line, and must not add UI implying it happened. It is correct beyond Slice 1. |
| **Appendix checklist** — "If this is a recommendation, is there a baseline being captured? (§10)" | Pre-ship checklist item. | **Not applicable in Slice 1.** The answer is *no*, by decision. This item does not gate Slice 1. |

**§10's rule that matters most — *"Clicking 'I have done this' does NOT mean Cosmisk has learned
anything. It means the user has confirmed the recommended action was taken. Nothing more."* — is
unchanged and is exactly what X5 implements.** Only the stage count and the baseline value are
superseded.

If any passage not listed here implies a second completed stage, a locked baseline, scheduled
observation, an outcome, a verdict, or learning as current Slice 1 functionality, **it is
superseded too.** Raise it so it can be tabulated. Do not act on it, and do not resolve it in code.

## Override 2 — Competitor capture is not part of Slice 1

**Decision.** Competitor capture is not in Slice 1. Competitor Spy is not to be implemented.

The approved Slice 1 journey is:

`Login / Signup → What is Cosmisk → Brand / Website → Connect Meta → Brand Discovery →
Analysis → First Aha → Action → Dashboard → Ask Cosmisk`

The recovered prototype already follows this journey. No competitor capture step is to be added
to onboarding or to any screen. This does not remove competitor intelligence from the product
direction; it is out of scope for Slice 1.

## Product decisions still open

These are **not** resolved by this override and must not be resolved in code:

| # | Open decision |
|---|---|
| X1 | Recommendation action semantics — what "I have done this" commits the product to. |
| X2 | Population framing — whether a finding is described against 6 creatives or 47. |
| X3 | "Angle" — definition and taxonomy. |
| X4 | Meta permissions — whether a write scope is requested while the UI states Cosmisk cannot write. See SPEC §5.1. |

**X5 — actioned-state confirmation copy — is RESOLVED.** See below.

## X5 — RESOLVED. What the actioned state may say

**Decision.** Slice 1 does not persist a learning baseline and does not evaluate the outcome of
the recommendation. The purpose of the actioned state is **only** to confirm that the user took
the recommended action.

The actioned state must **not** claim that a baseline has been persisted or locked, that Cosmisk
has evaluated the outcome, that Cosmisk will automatically adjust its model from this action, or
that learning has occurred.

**Authorized final copy, verbatim:**

> Recorded — this confirms the recommended action was taken. Cosmisk has not evaluated the
> outcome yet. Outcome tracking will come later.

This supersedes SPEC SCREEN 9 item 15. Because no baseline is locked, exactly **one** of the five
loop stages may complete: *Action recorded*.

§10's rule that matters most — *"Clicking 'I have done this' does NOT mean Cosmisk has learned
anything. It means the user has confirmed the recommended action was taken. Nothing more."* — is
unchanged and is what this copy implements.

## Conformance status

**Partial. The prototype conforms on the First Aha screen and does not conform on the Dashboard.**

| Prototype screen | Status |
|---|---|
| First Aha (`aha.component.ts`) | **Conforms.** The actioned state completes one stage only — *Action recorded*. Stage 2 renders *Today's numbers* and stays pending. The confirmation copy is the authorized X5 text. This screen is the honesty reference. |
| Dashboard (`dashboard.component.ts`) | **Does not conform.** In the actioned state it renders a lead card claiming *"Your action is recorded and the baseline is locked"* and a loop line reading *"Recorded → baseline locked → observing (first read in 3 days) → verdict on day 7 → Cosmisk adjusts"*. This asserts a persisted baseline, scheduled observation and active outcome measurement — three of the seven claims Override 1 prohibits. It is the rendering of SPEC SCREEN 10, which is itself superseded. |

An earlier conformance check recorded the prototype as fully conformant. **That check was wrong.**
It tested the dashboard in its default state, where the non-conforming card does not render, and
its prohibited-phrase list did not include these phrasings. The finding above supersedes it.

**Consequence for a developer.** The prototype remains the visual and interaction reference for
every screen. It is the honesty reference **only on the First Aha screen.** The Dashboard actioned
state must not be reproduced in the production implementation. Build the Dashboard actioned state
to Override 1 and X5, not to the prototype and not to SPEC SCREEN 10.

The prototype has not been altered to fix this, by instruction. It is recorded here instead.
