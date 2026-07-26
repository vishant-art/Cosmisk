"""The closed loop (T11): what we made -> what it did -> what we learn.

    make_variants  ->  [operator publishes]  ->  stamp_published  ->  harvest  ->  build_prior
       generate            (manual: nothing            the join         Meta          the brain
                            here publishes an ad)                      metrics        is told

THE MISSING LINK IS MANUAL, ON PURPOSE. `meta_live` is GET-only and this codebase has no
ad-publishing path, so a human ships the ad and stamps its `meta_ad_id` back onto the
variant. Pretending otherwise would mean writing an auto-publisher we cannot test (the Meta
API is suspended) against a token that is read-only in practice. The join is one call.

WHY THE STATISTICS MATTER MORE THAN THE PLUMBING. A `VariantSet` is a controlled experiment
by construction: same base, same account, same window, exactly ONE axis different (the
invariant is enforced in schemas.VariantSet). That is what licenses a causal claim. What it
does NOT license is believing a 12%-vs-9% difference measured on 40 impressions.

So the prior is deliberately hard to convince:
  - an arm below config.PRIOR_MIN_IMPRESSIONS is not reported AT ALL;
  - a difference that fails a two-proportion z-test is reported as UNDECIDED, not as a win;
  - with nothing credible to say, `CreativePrior.to_brief()` returns "" and the brain is
    told nothing.

"We do not know yet" is a correct answer, and it is the one a new account deserves. The
alternative -- a fabricated prior, indistinguishable at the point of use from a measured
one -- is precisely the failure the teardown's provenance discipline exists to prevent.
"""
from __future__ import annotations

import math
from collections import defaultdict

from ai_layer.creative import config
from ai_layer.creative.schemas import ArmResult, AxisFinding, CreativePrior


def _repo():
    """Lazy, so importing this module never requires a database."""
    from ai_layer.db import repository
    return repository


# --- the statistics ------------------------------------------------------------

def two_proportion_z(rate_a: float, n_a: int, rate_b: float, n_b: int) -> float:
    """z for H0: the two thumb-stop rates are the same.

    thumb_stop_rate is video_3_sec_watched / impressions -- a proportion over a known
    denominator, which is exactly the case the normal approximation is for. No scipy: the
    pooled two-proportion test is four lines, and a dependency we cannot justify is a
    dependency we do not add.
    """
    if n_a <= 0 or n_b <= 0:
        return 0.0
    x_a, x_b = rate_a * n_a, rate_b * n_b
    p = (x_a + x_b) / (n_a + n_b)
    if p <= 0 or p >= 1:
        return 0.0
    se = math.sqrt(p * (1 - p) * (1 / n_a + 1 / n_b))
    return 0.0 if se == 0 else (rate_a - rate_b) / se


# --- harvest: Meta's numbers, back onto our variants ---------------------------

def harvest(brand_id: str, account: str, token: str, *, preset: str = "last_30d",
            log=print) -> dict:
    """Pull realized metrics for every PUBLISHED variant and write them onto its row.

    Only touches variants an operator has already stamped with a meta_ad_id. An ad we never
    shipped has no outcome, and inventing one would poison the prior.
    """
    from ai_layer import meta_creatives

    repo = _repo()
    variants = repo.load_variants(brand_id, published_only=True)
    if not variants:
        log("[learn] no published variants to harvest; publish some ads and stamp their "
            "meta_ad_id first")
        return {"harvested": 0, "published": 0, "missing": []}

    rows = meta_creatives.fetch_ad_insights(token, account, preset=preset)
    by_ad = {r["ad_id"]: meta_creatives.metrics_of(r) for r in rows if r.get("ad_id")}

    harvested, missing = 0, []
    for v in variants:
        m = by_ad.get(v["meta_ad_id"])
        if m is None:
            missing.append(v["meta_ad_id"])       # not serving yet, or outside the window
            continue
        repo.record_outcome(v["variant_id"], m)
        harvested += 1

    log(f"[learn] harvested {harvested}/{len(variants)} published variant(s)"
        + (f"; {len(missing)} had no insights in this window" if missing else ""))
    return {"harvested": harvested, "published": len(variants), "missing": missing}


# --- the prior: what this account has actually learned -------------------------

def build_prior(brand_id: str, *, min_impressions: int | None = None,
                z_threshold: float | None = None) -> CreativePrior:
    """Aggregate realized outcomes into the evidence block the brain is conditioned on.

    Comparisons happen WITHIN a variant set (same base_id + axis), never across runs. Two
    ads from different runs differ for a hundred reasons; averaging them is how you end up
    believing something a real A/B test would have killed.
    """
    min_impressions = config.PRIOR_MIN_IMPRESSIONS if min_impressions is None else min_impressions
    z_threshold = config.PRIOR_Z if z_threshold is None else z_threshold

    rows = _repo().load_variants(brand_id)
    prior = CreativePrior(brand_id=brand_id, n_total=len(rows))
    prior.n_published = sum(1 for r in rows if r.get("meta_ad_id"))

    observed = [r for r in rows
                if r.get("thumb_stop_rate") is not None and (r.get("impressions") or 0) > 0]
    prior.n_observed = len(observed)

    # Only arms with a real denominator may speak. A proportion over 40 impressions is
    # noise with a decimal point.
    credible = [r for r in observed if r["impressions"] >= min_impressions]
    prior.arms = [ArmResult(axis=r["axis"], value=r["value"],
                            thumb_stop_rate=r["thumb_stop_rate"],
                            impressions=r["impressions"])
                  for r in credible]

    # Group into experiments: one base_id + one axis = one controlled comparison.
    sets: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in credible:
        sets[(r["base_id"], r["axis"])].append(r)

    for (base_id, axis), arms in sets.items():
        if len(arms) < 2:
            continue                              # an experiment with one arm is an anecdote
        best = max(arms, key=lambda a: a["thumb_stop_rate"])
        worst = min(arms, key=lambda a: a["thumb_stop_rate"])
        if best["variant_id"] == worst["variant_id"]:
            continue
        z = two_proportion_z(best["thumb_stop_rate"], best["impressions"],
                             worst["thumb_stop_rate"], worst["impressions"])
        prior.findings.append(AxisFinding(
            base_id=base_id, axis=axis,
            winner=best["value"], loser=worst["value"],
            winner_rate=best["thumb_stop_rate"], loser_rate=worst["thumb_stop_rate"],
            lift=round(best["thumb_stop_rate"] - worst["thumb_stop_rate"], 6),
            significant=abs(z) >= z_threshold,
            impressions=best["impressions"] + worst["impressions"]))

    # Strongest, most certain finding first: that is the one the brain should weigh most.
    prior.findings.sort(key=lambda f: (f.significant, abs(f.lift)), reverse=True)
    return prior
