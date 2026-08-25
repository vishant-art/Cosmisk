# COSMISK — SLICE 1 DEFINITION OF DONE

**Status:** Assembled for developer handoff. Contains no new requirements.

There are **two** approved Definitions of Done for Slice 1, and they are not duplicates of each
other. Both must hold. This document reproduces both, marks where the Slice 1 Decision Override
changes an item, and does not add anything to either.

| Part | Source | What it judges |
|---|---|---|
| **Part A** | `DEVELOPER_DIRECTION.md` §10 | The **system**: ownership, isolation, security, data hygiene, and behavioural verification. |
| **Part B** | `SLICE_1_DEVELOPER_SPEC.md` § Definition of Done | The **experience**: journey, output quality, honesty, states, consistency, hierarchy, craft. |

Part A is the one that decides whether the slice is real. Part B is the one that decides whether
it is Cosmisk. Neither substitutes for the other.

Acceptance criteria — the observable behaviours these are checked against — are in
`DEVELOPER_DIRECTION.md` §9 (27 items). They are referenced here, not restated.

---

# PART A — System Definition of Done

*Verbatim from `DEVELOPER_DIRECTION.md` §10. Annotations are marked and are not part of it.*

This slice is complete when all of the following are true.

### Functional

- A person can sign up, complete onboarding, connect Meta, select an account, run an analysis,
  and see a real account-specific finding — on a clean environment, with no seed data, no demo
  mode, and no developer assistance.
- The same person, on a second session, sees their brand, their account and their prior finding,
  and no one else's.

### Structural

- One brand-identity model is in use across the application. The other four are demoted to
  display-only or unreachable, and no code path consults them for identity.
- Every ownership fallback identified in the audit has been removed — not made more robust,
  removed. Where identity cannot be resolved, the operation fails.
- No route on the Slice 1 path can be induced to return data outside the caller's ownership.
- No route registered in the deployed application lacks authentication without a deliberate,
  recorded decision.

### Security

- All eleven requirements in §6 hold. *(→ `DEVELOPER_DIRECTION.md` §6)*
- No real customer data remains in the codebase.
- The application fails to start in production with any secret missing or defaulted.

### Product

- All twenty-seven acceptance criteria in §9 are demonstrably met.
  *(→ `DEVELOPER_DIRECTION.md` §9)*
- The implemented UX matches the approved prototype, or every difference is documented with its
  reason and has been reviewed.
- Nothing from §8 has been built, and nothing has been built in anticipation of it.
  *(→ `DEVELOPER_DIRECTION.md` §8, Out of scope)*

### Verification

**These four are the behavioural gate. Code review does not satisfy them.**

- The end-to-end path has been exercised on a clean environment by someone who did not implement
  it.
- Cross-tenant isolation has been verified for brand access, analysis retrieval, analysis
  listing, and AI context — by observing behaviour, not by reading code.
- The first finding has been reviewed against the Constitution's standard: **could this have been
  written without reading this specific account?** If yes, this slice is not done, regardless of
  how much of the rest passes.

> **Annotation — why these are called out.** Each of the three names a way the slice can appear
> done and not be. A clean environment defeats "it works on my machine and my seed data". An
> independent tester defeats the implementer's knowledge of which path to take. Behavioural
> isolation testing defeats "the code looks right" — the four surfaces named (brand access,
> analysis retrieval, analysis listing, AI context) are enumerated because they fail
> independently. And the account-specificity review is stated as overriding everything else in
> the document.

### Explicitly not required

- Historical analysis records need not be preserved or repaired. Their disposition is a pending
  product decision.
- Demo mode need not function. It must not reference real customer data.
- The learning loop need not operate. It must not be claimed.

---

# PART B — Experience Definition of Done

*Verbatim from `SLICE_1_DEVELOPER_SPEC.md` § Definition of Done. Override annotations are marked.*

Slice 1 is done when **all** of the following are objectively true. Each is checkable by someone
who was not in the conversation.

### Journey

1. A user can go from landing on the app to their first piece of intelligence without a dead end,
   an unhandled state, or a control that does nothing unexpectedly.
2. The full click path works: `/proto` → Login → Dashboard, and Signup → Onboarding 1 →
   Onboarding 2 → Connect → Discovery → Processing → Aha → (action) → Dashboard → Ask.
3. Every screen is directly addressable and renders correctly when opened cold.
4. The signup promise — first finding in under three minutes — is honoured by the flow.

### Output quality

5. Every intelligence output visually and linguistically separates **measured evidence** from
   **Cosmisk's interpretation**.
6. Every finding carries: severity, confidence, the evidence base it was drawn from, at least one
   alternative reading, and a caveat.
7. Every recommendation is a **concrete action** a competent operator can execute today, with an
   effort estimate — never "review", "consider", or "optimise".
8. Every projection is shown as auditable steps with its assumption adjacent, never as a single
   confident number.
9. A user reading the finding can articulate **why** Cosmisk reached its conclusion without asking
   anyone.
10. No output on any screen could have been written without reading this specific account.

> Items 5–10 are expanded, with their sources, in `INTELLIGENCE_OUTPUT_STANDARD.md`.

### Honesty

11. Demo and sample data are labelled wherever they appear.
12. Every simulated behaviour carries a visible disclaimer.
13. No unbuilt capability is presented as available. Unbuilt affordances are visibly disabled and
    labelled.

    > **Override 1 applies this item to the COSMISK CHECKS ITSELF block.** The block is retained
    > as a statement of future capability and must carry an explicit future/unavailable label.
    > *(→ `SLICE_1_DEVELOPER_SPEC.md` § Slice 1 Decision Override)*

14. ~~Recording an action never claims that learning has occurred. Loop stages 3–5 are never shown
    as complete.~~

    > **RETAINED AND TIGHTENED by Override 1.** Read as: *Recording an action never claims that
    > learning has occurred. Loop stages **2–5** are never shown as complete.* Because Slice 1
    > persists no baseline, stage 2 (*Baseline locked*) may not complete either. At most one stage
    > — *Action recorded* — completes.
    >
    > The authorised actioned-state copy is fixed (X5, RESOLVED):
    >
    > > Recorded — this confirms the recommended action was taken. Cosmisk has not evaluated the
    > > outcome yet. Outcome tracking will come later.

15. Nothing on screen claims Cosmisk cannot write to the ad account while a write scope is
    requested.

    > **Open decision X4** governs whether a write scope is requested at all. This item holds
    > either way: the UI copy and the requested scopes must agree. Raise X4; do not settle it by
    > choosing a scope.

### States

16. Loading, empty, error and success states are **defined and built** for every screen that can
    have them.
17. The empty state gives a number and a threshold, not a vague wait.
18. The error state names the likely cause and offers exactly one recovery action.

### Consistency

19. The demo data is deterministic: the same click path produces the same output every time.

    > **Open decision #3** in `DEVELOPER_DIRECTION.md` — what the demo data source is, and
    > therefore whether every visitor sees the same findings — is unresolved and bears on this
    > item. **Open decision #4** — whether demo mode ships in this slice at all — bears on whether
    > this item is in play.

20. Every number is arithmetically consistent across the Aha screen, the dashboard and the Ask
    answer. No two visible numbers can contradict each other.

### Hierarchy

21. The dashboard leads with intelligence; metrics appear below and are labelled as reference.
22. There is exactly one lead finding, and secondary findings look secondary.
23. Ask Cosmisk answers follow the same output structure as findings — it is the same
    intelligence, not a separate chat feature.

### Craft

24. The Aha screen fits one 1440×900 screen in both its default and actioned states.
25. No horizontal overflow at 1440, 1024 or 390 px on any screen.
26. Prototype-only affordances (the dashboard view-state switcher) are removed from anything that
    ships.

---

**If a developer cannot find the answer to a question in this document or in the Constitution,
the correct action is to raise it. It is never to decide.**

*(closing rule of `SLICE_1_DEVELOPER_SPEC.md`, reproduced)*

---

# How the two parts interact

Part A item *"All twenty-seven acceptance criteria in §9 are demonstrably met"* and Part B items
5–15 overlap deliberately: §9's Product criteria 21–27 are the observable form of Part B's output
quality and honesty rules. Satisfying one does not exempt the other — §9 is checked by exercising
the product, Part B is checked by reading what it produced.

Where they differ in strictness, the stricter applies. Two known cases:

| Topic | Part A (§9) | Part B | Which governs |
|---|---|---|---|
| Learning claims | criterion 26 — no copy claims learning from outcomes or validating predictions | item 14, as tightened by Override 1 — stages 2–5 never complete | **Both.** Item 14 is the specific rendering rule; criterion 26 is the general copy rule. |
| Account specificity | criterion 21 — the finding would not read identically for another advertiser | item 10 — *no output on any screen* could have been written without reading this account | **Item 10.** It covers every screen, not only the finding. |

Part A's Verification section is the last gate. It is passed by a person, on a clean environment,
who did not write the code — not by a test suite.
