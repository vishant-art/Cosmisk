<!--
  PROVENANCE NOTE — added during handoff packaging. Not part of the approved document.

  This document was authored and approved during the Slice 1 definition work but was never
  written to disk before the working copy was lost. It was recovered verbatim from the session
  transcript (`50e5e259-3b36-47a0-aa0a-26db5fe70fcd.jsonl`, md5 b4e5c9e3836e20ebaa887a6ec1a84b45).
  The body below this note is the recovered text, unmodified.

  Three things to know before reading, none of which change the body:

  1. The header below cites `main` @ `2ef777da`. `main` has since advanced to `6a89901a`.
     The audit findings in §3 and §5 were made against `2ef777da` and must be re-confirmed
     against current `main` before work starts. Re-confirming is not the same as re-deciding.

  2. Open decision #1 at the foot of this document — whether onboarding keeps the
     competitor-capture step — has since been RESOLVED. It is out of Slice 1.
     See UX_CONSTITUTION.md § Slice 1 Decision Override → Override 2. Open decisions
     #2, #3 and #4 remain open.

  3. §7's "Honest learning-loop behaviour" requirement has since been formalised as a locked
     decision with an explicit list of prohibited claims and authorised actioned-state copy.
     See UX_CONSTITUTION.md § Slice 1 Decision Override → Override 1 and X5.

  The body is unchanged. Where it conflicts with the Slice 1 Decision Override sections,
  the Override wins for Slice 1.
-->

# COSMISK — DEVELOPER DIRECTION DOCUMENT
### First Implementation Slice
**Status:** Direction. Not an implementation plan. No code prescribed.
**Codebase:** `main` @ `2ef777da`
**UX source of truth:** approved Slice 1 prototype (`/proto/onboarding`, `/proto/discovery`, `/proto/aha`, `/proto/dashboard`, `/proto/ask`) and the Product/UX Constitution.

---

# 1. OBJECTIVE

Make one path through Cosmisk coherent, trustworthy and account-specific:

```
USER → BRAND → META ACCOUNT → ANALYSIS → FIRST ACCOUNT-SPECIFIC FINDING
```

That is the entire slice.

The codebase already contains substantially more functionality than this path requires — roughly 35 feature routes in the web app and 40+ route files in the API. **None of that is the objective.** The objective is that a person who signs up today can reach one real, specific, evidence-backed finding about their own ad account, and that the system can prove that finding belongs to them.

Two things must be true at the end, and they are equally load-bearing:

1. **The path works.** A new user completes it without a developer intervening, without seed data, and without demo mode.
2. **The path is provably theirs.** Every record created along it has one unambiguous owner, and no request can reach a record it does not own.

Today neither is true. The path only completes because of fallbacks that substitute a developer's credentials and arbitrary database rows for real ownership. Those fallbacks are the reason the experience feels fragmented — not missing features.

**This is a correctness and coherence slice, not a feature slice.** Success is measured by things becoming *fewer* and *unambiguous*, not by things being added.

---

# 2. USER EXPERIENCE

The approved prototype is the specification. Build what it shows. Do not add screens, do not add steps, do not add configuration surfaces.

### The journey

**Login / Signup**
Existing behaviour is adequate. Google SSO is currently disabled in the codebase and stays disabled for this slice — it is not part of the approved path.

**Onboarding**
The prototype shows a short capture of brand basics followed by connecting Meta. The user tells us who they are and which ad account to look at. Nothing else.

> **Deviation to resolve, not to decide unilaterally.** The prototype onboarding is shorter than what `main` currently implements. `main` runs three steps plus a confetti screen and collects three competitor names. Competitor capture is not in the approved Slice 1 UX and Competitor Spy is out of scope (§8). Developers must **flag this and stop**, not quietly keep it or quietly delete it. Removing a screen users currently see is a product decision.

**Brand**
At the end of onboarding the user has exactly one brand. The user is never asked to "create a brand" as a separate act — the brand is the natural consequence of telling us who they are. The word "brand" may not even appear in the UI. But underneath, a brand record now exists, and it is the thing everything else attaches to.

**Meta connection**
The user authorises Meta and picks one ad account from the accounts they actually have access to. The account they pick becomes this brand's account. The prototype treats this as a single decisive moment, not a settings page — preserve that.

**Analysis**
The prototype's discovery screen. Cosmisk reads the connected account and works. The screen must be honest about what is happening; it may not fabricate progress. If analysis takes time, the screen says what is being examined, using the user's own account details.

**First finding**
The prototype's "aha" screen. One finding. Specific to this account. Structured per the Constitution's required finding shape. It carries an explicit action state — the user can mark that they have acted on it, and the system records that.

### Rules for this section
- Reference the prototype. Do not reinterpret it.
- Do not invent intermediate screens to solve technical problems. If the backend needs a step the UX does not show, that is a backend problem.
- If a constraint genuinely forces a UX change, **raise it as a flagged deviation with the reason.** Silent UX drift is the failure mode this document exists to prevent.

---

# 3. CURRENT TECHNICAL PROBLEM

The system does not have one answer to the question *"whose data is this?"* It has five, and they disagree.

### Five competing notions of "brand"

| Model | What it keys on | Written by | Read by |
|---|---|---|---|
| `users.brand_name` / `users.website_url` | free text typed at onboarding | onboarding + settings | settings screen |
| `users.active_brand` | **a name in one place, an ID in another** | API writes a name; a seed script writes an ID | account and brand services |
| `brands` table | a real primary key with a `user_id` | **nothing at runtime** — only a manual seed script | the audit engine, the agent runner, audit listings |
| `/brands/list` endpoint | a Meta `business_name` string | not persisted at all — recomputed per request | the web app's brand picker |
| Python AI layer | an `account_id`, with brand identity defaulting to it | the AI layer itself | AI data scoping |

The most consequential fact in this table: **the `brands` table — the only one of the five with a real owner column — is never populated by any request path.** It has no writer outside a seed script. The audit engine looks a brand up there, misses, and falls through to a fallback that manufactures one from any string beginning with `act_`. So on a real signup, the fabricated brand is not an edge case. It is the only path that runs.

The `users.active_brand` column stores a display name when written by the API and a primary key when written by the seed script. Any code reading it is guessing which it got.

The endpoint the web app calls to list brands never touches the brands table. It reads the user's Meta token, calls Meta, and groups ad accounts by business name. The UI's entire concept of "brand" is a transient string derived from a third party.

### What that fragmentation causes

- **Analysis has no owner.** Audit records carry a brand reference with no foreign key and no user column. There is no way to determine who an audit belongs to from the audit itself.
- **Ownership is resolved by guessing.** When the brand lookup fails, the audit engine assigns ownership by taking the first row from an unordered `SELECT ... LIMIT 1` on an unrelated table. Which tenant an audit is attributed to is non-deterministic.
- **Analysis reads the wrong account entirely.** The audit engine fetches its Meta credentials by looking up a single hardcoded developer email address. Every audit, for every user, is run with one person's credentials against one person's accounts.
- **Retrieval is not scoped.** Fetching an analysis by ID applies no ownership condition. Listing analyses applies a tenant filter only if the caller volunteers one — omit it and the response spans tenants.
- **The AI layer accepts its tenant from the client.** Brand identity arrives as an unvalidated request header, and where absent, the layer synthesises one from the account ID.
- **Demo mode points at a real customer.** The compiled-in default demo ad account is a live customer account, and a real customer's business context — account, average order value, competitors, geographic segments — is hardcoded in the codebase.
- **Three route files register handlers with no authentication at all.** They are outside this slice's path, but they are in the same deployed process.

### The shape of the problem

Every one of these is the same mistake repeated: **a fallback was added so that something would work during development, and the fallback became the production path.** The fabricated brand, the hardcoded email, the `LIMIT 1` owner, the shared demo token, the client-supplied brand header — each is a stand-in for identity that was never wired up.

This slice removes the stand-ins and wires up identity. Most of the work is deletion.

---

# 4. TARGET SYSTEM BEHAVIOR

Behaviour, not implementation. Developers choose how.

### The canonical chain

**Brand is the tenant.** It is the only identity that may appear in an API parameter. An ad account ID, a brand name, or any free-text string is an *attribute* of a brand — never a key, never an identifier a caller may supply to select data.

```
USER  →  BRAND  →  META ACCOUNT  →  ANALYSIS  →  AI CONTEXT
```

### What must be true

**Identity**
- Every authenticated user who has completed onboarding has exactly one brand.
- Every brand has exactly one owning user. A brand with no owner cannot exist.
- No identity is ever inferred from a display name, a business name returned by a third party, a free-text field, or a string pattern.
- If a brand cannot be resolved and verified as belonging to the caller, the request fails. It does not fall back.

**Meta connection**
- A Meta credential belongs to the *user* — it is a personal credential, not a brand asset. This is already correct and should stay that way.
- A brand records *which ad account* to read. The credential to read it with comes from the brand's owning user.
- An ad account may be bound to a brand only after the system has confirmed that the connecting user genuinely has access to that account — confirmed against Meta, at the moment of binding, not asserted by the client.
- One ad account belongs to one brand. Two users cannot both claim the same account.

**Analysis**
- Every analysis is created with an explicit owner recorded on the analysis itself.
- Analysis runs against the account bound to the brand, using the owning user's credentials. Never a shared credential. Never a developer's credential. Never a credential resolved by database lookup on a fixed identity.
- An analysis can be retrieved only by the user who owns it. There is no unscoped listing.
- If credentials are missing or the account is unreachable, analysis fails visibly. It does not substitute another account's data.

**AI context**
- The AI layer never determines its own tenant. It receives an authorised brand context from the application layer and rejects requests without one.
- Brand identity is never derived from an account ID, and never accepted from a client-supplied header.
- Ad account identity used by the AI layer is resolved server-side from the authorised brand, not taken from the request.

**Demo**
- Demo traverses the identical ownership chain — a real user record, a real brand record, the same authorisation checks. Nothing in the authorisation path may branch on whether a request is demo.
- The only thing demo substitutes is the *data source*. If demo requires an authorisation exception, the design is wrong.
- No real customer's account, credentials, or business context exists anywhere in the codebase.

**Failure behaviour**
- Missing ownership is an error, not a prompt to guess.
- A request for a record the caller does not own is indistinguishable from a request for a record that does not exist.

---

# 5. REQUIRED DEVELOPER WORK

Six areas. Sequencing matters — see §10.

## A. User → Brand ownership

**What must change conceptually.** Onboarding must produce a canonical brand record owned by the authenticated user. Right now it produces free text on the user row and nothing else. The brand record is the missing link that everything downstream is currently faking.

**Why it matters.** This is the single change that stops four of the six problem classes. The fabricated-brand fallback, the arbitrary-owner fallback, and the unowned-analysis problem all exist because there is no brand record to find. Create it and they become unreachable.

**Expected behaviour.** Completing onboarding yields exactly one brand, owned by the authenticated user, with a real identifier. That identifier is what every subsequent request uses. The existing free-text fields remain for display only and are never consulted for identity again.

**What must NOT be done.**
- Do not introduce a brand-selection or brand-creation screen. The prototype has none. The brand is a consequence of onboarding, not a task.
- Do not build multi-brand or agency support. One brand per user in this slice.
- Do not migrate or reinterpret `users.active_brand`. It holds two incompatible value types. Freeze it and stop reading it. Deleting it before auditing every reader is a larger risk than leaving it inert.
- Do not delete the existing free-text fields. Demoting them is sufficient and reversible.

## B. Brand → Meta ownership

**What must change conceptually.** Binding an ad account to a brand must be a verified act. The system must confirm with Meta that the connecting user actually has access to the account being bound, and record the binding on the brand.

**Why it matters.** Today the account identifier is accepted from wherever it appears — a request body, a fabricated string, a compiled-in default. The Meta permission boundary happens to block most misuse in the normal path, but the application has no independent record of who is entitled to what.

**Expected behaviour.** The user sees only accounts they genuinely have access to. Selecting one binds it to their brand. The binding is verified at the moment it is made and stored. Afterwards, no request needs to supply an account identifier — it is resolved from the brand.

**What must NOT be done.**
- Do not change how Meta credentials are stored or keyed. Keying them to the user is correct.
- Do not accept an ad account identifier as an API parameter after this change. Accepting it is what makes verification bypassable.
- Do not support multiple ad accounts per brand in this slice.
- Do not request additional Meta permission scopes. Read access is what this slice needs.

## C. Brand → Analysis ownership

**What must change conceptually.** An analysis must record its owner and be retrievable only by that owner. Analysis must run with the owning user's credentials against the brand's bound account.

**Why it matters.** This is where the fragmentation becomes a data-exposure problem rather than a correctness problem. It is also where the product promise breaks: an analysis run with a developer's credentials against a developer's accounts cannot produce an account-specific finding, no matter how good the analysis logic is. **§7's requirements are unachievable until this is fixed.**

**Expected behaviour.** Requesting an analysis resolves the brand, confirms the caller owns it, uses that owner's credentials, reads that brand's account, and stores the result with an explicit owner. Retrieving an analysis returns it only to its owner. Listing analyses returns only the caller's, always, with no way to widen the scope.

**What must NOT be done.**
- Do not preserve any fallback that resolves credentials or ownership when the proper lookup fails. Every such fallback must be removed, not made smarter. **Failing loudly is the required behaviour.**
- Do not add a "run analysis for account X" capability. Analysis targets a brand.
- Do not change what the analysis engine computes. Only where its inputs come from and who owns its outputs.
- Do not attempt to repair historical analysis records by inferring owners. Prior ownership was assigned non-deterministically; inference propagates errors. Whether historical records are discarded is a product decision — raise it, do not decide it.

## D. Brand → AI context

**What must change conceptually.** The AI layer must be told which brand it is serving, by the application, with authorisation already established. It must not decide, default, or infer.

**Why it matters.** An AI layer that accepts its tenant from the client has no tenant boundary. And an AI layer that defaults brand identity to an account identifier collapses two distinct concepts into one, which is the same category error as the five competing models in §3.

**Expected behaviour.** The application resolves the brand, confirms ownership, resolves the account from the brand, and passes an authorised context. The AI layer refuses requests lacking one. Client-supplied tenant hints are ignored entirely.

**What must NOT be done.**
- Do not change the AI layer's grounding rules, its prompt, or what it is permitted to say. Those are §7 concerns and are out of scope here.
- Do not change AI functionality. Only how it learns whose data it may read.
- Do not ship the application-side and AI-layer changes separately. The AI layer's current default is load-bearing; removing it before the application supplies context breaks all AI requests.

## E. Demo / test-data isolation

**What must change conceptually.** Demo must stop being a credential-sharing mechanism and become a data-substitution mechanism.

**Why it matters.** Demo currently means "use a shared credential and default to a specific ad account." That account is a real customer's. Beyond the obvious exposure, this design is the reason a demo user can reach data through paths a real user cannot — the authorisation boundary differs between demo and real, which means demo does not test the real system.

**Expected behaviour.** A demo user has a real user record, a real brand record, and passes the same authorisation checks as anyone else. The brand's account identifier is synthetic and cannot collide with or resolve to a real account. Only the data source differs.

**What must NOT be done.**
- Do not point the demo default at a different real account. Remove the concept of a default real account.
- Do not add authorisation exceptions for demo. If demo needs one, the design is wrong.
- Do not decide the demo data strategy — static fixture, generator, or scrubbed export. That determines whether every visitor sees identical findings, which is a product decision. **Raise it; do not choose.**
- Do not ship demo mode partially enabled. Off is acceptable for this slice. Pointing at a real customer is not.

## F. Authorization boundaries

**What must change conceptually.** Every endpoint on the Slice 1 path must resolve identity from the authenticated session and verify ownership before touching data. Authentication alone is not authorisation — several endpoints today require a valid session and then apply no ownership condition whatsoever.

**Why it matters.** Areas A–E establish correct ownership in the data. This area ensures the API actually enforces it. Without F, the other five produce accurate ownership records that nothing consults.

**Expected behaviour.** One ownership condition, applied uniformly. A request for something the caller does not own behaves identically to a request for something that does not exist. No endpoint accepts a tenant identifier that widens its own scope.

**What must NOT be done.**
- Do not build a permissions framework, a roles system, or a policy engine. This slice needs one condition applied consistently.
- Do not leave route files that register handlers without authentication in the deployed process. They are outside this slice's path, but they are inside the same application, and their presence voids every guarantee in this document. **Disabling their registration is in scope; rewriting them is not.**
- Do not change response shapes for legitimate requests. This should be invisible to a correctly-behaving client.

---

# 6. SECURITY REQUIREMENTS

Stated as required behaviour.

1. **Every request that reads or writes tenant data resolves the tenant from the authenticated session.** A tenant identifier supplied by the client may be used to *narrow* a query, never to *select* what the query reaches.

2. **Ownership is verified before data is touched, not filtered afterwards.** Constructing a response and then removing rows the caller may not see is not acceptable.

3. **Unauthorised and non-existent are indistinguishable.** Responses must not reveal whether a record exists.

4. **Listing endpoints are scoped by default.** The absence of a filter parameter must never widen scope. An unscoped query over a multi-tenant table is a defect regardless of what the caller intended.

5. **Credentials are per-user and are never substituted.** No shared credential, no developer credential, no credential resolved by lookup on a fixed identity. If the correct credential is unavailable, the operation fails.

6. **Credentials never travel in URLs.** Session tokens must not appear in query strings, redirect parameters, or third-party callback state — those are recorded in server logs, browser history and referrer headers outside our control.

7. **Third-party callback flows use an unpredictable, single-use value for state, verified on return.** Its only purpose is to prove the callback corresponds to a request this application initiated.

8. **Access to an external account is verified with the external provider at the moment of binding**, and the verified binding is recorded. Later requests rely on the stored binding, not on client assertions.

9. **No production secret has a working default.** A missing or default-valued secret must prevent the application from starting. This guard must cover every location a secret is read, not only the central configuration module.

10. **No real customer's identifiers, credentials, or business data appear in source, defaults, fixtures, or tests.**

11. **Every route registered in the deployed application requires authentication**, or is deliberately and explicitly public. There is no third category.

---

# 7. UX / PRODUCT REQUIREMENTS

These come from the approved prototype and the Product/UX Constitution. They are not negotiable, and several become achievable *only* after §5's work lands.

**Account-specific intelligence.** The Constitution's test is the standard: *if an output could have been written without reading this specific account, it does not ship.* A finding that names no campaign, cites no number from this account, and would read identically for any advertiser is a failure — regardless of whether it is technically true. Note that this is currently impossible: analysis runs against a developer's accounts. §5.C is a prerequisite for this requirement, not a parallel concern.

**Evidence-backed findings.** Every finding carries the specific numbers it was derived from, drawn from this account. Numbers come from the data, never from the language model.

**Evidence versus interpretation, visibly separated.** What the data shows and what Cosmisk concludes from it are different claims and must be presented as different claims. Where Cosmisk is interpreting rather than reporting, it says so. Where Cosmisk cannot see something relevant, it says that too. The existing interpretation caveat mechanism is the pattern — preserve it.

**Required finding structure.** The Constitution defines the ordered block structure a finding must take. Blocks may be compressed for smaller surfaces. They may not be reordered, and the leading blocks may not be omitted. This structure is how the finding is *generated*, not a template applied afterwards.

**Real versus demo data, unambiguously distinguished.** A user must never be uncertain whether they are looking at their own account. This must be evident from the interface, not inferable from the data.

**No generic AI commentary.** Output that restates best practices, or that could have been produced without the account, does not ship. This applies to the analysis screen and the finding equally.

**Explicit action state.** The prototype shows the user marking that they have acted. That state is recorded and reflected. A finding is either awaiting action or acted upon — never ambiguous, never silently changing.

**Honest learning-loop behaviour.** The codebase contains a recommendation lifecycle with evidence, confidence, predicted outcomes and validation — but nothing in the UI drives it. **This slice does not wire it up, and therefore this slice must not claim it.** No copy may state or imply that Cosmisk is learning from outcomes, tracking predictions, or improving from feedback. Claiming a loop that does not close is the most damaging thing this product can do to its own credibility. If a prototype screen implies learning, flag it rather than implementing a partial version.

**No UX drift.** Build what the prototype shows. If a constraint forces a change, flag it with the reason and stop. Do not resolve it in code.

---

# 8. OUT OF SCOPE

Explicitly excluded. Not deferred-with-a-plan — excluded from this slice entirely.

- Creative Studio, UGC Studio, Director Lab, Graphic Studio, Ad Command
- Competitor Spy and competitor capture during onboarding
- Reports
- Advanced Analytics, Attribution, Lighthouse
- Autonomous agents, Autopilot, automations, watchdogs
- The full learning engine — recommendation lifecycle, prediction validation, pattern transfer, strategic memory
- Dashboard expansion beyond what the prototype shows
- Multi-brand, multi-account, agency and team functionality
- Google Ads, TikTok, Shopify connections
- Billing
- Google SSO
- Any new product feature

Additionally out of scope as *work*, though noted:

- **Rewriting the unauthenticated route files.** Preventing their registration is in scope (§5.F). Fixing them is not.
- **Repairing historical analysis records.** Whether they are retained or discarded is a product decision to be raised.

**Do not build against these.** Do not add extension points, configuration hooks, or abstractions in anticipation of them. If a decision in this slice makes one of them harder later, that is acceptable — they will be designed properly when they are in scope.

---

# 9. ACCEPTANCE CRITERIA

Observable behaviour. Each is verifiable by someone using the product or exercising the API without reading source.

### Ownership chain
1. A new user completes onboarding and has exactly one brand, without any manual setup, seed data, or developer intervention.
2. Every brand in the system has an owning user. None is ownerless.
3. A user's brand cannot be accessed, listed, or referenced by any other user. Attempts are indistinguishable from requesting something that does not exist.
4. No brand can be brought into existence by supplying an identifier in a request. Brands originate from onboarding only.

### Meta connection
5. A user sees only ad accounts they genuinely have access to.
6. An ad account cannot be bound to a brand unless the connecting user's access to it has been confirmed with Meta.
7. An ad account bound to one user's brand cannot be bound to another user's brand.
8. After binding, no request needs to supply an ad account identifier, and supplying one does not change what data is returned.

### Analysis
9. An analysis reads the ad account bound to the requesting user's brand, using that user's credentials — verifiable because the returned figures match that account and no other.
10. Every analysis has an owner recorded on it.
11. An analysis cannot be retrieved by anyone other than its owner, by any means, including direct identifier access.
12. Listing analyses returns only the caller's, with no parameter that widens the result.
13. When credentials are missing or the account is unreachable, analysis fails visibly. It never returns data from a different account.

### AI context
14. The AI layer serves only the brand the application authorised.
15. Client-supplied tenant identifiers have no effect on what data the AI can reach.
16. A request reaching the AI layer without authorised brand context is rejected.

### Demo and data hygiene
17. No real customer's ad account identifier, credentials, or business context exists anywhere in source, configuration defaults, fixtures, or tests.
18. Demo mode is either off, or operates on synthetic data through the identical authorisation path as a real user.
19. A user can always tell whether they are viewing their own account or demo data.
20. The application refuses to start in production if any secret is missing or at a default value, for every location a secret is read.

### Product
21. The first finding names this account's campaigns, creatives or figures, and would not read identically for a different advertiser.
22. The finding shows the evidence it was derived from, drawn from this account.
23. Where Cosmisk interprets rather than reports, the interface says so. Where Cosmisk cannot see something relevant, it says so.
24. The finding presents the required block structure in the required order.
25. The user can mark a finding as acted upon, and that state persists and is reflected.
26. No copy anywhere claims that Cosmisk is learning from outcomes or validating predictions.
27. The implemented screens match the approved prototype. Every deviation is documented with its reason.

---

# 10. DEFINITION OF DONE

This slice is complete when all of the following are true.

### Functional
- A person can sign up, complete onboarding, connect Meta, select an account, run an analysis, and see a real account-specific finding — on a clean environment, with no seed data, no demo mode, and no developer assistance.
- The same person, on a second session, sees their brand, their account and their prior finding, and no one else's.

### Structural
- One brand-identity model is in use across the application. The other four are demoted to display-only or unreachable, and no code path consults them for identity.
- Every ownership fallback identified in the audit has been removed — not made more robust, removed. Where identity cannot be resolved, the operation fails.
- No route on the Slice 1 path can be induced to return data outside the caller's ownership.
- No route registered in the deployed application lacks authentication without a deliberate, recorded decision.

### Security
- All eleven requirements in §6 hold.
- No real customer data remains in the codebase.
- The application fails to start in production with any secret missing or defaulted.

### Product
- All twenty-seven acceptance criteria in §9 are demonstrably met.
- The implemented UX matches the approved prototype, or every difference is documented with its reason and has been reviewed.
- Nothing from §8 has been built, and nothing has been built in anticipation of it.

### Verification
- The end-to-end path has been exercised on a clean environment by someone who did not implement it.
- Cross-tenant isolation has been verified for brand access, analysis retrieval, analysis listing, and AI context — by observing behaviour, not by reading code.
- The first finding has been reviewed against the Constitution's standard: **could this have been written without reading this specific account?** If yes, this slice is not done, regardless of how much of the rest passes.

### Explicitly not required
- Historical analysis records need not be preserved or repaired. Their disposition is a pending product decision.
- Demo mode need not function. It must not reference real customer data.
- The learning loop need not operate. It must not be claimed.

---

## Decisions this document deliberately does not make

Developers must raise these rather than resolving them in code:

1. Whether onboarding keeps the competitor-capture step that exists in `main` but not in the approved prototype.
2. Whether historical analysis records are retained with reconstructed ownership, or discarded.
3. What the demo data source is — static fixture, generator, or scrubbed export — and therefore whether every visitor sees the same findings.
4. Whether demo mode ships in this slice at all.

**STOP.**