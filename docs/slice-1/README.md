# COSMISK — SLICE 1 DEVELOPER HANDOFF

**This is not a request to build the whole Cosmisk product. This is a request to make one core
experience production-correct.**

---

## The objective

```
USER → BRAND → META → ANALYSIS → FIRST ACCOUNT-SPECIFIC FINDING → ACTION → DASHBOARD → ASK COSMISK
```

That chain is the entire slice.

The codebase already contains far more functionality than this chain requires. None of it is the
objective. The objective is that a person who signs up today can reach one real, specific,
evidence-backed finding about their own ad account — and that the system can prove that finding
belongs to them.

Two things must be true at the end, and they are equally load-bearing:

1. **The path works.** A new user completes it without a developer intervening, without seed
   data, and without demo mode.
2. **The path is provably theirs.** Every record created along it has one unambiguous owner, and
   no request can reach a record it does not own.

Today neither is true. This is a correctness and coherence slice, not a feature slice. Success is
measured by things becoming *fewer* and *unambiguous*, not by things being added.

---

## Required reading order

Read these in this order. Each assumes the one before it.

| # | Document | What it gives you |
|---|---|---|
| 1 | [`DEVELOPER_DIRECTION.md`](./DEVELOPER_DIRECTION.md) | **The primary implementation-direction document.** What the objective is, what is technically wrong today, what work is required, security requirements, what is out of scope, 27 acceptance criteria. |
| 2 | [`UX_CONSTITUTION.md`](./UX_CONSTITUTION.md) | Why Cosmisk exists, what it is and is not, the output principles, evidence vs interpretation, and the Slice 1 Decision Override that governs the learning loop and competitor capture. |
| 3 | [`SLICE_1_DEVELOPER_SPEC.md`](./SLICE_1_DEVELOPER_SPEC.md) | Screen-by-screen behaviour for all eleven screens, states, copy, and what is real vs mocked vs future. |
| 4 | [`INTELLIGENCE_OUTPUT_STANDARD.md`](./INTELLIGENCE_OUTPUT_STANDARD.md) | What a Cosmisk-quality finding must contain. Assembled from 1–3, cited to them, adds nothing. |
| 5 | [`DEFINITION_OF_DONE.md`](./DEFINITION_OF_DONE.md) | The two approved Definitions of Done — system and experience. Both must hold. |
| 6 | **Interactive prototype** — see below | The UX reference you can click through. |

`DEVELOPER_DIRECTION.md` is the primary implementation-direction document. Where documents 4 and
5 restate something, they cite where it came from; if the citation and the assembly ever
disagree, the cited source wins.

---

## The prototype

The interactive Slice 1 prototype lives on branch **`proto/slice-1-ux`** at commit **`23a99953`**.

```bash
git checkout proto/slice-1-ux
npm install
npm run start -w @cosmisk/web
# then open https://localhost:4200/proto
```

Routes: `/proto/login` · `/proto/signup` · `/proto/onboarding` · `/proto/connect` ·
`/proto/discovery` · `/proto/processing` · `/proto/aha` · `/proto/dashboard` · `/proto/ask`

**The prototype is the visual/interaction reference. It is not the production implementation.**

It is the **honesty reference on the First Aha screen only.** That screen is the approved
rendering of the learning-loop block and the authorised actioned-state copy. When the Spec and the
prototype appear to disagree about that block, the prototype and the Slice 1 Decision Override are
correct — the Spec's original SCREEN 9 text has been superseded and says so.

> **The prototype dashboard is not conformant. Do not reproduce it.**
> In its actioned state, `dashboard.component.ts` renders *"Your action is recorded and the
> baseline is locked"* and *"Recorded → baseline locked → observing (first read in 3 days) →
> verdict on day 7 → Cosmisk adjusts"*. That asserts a persisted baseline, scheduled observation
> and outcome measurement — three of the seven claims Override 1 prohibits. It renders the Spec's
> SCREEN 10, which is itself superseded. Build the Dashboard actioned state to Override 1 and X5.
> Details in `UX_CONSTITUTION.md` § Conformance status.

**Do not merge the prototype into `main`. Do not modify `proto/slice-1-ux`.** Build the
production implementation on your own branch, against these documents.

---

## Screenshots

In [`screenshots/`](./screenshots/), in journey order. Captured from the prototype at 1440 px
wide. Reference only — the prototype itself is authoritative.

| File | Screen | Spec section |
|---|---|---|
| `01-login.png` | Login | SCREEN 1 |
| `02-signup.png` | Signup | SCREEN 2 |
| `03-onboarding.png` | Onboarding — "what this is" | SCREEN 3 |
| `04-connect-meta.png` | Connect Meta | SCREEN 5 |
| `05-brand-discovery-loading-state.png` | Brand Discovery — **loading state** | SCREEN 6 |
| `06-analysis-processing.png` | Analysis / Processing | SCREEN 7 |
| `07-first-aha-pre-action.png` | First Aha — **pre-action state** | SCREEN 8 |
| `08-dashboard.png` | Dashboard | SCREEN 10 |
| `09-ask-cosmisk.png` | Ask Cosmisk | SCREEN 11 |

**Two screens have no screenshot. Both are specified in full in the Spec — use it, not the images.**

- **SCREEN 4 — Website / brand input** (onboarding step 2). Not captured.
- **SCREEN 9 — First Aha, actioned state.** Not captured. This is the screen carrying the
  authorised X5 copy and the single completed loop stage. It is the most consequential screen in
  the slice for honesty, and there is no image of it. Read `SLICE_1_DEVELOPER_SPEC.md` SCREEN 9
  together with its Slice 1 Decision Override, and click it in the prototype.

`05-brand-discovery-loading-state.png` captures Brand Discovery **while it is still loading**
("Reading nectarsupplements.in / Working out what you sell and who buys it"), not the discovery
result. The result screen is specified in Spec SCREEN 6. These screenshots were not regenerated
for this handoff.

---

## Open product decisions

**Developers must raise these. Developers must not resolve them in code.** This list is complete
as approved; it is not to be extended here.

### From the UX Constitution and Developer Spec

| # | Open decision |
|---|---|
| **X1** | Recommendation action semantics — what "I have done this" commits the product to. |
| **X2** | Population framing — whether a finding is described against 6 creatives or 47. |
| **X3** | "Angle" — definition and taxonomy. |
| **X4** | Meta permissions — whether a write scope is requested while the UI states Cosmisk cannot write. See Spec §5.1. |

> **X5** — actioned-state confirmation copy — is **RESOLVED**. The authorised copy is fixed. See
> `UX_CONSTITUTION.md` § Slice 1 Decision Override → X5.

### From the Developer Direction

| # | Open decision |
|---|---|
| — | ~~Whether onboarding keeps the competitor-capture step that exists in `main` but not in the approved prototype.~~ **RESOLVED** — competitor capture is out of Slice 1. See Override 2. |
| **2** | Whether historical analysis records are retained with reconstructed ownership, or discarded. |
| **3** | What the demo data source is — static fixture, generator, or scrubbed export — and therefore whether every visitor sees the same findings. |
| **4** | Whether demo mode ships in this slice at all. |

Beyond this list, the standing rule from both source documents applies:

> If a developer cannot find the answer to a question in this document or in the Constitution,
> the correct action is to raise it. It is never to decide.

---

## Locked decisions you should not re-open

Two decisions were made after the source documents were written and are recorded as appended
**Slice 1 Decision Override** sections in both `UX_CONSTITUTION.md` and
`SLICE_1_DEVELOPER_SPEC.md`. Nothing above those sections was rewritten — the originals are
intact, and the Override records exactly which items it supersedes.

**Override 1 — the learning loop is not implemented in Slice 1.** It remains the product
direction. It is not built, and Slice 1 must not present it as built. Seven specific claims are
prohibited; the *Cosmisk checks itself* block is retained only as an explicitly-labelled future
capability; at most one loop stage may render as complete.

**Override 2 — competitor capture is not part of Slice 1.** Competitor Spy is not to be
implemented, and no competitor capture step is to be added to onboarding.

### Where the historical text still says "two stages" — now tabulated in both documents

An earlier draft of this README flagged **two** such passages as untabulated. A full scan then
found **fifteen**. All fifteen are now listed in the documents themselves, so a developer reading
either document in isolation encounters the supersession without needing this README:

| Document | Where the supersession list lives | Passages covered |
|---|---|---|
| `UX_CONSTITUTION.md` | § Slice 1 Decision Override → Override 1 → **Affected passages in this document** *(new)* | 8 — §3, §5 diagram, §6.3 worked example, §10 loop diagram, §10 stage table row 2, §10 "Only stages 1 and 2 can complete", §10 baseline-capture imperative, Appendix checklist |
| `SLICE_1_DEVELOPER_SPEC.md` | § Slice 1 Decision Override → Override 1 → **Affected items in this document** *(extended)* | 10 — SCREEN 8 item 16, SCREEN 9 items 1, 4, 8, 12, 13, 15, 16 ①③④⑤, SCREEN 10 actioned lead card, §13 Learning loop row, DoD item 14 |

The single rule they all reduce to: **at most one loop stage — *Action recorded* — may complete.
No baseline, observation, outcome, verdict or learning may be represented as current
functionality.**

The surrounding rule in Constitution §10 — *"Clicking 'I have done this' does NOT mean Cosmisk
has learned anything"* — is unchanged and is exactly what X5 implements. Only the stage count
and the baseline value are superseded.

Both documents now close their supersession list with a catch-all: if you find any other passage
implying a second completed stage, a locked baseline, scheduled observation, an outcome, a verdict
or learning as current functionality, it is superseded too. Raise it so it can be tabulated; do
not act on it, and do not resolve it in code.

---

## Out of scope

Listed in full in `DEVELOPER_DIRECTION.md` §8. It is an exclusion list, not a deferral list:

> **Do not build against these.** Do not add extension points, configuration hooks, or
> abstractions in anticipation of them. If a decision in this slice makes one of them harder
> later, that is acceptable — they will be designed properly when they are in scope.

---

## The one test that outranks the others

> **If an output could have been written without reading this specific account, it does not
> ship.**

If the first finding fails this, the slice is not done — regardless of how much of the rest
passes.

---

## Provenance

These artifacts were reconstructed after the original working copy was lost. Details:

- `UX_CONSTITUTION.md` and `SLICE_1_DEVELOPER_SPEC.md` are the recovered originals with the
  Slice 1 Decision Override appended. The historical text is byte-identical to the recovered
  originals.
- `DEVELOPER_DIRECTION.md` was recovered verbatim from the session transcript; it had never been
  written to disk. Its provenance note is an HTML comment at the top of the file and is not part
  of the approved document. Its body is unmodified — including the reference to `main` @
  `2ef777da`, which has since advanced. The audit findings in its §3 and §5 must be
  **re-confirmed** against current `main` before work starts. Re-confirming is not re-deciding.
- `INTELLIGENCE_OUTPUT_STANDARD.md` and `DEFINITION_OF_DONE.md` are assemblies of already-approved
  material with every rule cited to its source. They introduce no new requirements.
- Screenshots are the originals as captured. They were not edited or regenerated.
