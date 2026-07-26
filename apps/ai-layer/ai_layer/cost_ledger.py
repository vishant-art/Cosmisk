"""Python-side LLM cost ledger — thin shim over the Neon repository.

`PRICING` + `cost_usd` stay here (the estimate source used when a provider omits its
authoritative cost); `record`/`total_usd` delegate to the DB (ai_layer.cost_ledger table)."""
from __future__ import annotations

PRICING: dict[str, tuple[float, float]] = {
    "google/gemini-2.5-flash":      (0.30, 2.50),
    "google/gemini-2.5-flash-lite": (0.10, 0.40),
    "openai/gpt-5-nano":            (0.05, 0.40),
    "openai/gpt-5-mini":            (0.25, 2.00),
    "anthropic/claude-haiku-4.5":   (1.00, 5.00),
}


def cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """USD for one call. Unknown model -> 0.0 (logged, but priced at zero)."""
    pin, pout = PRICING.get(model, (0.0, 0.0))
    return prompt_tokens / 1e6 * pin + completion_tokens / 1e6 * pout


def record(model: str, prompt_tokens: int, completion_tokens: int,
           op: str = "chat", account: str | None = None,
           cost_usd_actual: float | None = None,
           cache_discount_usd: float | None = None) -> float:
    from ai_layer.db import repository as _repo  # lazy: avoids import cycle
    return _repo.record_cost(model, prompt_tokens, completion_tokens, op=op, account=account,
                             cost_usd_actual=cost_usd_actual, cache_discount_usd=cache_discount_usd)


def total_usd(account: str | None = None) -> float:
    from ai_layer.db import repository as _repo
    return _repo.total_usd(account=account)
