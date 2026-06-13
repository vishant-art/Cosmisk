"""Python-side LLM cost ledger.

Decision (lemon, 2026-06-12): apps/ai-layer tracks its OWN LLM spend rather than
routing through the TS `llmGateway`. Every model call records (model, tokens, cost)
to a JSONL ledger, giving cap/cost visibility independent of the TS side. This is
the ai-layer equivalent of Architecture Rule #1's cost tracking.

Prices are approximate OpenRouter $/1M tokens (in, out), 2026, version-sensitive --
verify against the live model pages before trusting the absolute USD figures.
"""
from __future__ import annotations

import json
from threading import Lock

from ai_layer.config import DATA_DIR

PRICING: dict[str, tuple[float, float]] = {
    "google/gemini-2.5-flash":      (0.30, 2.50),
    "google/gemini-2.5-flash-lite": (0.10, 0.40),
    "openai/gpt-5-nano":            (0.05, 0.40),
    "openai/gpt-5-mini":            (0.25, 2.00),
    "anthropic/claude-haiku-4.5":   (1.00, 5.00),
}
LEDGER_PATH = DATA_DIR / "cost_ledger.jsonl"
_LOCK = Lock()


def cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """USD for one call. Unknown model -> 0.0 (logged, but priced at zero)."""
    pin, pout = PRICING.get(model, (0.0, 0.0))
    return prompt_tokens / 1e6 * pin + completion_tokens / 1e6 * pout


def record(model: str, prompt_tokens: int, completion_tokens: int,
           op: str = "chat", account: str | None = None,
           cost_usd_actual: float | None = None,
           cache_discount_usd: float | None = None) -> float:
    """Append one usage entry to the ledger and return its cost. `account` enables
    per-account cost attribution (Phase 4 multi-tenancy).

    When `cost_usd_actual` is given (OpenRouter's authoritative `usage.cost`, which
    already reflects prompt-cache discounts), it is recorded verbatim and the entry is
    tagged `priced="openrouter"`. Otherwise we fall back to the static PRICING estimate
    (`priced="estimated"`), so cost is never lost even if the provider omits it."""
    pt, ct = int(prompt_tokens or 0), int(completion_tokens or 0)
    if cost_usd_actual is not None:
        c = float(cost_usd_actual)
        priced = "openrouter"
    else:
        c = cost_usd(model, pt, ct)
        priced = "estimated"
    entry = {"model": model, "op": op, "account": account, "prompt_tokens": pt,
             "completion_tokens": ct, "cost_usd": round(c, 6), "priced": priced}
    if cache_discount_usd is not None:
        entry["cache_discount_usd"] = round(float(cache_discount_usd), 6)
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK, open(LEDGER_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    return c


def total_usd(account: str | None = None) -> float:
    """Total spend, optionally filtered to one account."""
    if not LEDGER_PATH.exists():
        return 0.0
    total = 0.0
    for line in LEDGER_PATH.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        e = json.loads(line)
        if account is None or e.get("account") == account:
            total += e["cost_usd"]
    return round(total, 6)
