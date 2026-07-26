# Runtime Hardening (Bucket F) — Audit & Plan (2026-06-03)

> Behavioral production-safety fixes. Distinct from the structural refactor. Own branch, gated like everything else.

---

## 🚨 RH-0 (URGENT, SECURITY): `.env.test` secrets committed to a PUBLIC repo
- **`server/.env.test` is tracked** (added in `29bac80`), repo is **public** (`github.com/vishant-art/Cosmisk`).
- Committed copy contains a **real `sk-ant-` Anthropic key** + **39 populated secret values** (META_APP_SECRET, JWT_SECRET, TOKEN_ENCRYPTION_KEY, RAZORPAY_KEY_SECRET, SLACK_*, STRIPE_*, etc.). Treat ALL as compromised.
- The Neon `TEST_DATABASE_URL` is only in the LOCAL modified copy (not committed) — safe.
- **Remediation (needs user):**
  1. **ROTATE** every secret that had a real value in the committed file (Anthropic key first — it's the confirmed live one).
  2. `git rm --cached server/.env.test` + add to `.gitignore`; keep a local-only `.env.test` and add a committed `.env.test.example` with empty values.
  3. (Optional, destructive) scrub git history with `git filter-repo`/BFG — but rotation is the real fix; history scrub is cleanup. Coordinate with the dev team (rewrites shared history).

---

## RH-1 (HIGH, billing): LLM-gateway bypasses
The gateway (`services/llm-gateway.ts`) enforces per-user daily USD caps + cost-ledger. `createMessage` is **Anthropic-only** (`:266,:325`); it has a `apiProvider:'anthropic'|'gemini'` cost notion (`:198`) but **no Gemini entry point**. So every direct call below bypasses cap enforcement + cost tracking:

**Direct Anthropic (clear bypass — route through `createMessage`):**
- `competitor-creative-intel/ai-clients.ts:13` (`new Anthropic`) → used by `relevance.ts:90`, `ai-analysis.ts:58`
- `comment-mining/state.ts:12` (`new Anthropic`)

**Direct Gemini (needs a gateway Gemini entry first — DESIGN DECISION):**
- `audit/audit-agent.ts`, `visual-analyzer.ts` (fetch ×4), `comment-mining/{classification,concepts}.ts`, `competitor-creative-intel/ai-clients.ts:14`, `pattern-extractor.ts:102`, `ad-engine/validator/gemini.ts:58`, `ad-engine/gemini-generator.ts` (dormant)

> **Decision needed:** add a gateway `createGeminiMessage` (cap + cost-ledger for Gemini) and route all Gemini through it, OR accept Gemini as out-of-gateway and just instrument cost. Routing Anthropic bypasses through `createMessage` is unambiguous and should happen regardless.
> **Behavioral note:** routing these through the gateway makes them subject to daily caps → they can now be 429'd. That's the intent, but it changes behavior; needs tests + a smoke.

---

## RH-2 (MEDIUM, architecture): cron jobs in the API process
All crons run **in-process on the API event loop**:
- `routes/agent.ts` (8 crons — watchdog 6h, briefings, weekly agents, meta-warmup), `routes/autopilot.ts:22` (4h), `routes/reports.ts:615` (weekly), `routes/automations.ts:533` (4h), `services/memory-maintenance.ts` (3 CronJobs), `services/audit-scheduler.ts` (per-brand CronJobs).
- **Risk:** a heavy agent run (many LLM calls, long loops) shares the event loop + memory with API request handling → latency spikes / OOM under load. CLAUDE.md flags "Cron jobs blocking API."
- **Possible duplication:** `autopilot.ts:22` and `automations.ts:533` both fire `0 */4 * * *`.
- **Decision needed:** (a) extract heavy crons into a separate worker process / Railway cron service, or (b) keep in-process but add concurrency guards + offload heavy work. Option (a) is the real fix; it overlaps with Bucket H (apps/worker).

---

## RH-3 (LOW, mechanical): structured logging
- **114 `console.*` calls** in `src/` (excl tests) vs the structured `logger`. Migrate to `logger.{info,warn,error,debug}` with structured fields.
- Caveat: some are in CLI/diagnostic scripts (`db/check-connection.ts`, `config.ts` fatal-exit messages) where `console` is intentional — keep those.
- Safe, incremental, behavior-neutral (log destination/format only).

---

## Proposed sequence
1. **RH-0 now** — rotate + untrack `.env.test` (+ `.env.test.example`). User does rotation; I do the untrack/gitignore/example.
2. **RH-1 Anthropic bypasses** — route the 2 direct-Anthropic sites through `createMessage`. Then decide Gemini gateway scope.
3. **RH-3 logging** — mechanical sweep (can run anytime, low risk).
4. **RH-2 crons** — design decision; likely fold the worker-extraction into Bucket H (apps/worker).

Verify each against the invariant (default 400/9, pg 388/10, tsc baseline, madge 0) + targeted smoke for behavioral changes.
