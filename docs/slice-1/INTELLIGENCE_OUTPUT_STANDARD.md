# COSMISK — INTELLIGENCE OUTPUT STANDARD

**Status:** Assembled for developer handoff. Contains no new requirements.

This document is a **navigational assembly**. Every rule below is drawn from an already-approved
source and is cited to it. Nothing here is new. Where a rule is quoted, the quote is verbatim.

It exists because the standard a Cosmisk finding must meet is currently spread across three
documents, and it is the single thing most likely to be missed by someone implementing the
backend rather than the screen.

**Sources, in precedence order:**

| Short name | Document | Section |
|---|---|---|
| **Constitution** | `UX_CONSTITUTION.md` | §6, §7, §10, and the Slice 1 Decision Override |
| **Direction** | `DEVELOPER_DIRECTION.md` | §7 (UX / Product requirements), §9 (Acceptance criteria) |
| **Spec** | `SLICE_1_DEVELOPER_SPEC.md` | SCREEN 8, SCREEN 9, Definition of Done, and its Slice 1 Decision Override |

Where the Slice 1 Decision Override conflicts with anything else, the Override wins **for Slice 1**.

---

## 0. The test that decides everything

> **If an output could have been written without reading this specific account, it does not
> ship.**
>
> — Constitution §6.1

This is not one criterion among many. It is the criterion the others exist to serve. The
Direction restates it as the gate on the whole slice:

> The first finding has been reviewed against the Constitution's standard: **could this have
> been written without reading this specific account?** If yes, this slice is not done,
> regardless of how much of the rest passes.
>
> — Direction §10, Verification

Apply it before applying anything else in this document. A finding that fails this test cannot
be rescued by satisfying the other nine sections.

### The shape this test is designed to catch

> "Your ROAS has decreased. Here are some possible reasons: audience fatigue, seasonality,
> increased competition, creative wear-out. You may want to review your campaigns."
>
> — Constitution §6.1, *The forbidden shape*

It is unacceptable **not because it is wrong**, but because (Constitution §6.1):

- It restates something the user already knows.
- It offers a menu of causes instead of a diagnosis.
- It is not attached to any number in this account.
- It recommends "reviewing", which is not an action.
- It cannot be wrong, so it cannot be checked, so nothing can be learned from it.

---

## 1. The First Aha — what it is

The First Aha is the first finding a user ever sees. It is the whole point of Slice 1
(Direction §1). It is not a summary, not a report, and not a list.

**One finding.** Constitution §6.4: *"One conclusion per output. If there are three findings,
that is three outputs, ranked."* Spec Definition of Done item 22: *"There is exactly one lead
finding, and secondary findings look secondary."*

**Same structure everywhere.** The required block structure below governs the finding card, the
dashboard signal, and the Ask Cosmisk answer alike. Spec Definition of Done item 23: *"Ask
Cosmisk answers follow the same output structure as findings — it is the same intelligence, not
a separate chat feature."*

**Generated, not templated.** Constitution §6.2:

> **This structure is not merely visual. It is how Cosmisk reasons.** An implementation that
> produces prose and then chops it into eight boxes has not implemented this. The generation
> step must produce the blocks.

Direction §7 says the same thing in the negative: *"This structure is how the finding is
generated, not a template applied afterwards."*

### The required block structure

From Constitution §6.2. *"Sections may be compressed for smaller surfaces; they may not be
reordered, and the first five may not be omitted."*

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

> **Block 8 is modified for Slice 1.** See §10 of this document. It is retained as a statement
> of *future* capability with an explicit future/unavailable label. No stage of it may render
> as complete.

---

## 2. Evidence

**Evidence is measured, not generated.** Direction §7: *"Every finding carries the specific
numbers it was derived from, drawn from this account. Numbers come from the data, never from the
language model."* Direction §9 criterion 22 makes it observable: *"The finding shows the evidence
it was derived from, drawn from this account."*

**How evidence is presented.** Constitution §7:

| Layer | Definition | How it is presented |
|---|---|---|
| **Measured fact** | A number read from a source. Reproducible. Cannot be argued with. | Monospace / tabular, on white, with the source and period attached. |

**The evidence base must be stated.** Constitution §7: *"Slice 1: '42 days of account history ·
47 creatives · 8 campaigns'. A pattern drawn from six creatives must say six, not imply
forty-seven."*

> This is the subject of open decision **X2** — population framing, whether a finding is
> described against 6 creatives or 47. It is not resolved. Raise it; do not settle it in code.

**Compare against this account.** Constitution §6.4: *"The account's own average and its own
history are the benchmark. Industry benchmarks are not evidence about this business."*

**Say the number and say the name.** Constitution §6.4: *"'₹4.9L a month', not 'significant
spend'."* · *"'Summer Sale 40% Off', not 'an underperforming creative'."*

**Numbers must survive being checked.** Constitution §6.5:

> **Rule:** if a user can find two numbers in Cosmisk that cannot both be true, the product has
> failed regardless of how good the reasoning was.

Spec Definition of Done item 20: *"Every number is arithmetically consistent across the Aha
screen, the dashboard and the Ask answer. No two visible numbers can contradict each other."*

---

## 3. Interpretation — and its separation from evidence

**Four layers, never confused.** Constitution §7 opens: *"A user must **never** have to guess
which of the four things they are reading."*

| Layer | Definition | How it is presented |
|---|---|---|
| **Measured fact** | A number read from a source. Reproducible. Cannot be argued with. | Monospace / tabular, on white, with the source and period attached. |
| **Inference** | Cosmisk's reading of those facts. Could be wrong. | Sentences, on a tinted panel, in the first person of the product ("Cosmisk thinks"). |
| **Hypothesis** | A candidate explanation Cosmisk has not confirmed. | Explicitly labelled as an alternative reading, with why it was not chosen. |
| **Recommendation** | A proposed action, downstream of the inference. | Its own block, visually distinct, with effort, projection and caveat. |

**The separation is structural, not decorative.** Constitution §7: *"Slice 1 implements this
literally: on the First Aha screen, Evidence is a mono/tabular card on white, and Interpretation
is a tinted accent panel with a `brain` icon, sat side by side so the difference between a
measurement and a judgement is impossible to miss."*

Direction §7 states the requirement independent of layout: *"What the data shows and what Cosmisk
concludes from it are different claims and must be presented as different claims. Where Cosmisk
is interpreting rather than reporting, it says so."*

**Hard rule.** Constitution §7: *"Cosmisk must not present uncertain inference as fact. If it is
inferred, it is written as inference and it lives in the interpretation surface."*

**Name what Cosmisk cannot see.** Constitution §6.4: *"Blind spots stated are trust. Blind spots
hidden are the reason a wrong answer destroys the relationship."* Constitution §7: *"Competitor
auction data, offline conversions, creative it cannot fetch — named, not silently excluded."*
Direction §9 criterion 23: *"Where Cosmisk cannot see something relevant, it says so."*

---

## 4. Account specificity

The gate is §0 of this document. Direction §7 adds what "specific" concretely means:

> A finding that names no campaign, cites no number from this account, and would read
> identically for any advertiser is a failure — regardless of whether it is technically true.

**This is blocked on ownership work, not on prompt quality.** Direction §7 is explicit:

> Note that this is currently impossible: analysis runs against a developer's accounts.
> §5.C is a prerequisite for this requirement, not a parallel concern.

Direction §9 criterion 21 is the observable form: *"The first finding names this account's
campaigns, creatives or figures, and would not read identically for a different advertiser."*

**Real versus demo must never be ambiguous.** Direction §7: *"A user must never be uncertain
whether they are looking at their own account. This must be evident from the interface, not
inferable from the data."* Direction §9 criterion 19 · Spec Definition of Done item 11.

**No generic AI commentary anywhere.** Direction §7: *"Output that restates best practices, or
that could have been produced without the account, does not ship. This applies to the analysis
screen and the finding equally."* — the analysis/processing screen is held to the same standard
as the finding. Direction §2: *"If analysis takes time, the screen says what is being examined,
using the user's own account details."*

Spec Definition of Done item 10: *"No output on any screen could have been written without
reading this specific account."*

---

## 5. Confidence

**Visible on every finding.** Constitution §7: *"Confidence must be visible on every finding, not
buried. Slice 1 shows 'High confidence' as a chip next to the severity chip."*

**Uncertainty is located, not smeared.** Constitution §6.4:

> **No hedging that removes the claim.** "may be", "could potentially", "it is possible that" as
> the main verb of a finding is banned. Uncertainty is expressed in the confidence and
> assumption blocks, where it is legible, not smeared across the prose.

**The assumption travels with the confidence.** Block 6 of the required structure carries both:
*"What must be true for this to hold, and how sure Cosmisk is."*

**A pattern is not a law.** Constitution §7: *"Slice 1 phrases it exactly this way: 'Cosmisk
holds that as a working pattern from six creatives, not a rule.'"*

Spec Definition of Done item 6: every finding carries *"severity, confidence, the evidence base
it was drawn from, at least one alternative reading, and a caveat."*

---

## 6. Alternative explanation

**One diagnosis, one named alternative — never a menu.** Constitution §6.4:

> **No menus of causes.** Pick one, state the alternative reading explicitly as a caveat, and say
> why the chosen one is stronger.

The approved Slice 1 instance, quoted in Constitution §6.4:

> *"One alternative reading: a competitor may have entered the same auction and pushed your CPMs
> up. Cosmisk cannot see competitor auction data yet, so frequency is the stronger explanation."*

Note what that sentence does: it names the alternative, it names the blind spot that prevents
ruling the alternative out, and it says why the chosen reading is stronger anyway. All three
parts are required. An alternative reading with no reason for rejecting it is a menu with two
items.

The hypothesis layer in Constitution §7 gives its presentation: *"Explicitly labelled as an
alternative reading, with why it was not chosen."*

---

## 7. Projection

**Arithmetic, not a number.** Block 7 of the required structure: *"The projection, shown as
arithmetic the user can audit — not one number."*

Spec Definition of Done item 8: *"Every projection is shown as auditable steps with its
assumption adjacent, never as a single confident number."*

**The projection must discount itself.** The approved Slice 1 example (Constitution §6.3):

| Block | Content |
|---|---|
| **Assumption** | Modelled at ROAS 3.5, not the 5.2 that creative does today. Efficiency almost always falls when you put 6x the budget behind one creative. Confidence: high. |
| **Expected impact** | ₹4,90,000 today → ₹9,24,000 back (blended ROAS 1.89). Same spend at 3.5 ROAS → ₹17,15,000 back. Difference: +₹7,91,000 / month, if the assumption holds. |

Constitution §6.3 names why this passes:

> it names creatives, quotes the before-value alongside the after-value, compares to the
> account's own average rather than an industry benchmark, discounts its own projection, and
> states the condition under which it is wrong.

**"If the assumption holds" is load-bearing.** A projection stated without the condition under
which it is wrong is a claim Cosmisk cannot be held to, which by §6.1's reasoning means nothing
can be learned from it.

---

## 8. Recommendation

**Concrete, today, with effort.** Spec Definition of Done item 7:

> Every recommendation is a **concrete action** a competent operator can execute today, with an
> effort estimate — never "review", "consider", or "optimise".

Block 5 of the required structure: *"One concrete action a competent operator can execute today."*

The approved Slice 1 instance (Constitution §6.3):

> Pause both and move the combined ₹4,90,000 to "₹999 for 30 Days" — highest ROAS at 5.2,
> frequency only 2.1, not budget-capped, so it has room before it saturates. Effort: 2 minutes
> in Ads Manager.

It names the creatives, names the destination, gives the reason the destination was chosen, and
states the effort. "Review your underperforming creatives" fails on all four.

**The reasoning must be reconstructable by the reader.** Spec Definition of Done item 9: *"A user
reading the finding can articulate **why** Cosmisk reached its conclusion without asking anyone."*

**Downstream of the inference, and visually separate from it.** Constitution §7 places
Recommendation in *"its own block, visually distinct, with effort, projection and caveat."*

---

## 9. Action state

**Explicit, persisted, never ambiguous.** Direction §7:

> The prototype shows the user marking that they have acted. That state is recorded and
> reflected. A finding is either awaiting action or acted upon — never ambiguous, never silently
> changing.

Direction §9 criterion 25: *"The user can mark a finding as acted upon, and that state persists
and is reflected."*

**What the action does NOT mean.** Constitution §10, *The rule that matters most*:

> Clicking "I have done this" does NOT mean Cosmisk has learned anything. It means the user has
> confirmed the recommended action was taken. Nothing more.

**Authorised actioned-state copy, verbatim** (Constitution § Slice 1 Decision Override → X5,
RESOLVED; supersedes Spec SCREEN 9 item 15):

> Recorded — this confirms the recommended action was taken. Cosmisk has not evaluated the
> outcome yet. Outcome tracking will come later.

**What the actioned state must not claim** (Constitution § X5):

- that a baseline has been persisted or locked
- that Cosmisk has evaluated the outcome
- that Cosmisk will automatically adjust its model from this action
- that learning has occurred

> Open decision **X1** — what "I have done this" commits the product to, semantically — is not
> resolved. The copy above is settled; the semantics behind it are not. Raise it.

---

## 10. Honest future / learning state

This is the section most likely to be violated by well-intentioned work, and the one with the
highest cost. Direction §7:

> Claiming a loop that does not close is the most damaging thing this product can do to its own
> credibility.

**The decision.** Constitution § Slice 1 Decision Override → Override 1:

> Slice 1 does **not** implement an active learning or self-checking loop.
>
> The loop described in §10 — Action → Baseline → Observation → Outcome → Verdict → Learning —
> remains the product direction. It is not built, and Slice 1 must not present it as built.

**Slice 1 must not present any of the following as functioning** (Override 1, verbatim list):

- a persisted learning baseline
- scheduled observation
- outcome measurement
- a post-action verdict
- "Cosmisk checked itself"
- "Cosmisk learned from the result"
- model adjustment based on an observed outcome

**What block 8 becomes.** Override 1, *Effect on §6.2*:

> The eighth block is retained as a **statement of future capability**, not as a status display
> of work in progress. It must carry an explicit future/unavailable label. No stage of it may
> render as complete.

**The permitted form of an unbuilt capability.** Constitution §13 rule 3, quoted by Override 1:

> The correct representation of an unbuilt capability is an honest label, or nothing.

Spec Definition of Done item 13: *"No unbuilt capability is presented as available. Unbuilt
affordances are visibly disabled and labelled."*

**Consequent state.** Constitution § X5: *"Because no baseline is locked, exactly **one** of the
five loop stages may complete: *Action recorded*."* Spec Override tightens Definition of Done
item 14 accordingly: **stages 2–5 are never shown as complete.**

**Do not build a partial version.** Direction §7: *"If a prototype screen implies learning, flag
it rather than implementing a partial version."* Direction §10, *Explicitly not required*: *"The
learning loop need not operate. It must not be claimed."*

Direction §9 criterion 26: *"No copy anywhere claims that Cosmisk is learning from outcomes or
validating predictions."*

---

## 11. The working example

Constitution §6.3 carries a complete worked finding, drawn from the Slice 1 prototype's
`FIRST_FINDING`. It is the reference implementation of every rule above. Read it in the
Constitution rather than from a paraphrase — it is the shortest way to calibrate.

Its arithmetic contract is stated in Constitution §6.5: *"per-creative `spend × roas = revenue`
exactly; the six shown creatives sum to ₹10.1L of the ₹18.4L account spend; the account tells one
story (spend +12.3%, revenue −0.2%, ROAS 3.6 → 3.2, waste ₹4.9L) and the finding, the dashboard
and the Ask answer must never contradict it."*

---

## 12. Checklist

Every item traces to a source above. This is a reading aid, not an additional standard.

**The gate**

- [ ] Could this have been written without reading this specific account? If yes — it does not ship. *(§0)*

**Structure**

- [ ] All eight blocks present, in order; blocks 1–5 not omitted. *(§1)*
- [ ] The blocks were generated, not produced as prose and then boxed. *(§1)*
- [ ] Exactly one lead finding. *(§1)*

**Evidence**

- [ ] Every number came from the data, not from the model. *(§2)*
- [ ] Names named, numbers stated — no "significant spend", no "an underperforming creative". *(§2)*
- [ ] Compared against this account's own average and history, not an industry benchmark. *(§2)*
- [ ] The evidence base is stated and honest about its size. *(§2)*
- [ ] No two numbers anywhere in the product can contradict each other. *(§2)*

**Separation**

- [ ] Measured fact, inference, hypothesis and recommendation are each presented as their own kind of claim. *(§3)*
- [ ] No inference is presented as fact. *(§3)*
- [ ] Blind spots are named, not silently excluded. *(§3)*

**Confidence and alternatives**

- [ ] Confidence is visible on the finding, not buried. *(§5)*
- [ ] The assumption that must hold is stated adjacent to the projection. *(§5, §7)*
- [ ] Exactly one alternative reading, labelled, with why it was not chosen. *(§6)*
- [ ] No hedging verb carries the main claim. *(§5)*

**Projection and recommendation**

- [ ] The projection is auditable arithmetic, not a single number. *(§7)*
- [ ] The projection discounts itself and states when it is wrong. *(§7)*
- [ ] The recommendation is executable today, names the target, and gives an effort estimate. *(§8)*
- [ ] A reader can reconstruct why Cosmisk concluded what it did. *(§8)*

**Action and honesty**

- [ ] Action state is explicit, persisted, and never ambiguous. *(§9)*
- [ ] Actioned-state copy is the authorised X5 text, verbatim. *(§9)*
- [ ] Block 8 carries an explicit future/unavailable label. *(§10)*
- [ ] At most one loop stage renders complete. Stages 2–5 never do. *(§10)*
- [ ] Nothing anywhere claims learning, outcome evaluation, or prediction validation. *(§10)*
- [ ] Real versus demo data is evident from the interface. *(§4)*

---

**If a rule you need is not in this document, it is in the Constitution or the Spec. If it is in
neither, it is not a rule yet — raise it. It is never to decide.**
