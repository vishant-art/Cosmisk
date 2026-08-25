# Cosmisk — Slice 1 Developer Spec

**Status:** Build contract for Slice 1.
**Governed by:** `COSMISK_PRODUCT_UX_CONSTITUTION.md`. Read it first. Where this spec is
silent, the Constitution decides; where both are silent, **ask** — do not invent.
**Visual reference:** the running prototype at `apps/web/src/app/proto/`. The prototype is the
target, not a draft to improve on.

---

## 0. How to read this document

### 0.1 What this is for

A developer should not be able to say *"I wasn't sure what you wanted."* Every screen below is
documented against sixteen fixed items, and every intelligence-producing screen carries a
worked example of its expected output — so that it is clear not only **what data to display**
but **what the final experience should feel like**.

### 0.2 The sixteen items, defined

| # | Item | Means |
|---|---|---|
| 1 | Screen purpose | Why this screen exists in the product. |
| 2 | User goal | What the user is trying to achieve on it. |
| 3 | Entry condition | How the user legitimately arrives here. |
| 4 | What the user sees | Every element, in reading order. |
| 5 | Primary action | The one thing the screen wants. |
| 6 | Secondary actions | Everything else that is clickable. |
| 7 | Navigation | Where each action goes. |
| 8 | Data required | What the screen needs, and from where. |
| 9 | Real vs mocked | What is genuinely wired vs simulated for the prototype. |
| 10 | Loading state | What is shown while waiting. |
| 11 | Empty state | What is shown when there is nothing to show. |
| 12 | Error state | What is shown when it fails, and what the user can do. |
| 13 | Success state | What confirms the thing worked. |
| 14 | After the action | The state change and the next step. |
| 15 | Expected output | For intelligence screens: the actual content, worked. |
| 16 | UX acceptance criteria | Objective, checkable pass conditions. |

### 0.3 Screen inventory

| # | Screen | Route | Layout |
|---|---|---|---|
| 1 | Login | `/proto/login` | AuthLayout |
| 2 | Signup | `/proto/signup` | AuthLayout |
| 3 | Onboarding — what this is | `/proto/onboarding` (step 1) | OnboardingLayout |
| 4 | Website / brand input | `/proto/onboarding` (step 2) | OnboardingLayout |
| 5 | Connect Meta | `/proto/connect` | OnboardingLayout |
| 6 | Brand Discovery | `/proto/discovery` | OnboardingLayout |
| 7 | Analysis / Processing | `/proto/processing` | OnboardingLayout |
| 8 | First Aha | `/proto/aha` | OnboardingLayout |
| 9 | First Aha — actioned | `/proto/aha` (post-action) | OnboardingLayout |
| 10 | Dashboard | `/proto/dashboard` | ProtoShell |
| 11 | Ask Cosmisk | `/proto/ask` | ProtoShell |

> **Note on screen 5.** The brief's screen list did not name a Connect screen. It exists in
> the prototype and it cannot be removed without leaving a hole between the website input and
> brand discovery — the Meta account has to be attached somewhere. It is documented here as
> found, not as an addition. No new screens have been invented.

### 0.4 Global facts that apply to every screen

- **The prototype makes zero HTTP calls.** There is no API client, no `fetch`, no
  `HttpClient`, no `localStorage`, no auth service and no route guards anywhere under
  `apps/web/src/app/proto/`. Every delay is a `setTimeout`. Every value is a literal in
  `proto-data.ts`.
- **All state is in-memory** (`ProtoStateService`, signals). **Refreshing the browser resets
  the journey to the start.** This is intentional: every review run must be identical.
- **All routes are directly addressable.** Any screen can be opened cold for review; it will
  render with default state.
- **Currency is INR** throughout, formatted Indian-style (`₹4,90,000`, `₹18.4L`).
- **Reporting window is "Last 30 days"** on the dashboard; the finding's evidence base is
  "42 days of account history".

### 0.5 Shared state (`ProtoStateService`)

| Signal | Type | Default | Written by |
|---|---|---|---|
| `email` | `string` | `priya@nectarsupplements.in` | Login, Signup |
| `firstName` | `computed<string>` | `Priya` | derived from `email` local-part |
| `websiteUrl` | `string` | `''` | Onboarding step 2 |
| `isDemo` | `boolean` | `true` | Connect (`false` on Meta path, `true` on sample path) |
| `brand` | `DiscoveredBrand` | `DISCOVERED_BRAND` | Onboarding step 2, Brand Discovery edits |
| `hasSeenFinding` | `boolean` | `false` | First Aha (constructor) |
| `findingActioned` | `boolean` | `false` | First Aha ("I have done this") |

`patchBrand(patch)` merges a partial brand. `reset()` returns everything to defaults.

---

# SCREEN 1 — Login

**Route:** `/proto/login` · **Layout:** AuthLayout · Also the target of the `**` wildcard route.

| # | | |
|---|---|---|
| 1 | **Purpose** | Return an existing operator to their account with the least possible friction. It is a door, not an experience. |
| 2 | **User goal** | Get back in and see what changed. |
| 3 | **Entry condition** | Direct visit to `/proto` (redirects here), `/proto/login`, any unmatched route, or the "Log in" link on Signup. |
| 4 | **What the user sees** | H1 "Welcome back" · subhead "Log in to continue to Cosmisk." · Email field, prefilled `priya@nectarsupplements.in` · Password field, prefilled `cosmisk123` · Primary button "Log in" · A disabled "Continue with Google" button with `title="Not available yet"` and a "Soon" badge · Link to Signup · Prototype disclaimer. |
| 5 | **Primary action** | Log in. |
| 6 | **Secondary actions** | Go to Signup. (Google is present but disabled — see §11.8 of the Constitution.) |
| 7 | **Navigation** | Log in → `/proto/dashboard`. Signup link → `/proto/signup`. |
| 8 | **Data required** | Email, password. Writes `email` to shared state. Production: a session/token from the auth service. |
| 9 | **Real vs mocked** | **Mocked.** No credential check, no network. Any email plus a 6+ character password succeeds. The sentinel `fail@cosmisk.com` forces the error state so it can be reviewed. |
| 10 | **Loading** | 700 ms simulated delay. Button enters a busy state and is disabled; the form cannot be resubmitted. |
| 11 | **Empty** | Not applicable — a form has no empty state. |
| 12 | **Error** | Inline, above/at the form: *"That email and password combination does not match an account."* Fields retain their values. The user retries in place. Production must also handle: network failure, locked account, unverified email. **These are not defined yet — raise before building.** |
| 13 | **Success** | No success screen. The navigation to the dashboard is the confirmation. |
| 14 | **After the action** | `email` is written to shared state (which drives the dashboard greeting via `firstName`), then route to `/proto/dashboard`. |
| 15 | **Expected output** | None. Login produces no intelligence. |
| 16 | **Acceptance criteria** | ① Landing on `/proto` puts the user here. ② Submitting with prefilled values reaches the dashboard. ③ `fail@cosmisk.com` shows the error copy verbatim and stays on the page with values retained. ④ The button is disabled during the 700 ms delay and double-submit is impossible. ⑤ The Google button is visibly disabled and labelled — it is never clickable-looking. ⑥ The prototype disclaimer is visible without scrolling. |

**Prototype disclaimer (rendered verbatim):**
> Any email and a 6+ character password will log you in — nothing is sent to a server. Use
> `fail@cosmisk.com` to see the error state.

---

# SCREEN 2 — Signup

**Route:** `/proto/signup` · **Layout:** AuthLayout

| # | | |
|---|---|---|
| 1 | **Purpose** | Create an account in as few fields as possible, and set the expectation that value arrives in minutes rather than after a setup project. |
| 2 | **User goal** | Get started without committing to a long form. |
| 3 | **Entry condition** | The "Sign up" link on Login, or direct visit. |
| 4 | **What the user sees** | H1 "Create your account" · subhead "Two fields. You will see your first finding in under three minutes." · Email field, prefilled · Password field, empty, minimum 8 characters · A live password strength meter · Primary button "Create account" · Link back to Login · Prototype disclaimer. |
| 5 | **Primary action** | Create account. |
| 6 | **Secondary actions** | Go to Login. |
| 7 | **Navigation** | Create account → `/proto/onboarding`. Login link → `/proto/login`. |
| 8 | **Data required** | Email, password. Writes `email` to shared state. |
| 9 | **Real vs mocked** | **Mocked.** No account is created, nothing is persisted, no verification email is sent. |
| 10 | **Loading** | 700 ms simulated delay; button disabled and busy. |
| 11 | **Empty** | Not applicable. |
| 12 | **Error** | Client-side validation only: the primary button stays disabled until the password reaches the minimum. Production must define: email already registered, invalid email, weak-password rejection, verification-required. **Not defined yet — raise before building.** |
| 13 | **Success** | Navigation to onboarding is the confirmation. |
| 14 | **After the action** | `email` written to shared state; route to `/proto/onboarding` at step 1. |
| 15 | **Expected output** | None. |
| 16 | **Acceptance criteria** | ① The subhead promises the first finding in under three minutes and the rest of the flow must honour it. ② The strength meter updates on every keystroke and its three states render as specified below. ③ Submit is disabled below 8 characters. ④ Success reaches onboarding step 1, never the dashboard. |

**Password strength states (exact):**

| Level | Colour | Copy |
|---|---|---|
| 1 | Red | Too short — use at least 8 characters |
| 2 | Amber | Decent — add a number and a capital |
| 3 | Green | Strong password |

---

# SCREEN 3 — Onboarding, step 1 ("what this is")

**Route:** `/proto/onboarding` (step 1 of 2) · **Layout:** OnboardingLayout

| # | | |
|---|---|---|
| 1 | **Purpose** | Answer *what does this do, what does it need, what do I get, and who makes the change* — **before** asking for anything. It is deliberately not a form. |
| 2 | **User goal** | Understand what they are about to do and whether it is safe. |
| 3 | **Entry condition** | Arrives from Signup, or direct visit to `/proto/onboarding`. |
| 4 | **What the user sees** | Progress: "Step 1 of 2" and "One question", with a progress bar at 50% · H1 "Cosmisk reads your ad account and tells you the one thing that matters today." · Subhead "Not another dashboard. It looks at what you are spending, finds what is quietly losing money, and explains why." · Three panels: **What it needs** (your website address, and a connection to your Meta ad account) · **What you get** (one specific finding with the numbers behind it, and what to do about it) · **Who makes the change** (emerald, shield icon) — "You do. Cosmisk finds the problem and tells you exactly what to do — every edit happens in your Ads Manager, by you." · Primary button "Get started". |
| 5 | **Primary action** | Get started. |
| 6 | **Secondary actions** | None. There is deliberately no skip. |
| 7 | **Navigation** | Get started → step 2, in place (no route change). |
| 8 | **Data required** | None. This screen is entirely static. |
| 9 | **Real vs mocked** | **Real** — it is static content and it is final. |
| 10 | **Loading** | None. |
| 11 | **Empty** | Not applicable. |
| 12 | **Error** | Not applicable. |
| 13 | **Success** | The step counter advances to 2 of 2 and the panel cross-fades. |
| 14 | **After the action** | `step` signal → 2. Nothing is written to shared state. |
| 15 | **Expected output** | None. |
| 16 | **Acceptance criteria** | ① No input field appears on this step. ② The "Who makes the change" panel is present and states that the user makes every edit, in their Ads Manager — this is a trust commitment, not decoration, and must not be cut for space. ③ The progress indicator reads "Step 1 of 2". ④ Back is not offered on step 1. |

**Design decisions already made — do not revisit without approval:**

- The onboarding was cut from four steps to two. The removed step-4 confetti screen celebrated
  the user typing rather than Cosmisk discovering anything; the real celebration is the first
  finding.
- Brand name and monthly spend were removed as fields. Cosmisk reads the brand name from the
  website and spend from Meta. **Do not re-add fields for facts the product is about to
  discover.**

---

# SCREEN 4 — Website / brand input (onboarding step 2)

**Route:** `/proto/onboarding` (step 2 of 2) · **Layout:** OnboardingLayout

| # | | |
|---|---|---|
| 1 | **Purpose** | Collect the single input Cosmisk genuinely cannot infer: the store's website address. |
| 2 | **User goal** | Give one address and move on. |
| 3 | **Entry condition** | "Get started" on step 1. |
| 4 | **What the user sees** | Progress "Step 2 of 2", bar at 100% · H1 "What is your store's website address?" · Subhead explaining Cosmisk will read it and work out brand name, what you sell and who buys it, and will show what it found before going further · Label "Store website" with an `https://` prefix inside the field and placeholder `nectarsupplements.in`, prefilled with `nectarsupplements.in` · An explainer panel **"Not asking for your budget"** — Cosmisk reads actual spend from Meta; asking the user to estimate would give it a worse number · A source-order panel **"Where Cosmisk's understanding comes from"**: Your website (**now**) → Meta ad account (**next step**) → More sources (**later**) · Buttons "Back" and "Read my website". |
| 5 | **Primary action** | "Read my website". |
| 6 | **Secondary actions** | "Back" to step 1. Enter key in the field submits. |
| 7 | **Navigation** | Submit → `/proto/connect`. Back → step 1, in place. |
| 8 | **Data required** | One website address. Writes `websiteUrl` and patches `brand.website`. |
| 9 | **Real vs mocked** | The **input and validation are real**. What happens to the value is mocked: the URL is stored but discovery returns a fixed brand regardless of what was typed. |
| 10 | **Loading** | None on this screen — the scan happens on Brand Discovery. |
| 11 | **Empty** | Not applicable (the field ships prefilled). |
| 12 | **Error** | Validation fires only after a submit attempt (`urlTouched`). Invalid input shows, with an info icon: *"That does not look like a website address"*, and the primary button is disabled while invalid. Pattern: `/^[a-z0-9-]+(\.[a-z0-9-]+)+/i`. Production must define: unreachable site, site that blocks crawling, JS-only site with no extractable content. **Not defined yet — raise before building.** |
| 13 | **Success** | Navigation to Connect. |
| 14 | **After the action** | Trimmed website written to `websiteUrl` and merged into `brand`; route to `/proto/connect`. |
| 15 | **Expected output** | None yet — this is the input to the first output. |
| 16 | **Acceptance criteria** | ① Exactly one input field on the screen. ② The validation message does not appear before the first submit attempt. ③ The primary button is disabled while the value is invalid. ④ Enter submits. ⑤ Both explainer panels are present — they carry the product's reasoning about *why* it is not asking for more, and are not filler. ⑥ The typed value appears on the Brand Discovery screen ("Reading &lt;website&gt;"). |

**Known cosmetic issue, logged and deliberately not fixed:** at 1440px the source-order strip
wraps such that the word "LATER" falls alone onto a second line. Flagged for a later pass.

---

# SCREEN 5 — Connect Meta

**Route:** `/proto/connect` · **Layout:** OnboardingLayout

| # | | |
|---|---|---|
| 1 | **Purpose** | Attach the Meta ad account, or let the user proceed on sample data without connecting. |
| 2 | **User goal** | Either connect quickly, or see what the product does before granting access. |
| 3 | **Entry condition** | Submitting the website on onboarding step 2. Also reachable from the dashboard error state's "Reconnect Meta". |
| 4 | **What the user sees** | H1 "Point Cosmisk at your ad account" · Two cards: **Connect Meta Ads** (primary) and **Explore sample account** (secondary) · Prototype disclaimer. |
| 5 | **Primary action** | Connect Meta Ads. |
| 6 | **Secondary actions** | Explore sample account. |
| 7 | **Navigation** | Both → `/proto/discovery`. |
| 8 | **Data required** | Production: an OAuth authorisation code exchanged for a token, plus ad account selection. Prototype: nothing. |
| 9 | **Real vs mocked** | **Fully mocked.** No OAuth window opens. "Connect Meta Ads" runs an 1100 ms simulated handshake and sets `isDemo = false`; "Explore sample account" is immediate and sets `isDemo = true`. Both land on identical simulated data — `isDemo` only changes the banner shown in the shell. |
| 10 | **Loading** | 1100 ms busy state on the primary card only. |
| 11 | **Empty** | Production: the account has no ad accounts, or none the user can administer. **Not defined yet — raise before building.** |
| 12 | **Error** | Production must define: user cancels the OAuth dialog, permission denied, token exchange failure, no eligible ad account. **Not defined yet — raise before building.** The only related state that exists today is the dashboard's expired-token error, which routes back here. |
| 13 | **Success** | Navigation to Brand Discovery; thereafter the shell shows the emerald "Prototype" banner rather than the amber "Sample account" banner. |
| 14 | **After the action** | `isDemo` set; route to `/proto/discovery`. |
| 15 | **Expected output** | None. |
| 16 | **Acceptance criteria** | ① The disclaimer states plainly that both buttons lead to the same simulated data and that no OAuth window opens. ② The sample path is genuinely usable end-to-end — a reviewer must be able to see the whole product without connecting anything. ③ Nothing on this screen claims Cosmisk cannot edit the account (see the permission note below). |

**Prototype disclaimer (verbatim):**
> Prototype — both buttons lead to the same simulated data. No OAuth window opens.

### 5.1 Meta permissions — statement of fact, not a proposal

**Do not expand Meta permissions or redesign the OAuth architecture as part of Slice 1.** For
the avoidance of doubt, the shipped product's OAuth currently requests:

```
ads_read, ads_management, business_management, pages_read_engagement
```

`ads_management` is a **write** scope. Therefore copy such as *"Cosmisk never edits, pauses or
spends"* **cannot be printed on this screen** while that scope is requested — it would be
false, and a user who checks the Meta consent dialog will see the contradiction. The current
copy is deliberately neutral about capability and states responsibility instead ("every edit
happens in your Ads Manager, by you", on onboarding step 1).

Resolving this — by narrowing the scope, or by writing accurate copy about a write scope the
product holds but does not use — is a product decision. It is listed as unresolved. Do not
resolve it in code.

---

# SCREEN 6 — Brand Discovery

**Route:** `/proto/discovery` · **Layout:** OnboardingLayout

This is the **first intelligence screen**. It is the first moment Cosmisk says something about
the user's business rather than asking for more input.

| # | | |
|---|---|---|
| 1 | **Purpose** | Show what Cosmisk understood about the business from the website alone, and let the user correct it — because this understanding is the lens every later number is read through. |
| 2 | **User goal** | Check that Cosmisk actually understands their business, and fix it if not. |
| 3 | **Entry condition** | Either button on Connect. |
| 4 | **What the user sees** | **While scanning:** a globe icon, H1 "Reading &lt;website&gt;", subhead "Working out what you sell and who buys it.", and a progress bar. **After:** an emerald chip "Read from your website" (plus an amber "Sample" chip when `isDemo`) · H1 "Here is what Cosmisk understood." · A paragraph stating this is the context used to interpret everything else, and that fixing it changes the answers · A memory card headed "Cosmisk's memory of your brand" with the brand name, website, and rows for Category, Positioning, Price point, Top products, Audience, Geography, Trust signals · A persistence panel "Cosmisk keeps this" · Primary button "This is right — continue" · Prototype note. |
| 5 | **Primary action** | "This is right — continue". |
| 6 | **Secondary actions** | Edit — name, category, positioning, audience are inline-editable. Price point, top products, geography and trust signals are **display-only**. |
| 7 | **Navigation** | Continue → `/proto/processing`. |
| 8 | **Data required** | The `DiscoveredBrand` model: name, website, category, positioning, priceRange, pricePoint, productCount, topProducts[], audience, geography, trustSignals[], confidence. |
| 9 | **Real vs mocked** | **The 2.2 s scan is simulated.** The brand model is a fixed literal (`DISCOVERED_BRAND`) and does not depend on the URL typed. **Editing is real** — edits write to shared state and persist for the rest of the session. In production this maps to the existing extractor at `apps/api/src/audit/website-analysis.ts`, which today is only reachable from inside `runAudit()`. |
| 10 | **Loading** | Scanning view for 2200 ms; the progress bar animates to 100% over 2200 ms starting at 60 ms. |
| 11 | **Empty** | Production: extraction returned too little to show. **Not defined yet — raise before building.** A likely-correct behaviour is to show the fields it did get, mark the rest as not found, and let the user fill them — but this must be decided, not assumed. |
| 12 | **Error** | Production: site unreachable, timeout, blocked, or no extractable content. **Not defined yet — raise before building.** |
| 13 | **Success** | Editing a field shows an emerald confirmation: *"Updated. Cosmisk will use your version."* |
| 14 | **After the action** | The (possibly corrected) brand model is committed to shared state and drives the dashboard's category label and all downstream interpretation; route to `/proto/processing`. |
| 15 | **Expected output** | See below. |
| 16 | **Acceptance criteria** | ① The scanning view shows the website the user actually typed. ② Every field is visible without expanding anything. ③ The four editable fields save on Enter and on blur; empty values are rejected and leave the previous value intact. ④ A correction shows the confirmation and survives navigation to the dashboard. ⑤ The "Cosmisk keeps this" panel is present — without it the table reads as one-off setup instead of as memory. ⑥ The `isDemo` "Sample" chip appears only on the sample path. |

### 6.1 Expected output — worked example

> **Read from your website**
> **Nectar Supplements** — nectarsupplements.in
>
> | Field | Value |
> |---|---|
> | Category | Health & Wellness — Nutraceuticals |
> | Positioning | Clean-label daily supplements for urban Indian women, sold on a subscription-first model. |
> | Price point | Mid-market · ₹599 – ₹2,499 across 14 products |
> | Top products | Marine Collagen Peptides — 30 servings (₹1,899) · Daily Multivitamin for Women (₹999) · Plant Protein — Chocolate, 1kg (₹2,499) · Biotin + Zinc Hair Complex (₹599) |
> | Audience | Women 25–40, metro tier-1, health-conscious, repeat buyers |
> | Geography | India — Mumbai, Bengaluru, Delhi NCR, Pune, Hyderabad |
> | Trust signals | 4.6★ from 2,847 reviews · FSSAI certified · 30-day money-back guarantee · Free shipping above ₹799 |
>
> **Cosmisk keeps this.** This understanding is stored and reused. When Cosmisk reads your ad
> account, it judges every creative, price and audience against what it knows here — not
> against a generic benchmark. You can correct it at any time, and the findings change with it.

**What makes this Cosmisk output rather than a scraped table:** it commits to a positioning
sentence, it states the business model ("subscription-first"), it ranks the products by
relevance rather than dumping the catalogue, and it closes by telling the user what the data
will be *used for*. The `confidence` field exists on the model and must be surfaced when it is
anything other than `high` — a low-confidence extraction must not silently become the basis of
a high-confidence finding.

---

# SCREEN 7 — Analysis / Processing

**Route:** `/proto/processing` · **Layout:** OnboardingLayout

| # | | |
|---|---|---|
| 1 | **Purpose** | Cover the time the audit takes, and — more importantly — show *what kind of thinking* is happening, so the wait builds confidence rather than draining it. |
| 2 | **User goal** | Know that something real is happening and roughly how long it will take. |
| 3 | **Entry condition** | "This is right — continue" on Brand Discovery. |
| 4 | **What the user sees** | H1 "Cosmisk is going through your account." · Four sequential phases, each with a detail line while running and a result line once done: **Understanding your brand** → **Understanding performance** → **Studying creative patterns** → **Preparing your first finding** · An honesty banner. |
| 5 | **Primary action** | None. The screen advances itself. |
| 6 | **Secondary actions** | None. |
| 7 | **Navigation** | Auto-advances to `/proto/aha` on completion. |
| 8 | **Data required** | Production: audit status. `apps/api/src/routes/audits.ts` currently exposes **trigger, poll and fetch only** — there is no per-phase progress channel. |
| 9 | **Real vs mocked** | **Entirely simulated.** Four phases × 1000 ms on a timer. There is no back end reporting these phases. |
| 10 | **Loading** | This screen *is* the loading state. |
| 11 | **Empty** | Not applicable. |
| 12 | **Error** | Production: audit fails, times out, or Meta rate-limits. **Not defined yet — raise before building.** |
| 13 | **Success** | The fourth phase completes and the route advances. |
| 14 | **After the action** | Route to `/proto/aha`. |
| 15 | **Expected output** | Phase result strings only. No intelligence output originates here. |
| 16 | **Acceptance criteria** | ① Phases run in the stated order and each completed phase shows its result. ② The honesty banner is rendered and is not removable. ③ Total duration is bounded and the user is never stuck here. ④ **This screen must not be built against a real audit until a real progress stream exists behind it.** |

**Honesty banner (verbatim, must render):**
> The steps above are animated on a timer. The product has no per-phase progress channel today
> — the real audit returns a single result with no intermediate reporting. Do not build this
> sequencing without a real progress stream behind it.

**Open decision:** the UX blueprint recommended cutting this screen entirely and running the
audit asynchronously from Brand Discovery. **That decision is still open** and is listed in
the unresolved section. Do not resolve it by building the screen.

---

# SCREEN 8 — First Aha (the first finding)

**Route:** `/proto/aha` · **Layout:** OnboardingLayout

**This is the most important screen in the product.** It is where Cosmisk stops being a
promise. Every rule in §6 and §7 of the Constitution is enforced here.

| # | | |
|---|---|---|
| 1 | **Purpose** | Deliver one specific, evidence-backed, actionable finding — and make it obvious which parts are measured, which are inferred, what to do, and what happens afterwards. |
| 2 | **User goal** | Understand what is wrong, believe it, and know exactly what to do about it. |
| 3 | **Entry condition** | Completion of Processing. Also reachable from the dashboard's lead card ("See the evidence"). |
| 4 | **What the user sees** | Five blocks in a Z layout — full-width finding, then evidence \| interpretation side by side, then recommendation \| learning side by side. See the breakdown below. |
| 5 | **Primary action** | "Go to my dashboard". |
| 6 | **Secondary actions** | "I have done this" (records the action) · "Ask" (opens Ask Cosmisk pre-seeded) · A visibly-disabled future affordance. |
| 7 | **Navigation** | Dashboard → `/proto/dashboard`. Ask → `/proto/ask?q=Why did ROAS drop?`. |
| 8 | **Data required** | `FIRST_FINDING`: severity, confidence, basedOn, headline, subhead, evidence[], interpretation[], interpretationCaveat, recommendation{action, reasoning, projection[], projectionAssumption, caveat, effort}. |
| 9 | **Real vs mocked** | **Fully mocked content.** The layout, the state transition and the loop rendering are real. |
| 10 | **Loading** | None — Processing absorbed the wait. |
| 11 | **Empty** | Production: not enough history to produce a finding. The dashboard's empty state is the defined pattern ("Cosmisk needs about 14 days of spend…"); the equivalent for this screen is **not defined — raise before building.** |
| 12 | **Error** | Production: analysis produced no finding, or produced one below the confidence threshold. **Not defined yet — raise before building.** Publishing a low-confidence finding as if it were high-confidence is a Constitution §7 violation and is not an acceptable fallback. |
| 13 | **Success** | Clicking "I have done this" transitions to Screen 9. |
| 14 | **After the action** | `hasSeenFinding` is set on entry. `findingActioned` is set by the button, which also changes the dashboard's lead card. |
| 15 | **Expected output** | See §8.2 — this is the reference output for the whole product. |
| 16 | **Acceptance criteria** | See §8.3. |

### 8.1 Block-by-block

| Block | Contents |
|---|---|
| **1. What Cosmisk found** (full width) | Label "What Cosmisk found" · red chip "Costing you money" (severity) · neutral chip "High confidence" · amber "Sample data" chip when `isDemo` · H1 headline · subhead · evidence base line. |
| **2. Evidence** (left) | Header "Evidence — measured, not inferred". Four rows: label, value (colour-coded bad / good / neutral), and a mono detail line. Rendered on white in mono/tabular type. |
| **3. What Cosmisk thinks is happening** (right) | Tinted accent panel, `brain` icon. Three interpretation sentences, then a "Caveat" line carrying the alternative reading. |
| **4. What to do** (left, 7 cols) | Emerald left border. Label "What to do" and effort "2 minutes in Ads Manager" · the action · the reasoning · a three-cell projection strip rendered as left-to-right arithmetic · an "Assumption" strip · a caveat line. |
| **5. Then Cosmisk checks itself** (right, 5 cols) | The five-stage loop with per-stage status · a one-line honesty note · the "I have done this" button. Below the card: a dashed "⌁ Future — Do this for me in Ads Manager — Not built" affordance, then "Go to my dashboard" and "Ask". |

**Layout note.** Stacked in a 760px column these five blocks ran to ~1970px, which put the
recommendation — the only part that asks the user to do anything — two scrolls below the fold.
The Z layout exists to fit the whole finding on one 1440×900 screen. Reading order is still
1→5; only the geometry changed. **The screen currently measures 901px at 1440×900 and must
stay at one screen.** Any content addition must be paid for elsewhere.

### 8.2 Expected output — the reference example

> **What Cosmisk found** · `COSTING YOU MONEY` · `HIGH CONFIDENCE`
>
> # ₹4.9L a month is going to two creatives that stopped working three weeks ago.
>
> Both are still running at full budget. Neither has been paused. Together they are your
> second and fourth largest line items.
>
> *Based on: 42 days of account history · 47 creatives · 8 campaigns*
>
> ---
>
> **EVIDENCE** — measured, not inferred
>
> | | |
> |---|---|
> | Summer Sale 40% Off | **ROAS 1.8** |
> | | was 3.4 in its first 14 days · CTR 1.1% (was 2.6%) · ₹3,50,000 spent · ₹6,30,000 back · frequency 6.8 · live 42 days |
> | Before/After 60 Days | **ROAS 2.1** |
> | | was 3.6 in its first 14 days · CTR 1.2% (was 2.4%) · ₹1,40,000 spent · ₹2,94,000 back · frequency 5.2 · live 35 days |
> | Account average ROAS | **3.2** |
> | | Both creatives are running roughly 40% below your own account average. |
> | ₹999 for 30 Days | **ROAS 5.2** |
> | | frequency 2.1 · still improving week over week · not budget-capped |
>
> **WHAT COSMISK THINKS IS HAPPENING**
>
> These are your two oldest live creatives, and both are above frequency 5.0 — your audience
> has now seen each of them five to seven times.
>
> This is not a creative quality problem. Both opened above ROAS 3.4, which is at or above your
> account average. They worked, and then the audience ran out.
>
> The pattern is the angle, not the format: both lead on a promise (Urgency, Transformation)
> across a static and a carousel, while "₹999 for 30 Days" — also a static — leads on price and
> is your best at 5.2. Cosmisk holds that as a working pattern from six creatives, not a rule.
>
> *Caveat — One alternative reading: a competitor may have entered the same auction and pushed
> your CPMs up. Cosmisk cannot see competitor auction data yet, so frequency is the stronger
> explanation.*
>
> ---
>
> **WHAT TO DO** · *2 minutes in Ads Manager*
>
> **Pause both creatives and move the combined ₹4,90,000 to "₹999 for 30 Days".**
>
> It is your highest-ROAS creative at 5.2, its frequency is only 2.1, and it is not
> budget-capped — so it has room to absorb the spend before it saturates.
>
> | That ₹4,90,000 today | Same spend at 3.5 ROAS | Difference |
> |---|---|---|
> | **₹9,24,000 back** | **₹17,15,000 back** | **+₹7,91,000 / month** |
> | blended ROAS 1.89 across the two | not 5.2 — see the haircut | if the assumption holds |
>
> *Assumption — Modelled at ROAS 3.5, not the 5.2 that creative does today. Efficiency almost
> always falls when you put 6x the budget behind one creative, so Cosmisk assumes it lands
> nearer your account average.*
>
> Re-check frequency after 7 days. If it passes 4.0, this creative is saturating too.
>
> **THEN COSMISK CHECKS ITSELF**
>
> ● Action recorded — *Waiting for you* · ● Baseline locked — *Today's numbers* ·
> ● Cosmisk observes new data — *Next 7 days* · ● Outcome evaluated — *Verdict on day 7* ·
> ● Cosmisk adjusts its model — *After the verdict*
>
> This records the action. It does not mean Cosmisk knows the call was right.
>
> `[ ✓ I have done this ]`
>
> `⌁ FUTURE — Do this for me in Ads Manager — Not built`

**Why this output is correct and a generic one is not.** It names the creatives. It quotes the
before-value next to the after-value so decay is visible rather than asserted. It benchmarks
against the account's own average, not an industry figure. It rules out the obvious wrong
diagnosis ("not a creative quality problem") and says why. It discounts its own projection
from 5.2 to 3.5 and explains the discount. It states the condition under which it is wrong. It
tells the user what it will check and when. **Every one of those properties is required.**

### 8.3 Acceptance criteria

1. Evidence and interpretation are visually distinguishable at a glance — mono/tabular on
   white versus sentences on a tinted panel — with no label-reading required.
2. Severity and confidence are visible above the fold, next to the headline.
3. The evidence base line states the actual population the finding was drawn from.
4. The projection is shown as at least three auditable steps, never as a single number.
5. The projection's assumption is on screen, adjacent to the projection.
6. The alternative reading (caveat) is present and states why it was not chosen.
7. The five loop stages render with their per-stage status; stages 3–5 show *when*, not
   *whether*.
8. The copy near the button states that recording is not learning.
9. The "Future" affordance is visibly not built and is not clickable-looking.
10. The whole finding fits one 1440×900 screen without scrolling.
11. No horizontal overflow at 1440, 1024 or 390 px.
12. Every number on this screen agrees with `PROTO_CREATIVES`, `PROTO_KPI` and the Ask Cosmisk
    answer.

---

# SCREEN 9 — First Aha, actioned state

**Route:** `/proto/aha` after "I have done this" · **Layout:** OnboardingLayout

This is a state of Screen 8, documented separately because it is where the product most easily
tells a lie.

| # | | |
|---|---|---|
| 1 | **Purpose** | Confirm the action was recorded and the baseline locked — while making it unmistakable that **Cosmisk has not learned anything yet.** |
| 2 | **User goal** | Confirm they did it and understand what happens next. |
| 3 | **Entry condition** | Clicking "I have done this" on Screen 8. |
| 4 | **What the user sees** | Blocks 1–4 unchanged. In block 5, the first two loop stages gain green checks and switch to their `done` values (**Action recorded — By you**, **Baseline locked — ₹3.5L · 1.8**); stages 3–5 remain grey with their pending timing. The button is replaced by a confirmation paragraph. |
| 5 | **Primary action** | "Go to my dashboard". |
| 6 | **Secondary actions** | "Ask". |
| 7 | **Navigation** | As Screen 8. |
| 8 | **Data required** | `findingActioned`. In production, additionally: the baseline snapshot (spend and ROAS at the moment of action) and its timestamp. |
| 9 | **Real vs mocked** | The state transition is **real**. No baseline is actually persisted and no observation is scheduled. |
| 10 | **Loading** | None — the transition is instant. |
| 11 | **Empty** | Not applicable. |
| 12 | **Error** | Production: failure to persist the action or capture the baseline. **Not defined yet — raise before building.** This matters more than most error states: **if the baseline is not captured at the moment of action, the outcome is unmeasurable forever.** |
| 13 | **Success** | Two green checks and the confirmation copy below. |
| 14 | **After the action** | `findingActioned = true`, which also switches the dashboard lead card to its tracking variant. It is **not** reversible in the prototype; a page refresh resets it. |
| 15 | **Expected output** | Confirmation copy, verbatim: *"Recorded — the starting point is locked and nothing more. If the projection was wrong, Cosmisk will say so and change how it models scaling in your account."* |
| 16 | **Acceptance criteria** | ① Exactly two of five stages complete — never more. ② The confirmation copy does not claim any learning has occurred. ③ The copy commits to reporting a **wrong** outcome, not only a right one. ④ The locked baseline values (₹3.5L · 1.8) are displayed, not implied. ⑤ Returning to the dashboard shows the tracking lead card. ⑥ The screen still fits 1440×900 (it measures 900px in this state). |

---

# SCREEN 10 — Dashboard

**Route:** `/proto/dashboard` · **Layout:** ProtoShell

| # | | |
|---|---|---|
| 1 | **Purpose** | The daily return surface. It answers "what needs me today?" before it answers "how are we doing?". |
| 2 | **User goal** | Find out in ten seconds whether anything needs them. |
| 3 | **Entry condition** | Login, or "Go to my dashboard" from the Aha screen, or the shell's "Today" nav item. |
| 4 | **What the user sees** | Five zones in this order — see below. |
| 5 | **Primary action** | "See the evidence" on the lead finding. |
| 6 | **Secondary actions** | "Ask about this" · three quick-question chips · a prototype view-state switcher. |
| 7 | **Navigation** | See the evidence → `/proto/aha`. Ask about this → `/proto/ask?q=Why did ROAS drop?`. Quick question → `/proto/ask?q=<question>`. Error state's Reconnect → `/proto/connect`. Empty state's "Ask a question meanwhile" → `/proto/ask`. |
| 8 | **Data required** | `PROTO_KPI` (4), `PROTO_SIGNALS` (3 — index 0 is the lead, 1–2 are secondary), `PROTO_CREATIVES` (6), `CREATIVES_SHOWN_NOTE`, `brand.category`, `firstName`, `findingActioned`. |
| 9 | **Real vs mocked** | **All data mocked.** The greeting is **real** (derived from the actual clock). The `findingActioned` branch is real. The view-state switcher is a **prototype-only affordance and must not ship.** |
| 10 | **Loading** | Skeletons: one 180px card, four 104px cards, one 220px card. Selectable via the switcher. |
| 11 | **Empty** | H2 "Not enough history yet." · "Cosmisk needs about 14 days of spend before it can tell the difference between a real pattern and a noisy week." · "Your account has 3 days of spend. Cosmisk will start the moment there are 14." · Button "Ask a question meanwhile". |
| 12 | **Error** | H2 "Cosmisk lost access to your ad account." · "Meta returned an expired token. This usually means the password changed or the permission was revoked. Your history is safe — reconnecting restores it." · Button "Reconnect Meta". |
| 13 | **Success** | The `ready` view. |
| 14 | **After the action** | Navigation only. The dashboard writes nothing to shared state. |
| 15 | **Expected output** | See §10.2. |
| 16 | **Acceptance criteria** | See §10.3. |

### 10.1 Zone order — this ordering is a product decision

| Zone | Heading | Treatment |
|---|---|---|
| 1 | Brand bar | Greeting + "One thing needs you today." + category + "Last 30 days". |
| 2 | **What needs your attention** | Navy, semibold, with a rule. One lead finding card. |
| 3 | **Other important findings** | Navy, semibold, with a rule. Two secondary signal cards. |
| 4 | **Account numbers** — *for reference, not a finding* | Muted grey. Four KPI cards. |
| 5 | **Creative performance** | Muted grey. Six-row table + subset note. |
| 6 | Ask Cosmisk | Tinted panel with three quick questions. |

**Intelligence sits above metrics deliberately.** A dashboard leads with metrics; an
intelligence product leads with the conclusion. All four section labels are the **same type
size** — the ranking is carried by weight and colour, not by making anything bigger, so it
survives long content. The shipped product's 12 sections were cut to these five zones.

**KPI tone is a property of the metric, not of its direction.** Spend rising is neither good
nor bad until you know what it bought, so `Kpi.good` is `null` for spend and the data carries
the judgement — the view only renders it. Do not infer tone from arrow direction.

### 10.2 Expected output — worked example

**Lead card (before action):**

> `COSTING YOU MONEY · HIGH CONFIDENCE`
> ## ₹4.9L going to two dead creatives
> "Summer Sale 40% Off" (ROAS 1.8) and "Before/After 60 Days" (ROAS 2.1) are both above
> frequency 5.0 and still at full budget.
> `[ See the evidence → ]` `[ Ask about this ]`

**Lead card (after action) — this replaces the card above:**

> `TRACKING · DAY 0 OF 7`
> ## You capped Summer Sale. Cosmisk is watching what happens.
> Your action is recorded and the baseline is locked. Cosmisk has not learned anything yet —
> it will compare the next 7 days against ₹3.5L / 1.8 ROAS and tell you whether the call was
> right, including if it was wrong.
>
> **Where this is in the loop:** Recorded → baseline locked → *observing (first read in 3
> days)* → *verdict on day 7* → *Cosmisk adjusts*

**Secondary signals:**

> `OPPORTUNITY · MEDIUM CONFIDENCE`
> **"Unboxing" has room to scale** — ROAS 4.2 and climbing, frequency only 1.8 after 7 days.
> It has not hit saturation and is not budget-capped.
>
> `PATTERN · BASED ON 42 DAYS`
> **Price Anchor hooks outperform by 2.1x** — Across 47 creatives, hooks that lead with a
> specific price return 2.1x the ROAS of every other hook type in your account.

**Account numbers:** Spend ₹18.4L (+12.3% vs previous 30 days, neutral tone) · Revenue ₹58.9L
(−0.2%, bad) · ROAS 3.2 (−0.4, was 3.6, bad) · Wasted spend ₹4.9L (+24%, flagged by Cosmisk,
bad).

**The four numbers tell one story and must never disagree with the finding:** spend rose 12%,
revenue was flat, therefore ROAS fell 3.6 → 3.2 and the waste grew.
(prev 30d: ₹16.4L × 3.6 = ₹59.0L · this 30d: ₹18.4L × 3.2 = ₹58.9L.)

**Creative performance** — 6 rows sorted by ROAS descending, with `6 of 47 shown · ₹10.1L of
₹18.4L spend`:

| Creative | Spend | ROAS | Freq | 7d |
|---|---|---|---|---|
| ₹999 for 30 Days · 28d live · Price Anchor · static | ₹1.9L | **5.2** | 2.1 | +8% |
| Collagen Glow-Up · 14d live · Shock Statement · video | ₹1.5L | **4.8** | 3.4 | +12% |
| Unboxing · 7d live · Curiosity · video | ₹90K | **4.2** | 1.8 | +18% |
| Morning Routine with Nectar · 21d live · Personal Story · video | ₹90K | 3.9 | 3.1 | +2% |
| Before/After 60 Days · 35d live · Transformation · carousel | ₹1.4L | **2.1** | **5.2** | −18% |
| Summer Sale 40% Off · 42d live · Urgency · static | ₹3.5L | **1.8** | **6.8** | −24% |

Colour rules: ROAS ≥ 4 emerald, < 2.5 red, otherwise navy. Frequency ≥ 5.0 red. 7d change
emerald when ≥ 0, red otherwise.

### 10.3 Acceptance criteria

1. The first thing below the greeting is a **finding**, not a metric.
2. Exactly one lead finding. Secondary findings look secondary.
3. The two intelligence headings are visually stronger than the two analytics headings, at the
   same type size.
4. The KPI section is labelled "for reference, not a finding".
5. The creative table states the subset explicitly; a user can never mistake 6 rows for the
   whole account.
6. All four view states (`ready` / `loading` / `empty` / `error`) render and are reachable.
7. The empty state gives a **number** ("3 days") and a **threshold** ("14"), not a vague wait.
8. The error state explains the likely cause, reassures about history, and offers exactly one
   recovery action.
9. When `findingActioned` is true, the lead card shows the tracking variant and its copy does
   not claim learning.
10. Every quick question routes to Ask Cosmisk pre-seeded.
11. Every number agrees with the Aha screen and the Ask answer.
12. The view-state switcher is prototype-only and does not ship.
13. Sidebar items that are not built are disabled and badged, never live-looking.

---

# SCREEN 11 — Ask Cosmisk

**Route:** `/proto/ask` (accepts `?q=<question>`) · **Layout:** ProtoShell

| # | | |
|---|---|---|
| 1 | **Purpose** | Let the user interrogate the intelligence directly — in the **same structure** Cosmisk uses to present findings. It is the same analyst, addressed directly; it is not a chatbot. |
| 2 | **User goal** | Get a specific question answered with the same rigour as a finding. |
| 3 | **Entry condition** | The shell's "Ask Cosmisk" nav item · "Ask" on the Aha screen · "Ask about this" or a quick-question chip on the dashboard · the empty-state button. All pre-seed `?q=`. |
| 4 | **What the user sees** | H1 "Ask Cosmisk" · suggested questions when idle · a rotating thinking indicator while working · the answer, revealed block by block · a composer pinned at the bottom (`sticky bottom-4`) · a prototype disclaimer. |
| 5 | **Primary action** | Ask a question. |
| 6 | **Secondary actions** | Click a suggested question. |
| 7 | **Navigation** | Stays on the screen. Shell navigation remains available. |
| 8 | **Data required** | `AI_ANSWER` keyed by question · `SUGGESTED_QUESTIONS`. |
| 9 | **Real vs mocked** | **Fully scripted.** One answer exists (`'Why did ROAS drop?'`) and **every** question returns it. No model is called. The composer, the `?q=` handling and the block-reveal animation are real. |
| 10 | **Loading** | 1800 ms thinking phase with a label rotating every 600 ms, then blocks revealed at 420 ms intervals. |
| 11 | **Empty** | The idle state: suggested questions — "Why did ROAS drop?", "Which creative should I scale?", "What is working in my account right now?" |
| 12 | **Error** | Production: model failure, timeout, a question outside what the data can answer, or a question requiring data Cosmisk does not have. **Not defined yet — raise before building.** Per Constitution §6.4, the correct behaviour for an unanswerable question is to **say what it cannot see**, not to produce a hedged general answer. |
| 13 | **Success** | The complete six-block answer rendered. |
| 14 | **After the action** | The answer is displayed. Nothing is written to shared state; nothing persists across a refresh. |
| 15 | **Expected output** | See §11.2. |
| 16 | **Acceptance criteria** | See §11.3. |

### 11.1 Answer block types

`takeaway` · `diagnosis` · `evidence` (tabular rows with tone) · `interpretation` (list) ·
`action` (list) · `future` (visibly unbuilt). This is the same structure as the Aha screen,
compressed for a conversational surface. **The block set is the contract** — an implementation
that returns prose and formats it afterwards has not implemented this.

### 11.2 Expected output — worked example, "Why did ROAS drop?"

> **TAKEAWAY**
> Your blended ROAS did not drop across the account — it dropped in two creatives that are
> dragging the average down.
>
> **DIAGNOSIS**
> Blended ROAS moved from 3.6 to 3.2 over the last 21 days. Isolating by creative, four of your
> six active creatives held or improved. The entire decline is concentrated in "Summer Sale 40%
> Off" and "Before/After 60 Days".
>
> **EVIDENCE**
>
> | | | |
> |---|---|---|
> | Summer Sale 40% Off | 3.4 → 1.8 | frequency 6.8 · 42 days live · ₹3,50,000 spent |
> | Before/After 60 Days | 3.6 → 2.1 | frequency 5.2 · 35 days live · ₹1,40,000 spent |
> | ₹999 for 30 Days | 4.9 → 5.2 | frequency 2.1 · improving |
> | Unboxing | 3.6 → 4.2 | frequency 1.8 · improving |
>
> **INTERPRETATION**
> - Both declining creatives crossed frequency 5.0 about three weeks in, and both lost roughly
>   half their CTR at the same point.
> - Both opened above ROAS 3.4, so this is audience saturation rather than weak creative.
> - Your two healthy creatives are both under frequency 2.2 — which is the clearest signal that
>   the audience, not the message, is the constraint.
> - Looking at the creative itself rather than the delivery: both decliners lead on a promise
>   angle (Urgency, Transformation) across two different formats, while your best performer
>   leads on a price. That is the pattern Cosmisk is currently carrying for your account — six
>   creatives is thin evidence, so it will revise it as more run.
>
> **ACTION**
> - Pause "Summer Sale 40% Off" and "Before/After 60 Days" — together they are burning
>   ₹4,90,000 a month at below-average return.
> - Move that budget to "₹999 for 30 Days" (ROAS 5.2, frequency 2.1, not capped).
> - Re-check frequency in 7 days. If it passes 4.0, rotate before it decays the same way.
>
> `⌁ FUTURE — Pause these two creatives and reallocate the budget for me — Not built`

**Note the first line.** It reframes the user's question before answering it: they asked why
ROAS dropped; Cosmisk's first move is to say the premise is wrong — it did not drop across the
account. **That is the difference between an analyst and a search box**, and it is required
behaviour, not flourish.

### 11.3 Acceptance criteria

1. Every answer follows the block structure. There is no free-prose answer path.
2. The `evidence` block is tabular with the same colour tone rules as the rest of the product.
3. Interpretation is visually distinct from evidence.
4. Every answer ends in concrete actions, not "consider reviewing".
5. Unbuilt capability appears only as a labelled, non-functional affordance.
6. The disclaimer states that one scripted answer exists and all questions return it.
7. `?q=` pre-seeds and auto-runs; arriving from the dashboard requires no second click.
8. The composer stays reachable while the answer is long.
9. Numbers agree with the dashboard and the Aha screen.

**Prototype disclaimer (verbatim):**
> Prototype — one scripted answer. Other questions return the same response.

---

# 12. Application shell (ProtoShell)

Wraps the Dashboard and Ask Cosmisk.

| Element | Behaviour |
|---|---|
| Sidebar brand | "COSMISK" wordmark, brand switcher below. |
| Nav — live | **Today** → `/proto/dashboard` · **Ask Cosmisk** → `/proto/ask`. |
| Nav — later | Divider labelled "Later slices", then **Creatives** and **Connections**, both disabled with "Soon" badges. |
| Banner (`isDemo === true`) | Amber, sticky: **Sample account** — "Nothing here is real data…" |
| Banner (`isDemo === false`) | Emerald, sticky: **Prototype** — "Showing a 'connected' state — the data below is still simulated. No Meta account is linked." |

**Acceptance:** disabled nav items are never clickable-looking; the banner is sticky and cannot
be dismissed in Slice 1; the correct banner shows for the path the user took through Connect.

---

# 13. Real vs mocked vs future

**Do not let this table blur.** Confusing prototype behaviour with production capability is
what this document exists to prevent.

| Capability | Currently real | Mocked for prototype | Future |
|---|---|---|---|
| Authentication | — | Login/signup accept anything; no session, no token | Real auth, session, password reset, email verification |
| Route protection | — | No guards; every route is directly addressable | Guards on all post-auth routes |
| Persistence | — | In-memory signals only; refresh resets everything | Server-side user, brand and finding storage |
| Meta OAuth | Exists in the shipped product (`ads_read, ads_management, business_management, pages_read_engagement`) | Prototype opens no OAuth window; 1100 ms fake handshake | Scope decision (see §5.1); account selection; token refresh |
| Website extraction | `apps/api/src/audit/website-analysis.ts` exists but is only callable inside `runAudit()` | 2.2 s fake scan; fixed brand regardless of URL | Standalone extraction endpoint callable before the audit |
| Brand memory | Editing works within a session | Not persisted | Stored, versioned, reusable, correction-aware |
| Audit / analysis | `apps/api/src/routes/audits.ts` — trigger, poll, fetch | 4 phases × 1000 ms on a timer; **no progress channel exists** | Real progress stream, or the screen is cut |
| Finding generation | — | One hand-written finding (`FIRST_FINDING`) | Generated, ranked by consequence, confidence-thresholded |
| Evidence | — | Literals in `proto-data.ts` | Queried from account data with sources attached |
| Projection maths | — | Pre-computed literals | Computed, with the ROAS haircut as an explicit model parameter |
| Creative data | — | 6 hand-authored creatives of a claimed 47 | Full creative set with real hook/format/fatigue attribution |
| Creative intelligence | — | Hook and format labels only; one hand-written pattern | Full chain: concept, angle, visual, message, creator, pattern |
| "I have done this" | Sets a flag | No baseline persisted, no observation scheduled | Baseline snapshot + timestamp + scheduled evaluation |
| Learning loop | Stages 1–2 render as complete | Stages 3–5 never move | Real observation, verdict (right/wrong/inconclusive), model update |
| Ask Cosmisk | Composer, `?q=`, block rendering | One scripted answer for every question | Real generation constrained to the block structure |
| "Do this for me in Ads Manager" | — | Rendered as visibly not built | Deliberate, separately-scoped write-action product |
| Dashboard view states | All four render | Toggled by a prototype-only switcher | Driven by real data conditions; switcher removed |
| Creatives / Connections nav | — | Disabled with "Soon" badges | Later slices |

---

# Definition of Done

Slice 1 is done when **all** of the following are objectively true. Each is checkable by
someone who was not in the conversation.

### Journey

1. A user can go from landing on the app to their first piece of intelligence without a dead
   end, an unhandled state, or a control that does nothing unexpectedly.
2. The full click path works: `/proto` → Login → Dashboard, and Signup → Onboarding 1 →
   Onboarding 2 → Connect → Discovery → Processing → Aha → (action) → Dashboard → Ask.
3. Every screen is directly addressable and renders correctly when opened cold.
4. The signup promise — first finding in under three minutes — is honoured by the flow.

### Output quality

5. Every intelligence output visually and linguistically separates **measured evidence** from
   **Cosmisk's interpretation**.
6. Every finding carries: severity, confidence, the evidence base it was drawn from, at least
   one alternative reading, and a caveat.
7. Every recommendation is a **concrete action** a competent operator can execute today, with
   an effort estimate — never "review", "consider", or "optimise".
8. Every projection is shown as auditable steps with its assumption adjacent, never as a single
   confident number.
9. A user reading the finding can articulate **why** Cosmisk reached its conclusion without
   asking anyone.
10. No output on any screen could have been written without reading this specific account.

### Honesty

11. Demo and sample data are labelled wherever they appear.
12. Every simulated behaviour carries a visible disclaimer.
13. No unbuilt capability is presented as available. Unbuilt affordances are visibly disabled
    and labelled.
14. Recording an action never claims that learning has occurred. Loop stages 3–5 are never
    shown as complete.
15. Nothing on screen claims Cosmisk cannot write to the ad account while a write scope is
    requested.

### States

16. Loading, empty, error and success states are **defined and built** for every screen that
    can have them.
17. The empty state gives a number and a threshold, not a vague wait.
18. The error state names the likely cause and offers exactly one recovery action.

### Consistency

19. The demo data is deterministic: the same click path produces the same output every time.
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
26. Prototype-only affordances (the dashboard view-state switcher) are removed from anything
    that ships.

---

**If a developer cannot find the answer to a question in this document or in the Constitution,
the correct action is to raise it. It is never to decide.**

---

# Slice 1 Decision Override

**This section governs Slice 1 implementation.** Nothing above it has been changed. Where this
section conflicts with anything above it, this section wins for Slice 1.

The full decision text is in the Constitution's *Slice 1 Decision Override*. This section records
only the effect on this specification.

## Override 1 — The learning loop is not implemented in Slice 1

Slice 1 does not implement an active learning or self-checking loop. Slice 1 must not present as
functioning: a persisted learning baseline, scheduled observation, outcome measurement, a
post-action verdict, "Cosmisk checked itself", "Cosmisk learned from the result", or model
adjustment based on an observed outcome.

The **COSMISK CHECKS ITSELF** block is retained as a statement of **future** capability. It must
carry an explicit future/unavailable label. No stage of it may render as complete.

Definition of Done item 13 — *"No unbuilt capability is presented as available. Unbuilt
affordances are visibly disabled and labelled"* — applies to this block.

### Affected items in this document

These are superseded for Slice 1 and are otherwise left exactly as written:

| Location | What it currently requires | Status under Override 1 |
|---|---|---|
| SCREEN 8 item 16 · §8.3 criterion 7 | The five loop stages render with per-stage status; stages 3–5 show *when*, not *whether* | **Retained.** The block additionally requires an explicit future/unavailable label. |
| SCREEN 9 item 4 | Two loop stages gain green checks and switch to `done` values, including **Baseline locked — ₹3.5L · 1.8** | **Superseded.** No baseline may render as locked. At most stage 1 (*Action recorded*) may complete. |
| SCREEN 9 item 13 | "Two green checks and the confirmation copy below" | **Superseded.** One check at most. |
| SCREEN 9 item 15 | Confirmation copy, verbatim: *"Recorded — the starting point is locked and nothing more. If the projection was wrong, Cosmisk will say so and change how it models scaling in your account."* | **SUPERSEDED — X5 RESOLVED.** Replaced by the authorized copy below. |
| SCREEN 9 item 16 ① and ④ | "Exactly two of five stages complete"; "the locked baseline values (₹3.5L · 1.8) are displayed, not implied" | **Superseded.** |
| Definition of Done item 14 | "Loop stages 3–5 are never shown as complete" | **Retained and tightened:** stages 2–5 are never shown as complete. |

SCREEN 9 item 9 — *"No baseline is actually persisted and no observation is scheduled"* — is the
statement of fact that makes the supersessions above necessary. It is unchanged.

### X5 — RESOLVED. Actioned-state confirmation copy

**Decision.** Slice 1 does not persist a learning baseline and does not evaluate the outcome of
the recommendation. The purpose of the actioned state is **only** to confirm that the user took
the recommended action.

The actioned state must **not** claim:

- that a baseline has been persisted or locked
- that Cosmisk has evaluated the outcome
- that Cosmisk will automatically adjust its model from this action
- that learning has occurred

**Authorized final copy for SCREEN 9 item 15, verbatim:**

> Recorded — this confirms the recommended action was taken. Cosmisk has not evaluated the
> outcome yet. Outcome tracking will come later.

**Consequent state change.** Because no baseline is locked, exactly **one** of the five loop
stages completes in the actioned state — *Action recorded — By you*. Stage 2 (*Baseline locked*)
remains pending with *Today's numbers*. This supersedes SCREEN 9 items 4, 13 and 16 ① ④ as
tabulated above.

Applied in `apps/web/src/app/proto/screens/aha.component.ts`.

## Override 2 — Competitor capture is not part of Slice 1

Competitor capture is not in Slice 1 and Competitor Spy is not to be implemented. The eleven
screens listed in §0.3 are the complete Slice 1 screen set. No competitor capture screen or
onboarding step is to be added.

The approved journey is:

`Login / Signup → What is Cosmisk → Brand / Website → Connect Meta → Brand Discovery →
Analysis → First Aha → Action → Dashboard → Ask Cosmisk`

The recovered prototype already follows it.

## Product decisions still open

X1 recommendation action semantics · X2 population framing (6 vs 47) · X3 "Angle" definition and
taxonomy · X4 Meta write scope (§5.1).

X5 (actioned-state confirmation copy) is **RESOLVED** — see above.

**None of these are to be resolved in code.** Per the closing rule of this document: the correct
action is to raise it. It is never to decide.
