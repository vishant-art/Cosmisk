"""The creative graph (T12): stop storing ads, start storing CHOICES.

An ad is not one thing. It is a bundle of independent decisions -- a hook category, a
camera, a cutting rhythm, when the CTA lands -- and "which ad won" is a nearly useless
question next to "which CHOICE won". A folder of winning MP4s cannot answer "does fast
cutting work for this brand". A table of atoms can.

    CreativeTemplate (one torn-down ad)  ->  atoms_of()  ->  [hook_type=pov, pacing=fast, ...]
    many templates, BOTH cohorts         ->  build_graph()  ->  winner-rate vs loser-rate per atom

WHY BOTH TAILS, AGAIN. The contrast IS the statistic. "Pattern interrupt appears in 60% of
winners" is exactly as true, and exactly as meaningless, as "60% of winners ran on a
Tuesday": you cannot estimate an effect from a sample selected on the effect. It only
becomes a claim when you can also say it appears in 20% of losers. A winner-only corpus is
not a smaller dataset, it is an UNIDENTIFIABLE one, so `build_graph` refuses to emit a brief
without a negative class (schemas.CreativeGraph.identifiable).

AND IT IS STILL ONLY A CORRELATION. Winners differ from losers in a hundred ways that are
not this atom: budget, audience, product, season, luck. The graph says "more common in
winners", never "causes wins". The only causal claim in this system is a VariantSet finding,
where exactly one axis was changed on purpose and everything else was held (outcomes.py).
The two are injected into the brain as different kinds of evidence, and the weaker one says
so in its own first line.

Every atom is MEASURED from frames/ASR or CLASSIFIED from a closed set. Nothing is inferred.
There is no `emotion` atom and no `music` atom, because a VLM would label both confidently
and unfalsifiably -- the same trap CreativeTemplate's provenance rule closes.
"""
from __future__ import annotations

from collections import defaultdict

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from schemas import AtomStat, CreativeGraph, CreativeTemplate

# An atom must appear in at least this many ads before it may be reported. One winner that
# happened to use a macro shot is not a finding about macro shots.
MIN_ADS_PER_ATOM = 3


def _bucket(value: float | None, edges: list[tuple[float, str]]) -> str | None:
    """Continuous measurement -> a named band. Bands, not raw floats, because 'avg shot
    2.1s' and 'avg shot 2.2s' are the same creative decision and must aggregate as one."""
    if value is None:
        return None
    for upper, label in edges:
        if value < upper:
            return label
    return edges[-1][1] if edges else None


def atoms_of(t: CreativeTemplate) -> list[tuple[str, str]]:
    """Decompose one torn-down ad into (kind, value) atoms. Only what was measured or
    classified; a missing field yields no atom rather than a default one."""
    atoms: list[tuple[str, str]] = []

    if t.hook_type:
        atoms.append(("hook_type", t.hook_type))
    if t.ad_format:
        atoms.append(("ad_format", t.ad_format))
    if t.style is not None:
        for kind in ("camera", "lighting", "framing"):
            v = getattr(t.style, kind, None)
            if v:
                atoms.append((kind, v))

    # MEASURED, bucketed. The cutting rhythm is a creative decision; the raw float is not.
    pacing = _bucket(t.avg_shot_length_s or None,
                     [(2.0, "fast"), (4.0, "medium"), (float("inf"), "slow")])
    if pacing:
        atoms.append(("pacing", pacing))

    first_cut = _bucket(t.time_to_first_cut_s or None,
                        [(1.5, "immediate"), (3.0, "quick"), (float("inf"), "held")])
    if first_cut:
        atoms.append(("first_cut", first_cut))

    speech = _bucket(t.words_per_minute,
                     [(130.0, "slow"), (170.0, "normal"), (float("inf"), "fast")])
    if speech:
        atoms.append(("speech_pace", speech))

    # WHEN the ask lands, as a fraction of the ad. An absolute second is not comparable
    # across a 12s ad and a 40s one.
    if t.cta_start_s is not None and t.duration_s:
        frac = t.cta_start_s / t.duration_s
        band = _bucket(frac, [(0.4, "early"), (0.75, "middle"), (float("inf"), "late")])
        if band:
            atoms.append(("cta_timing", band))

    return atoms


def build_graph(brand_id: str, templates=None, *, min_ads: int = MIN_ADS_PER_ATOM
                ) -> CreativeGraph:
    """Aggregate an account's torn-down ads into per-atom winner-vs-loser contrasts.

    `templates` may be passed directly (tests, one-offs); otherwise the account's durable
    teardown library is loaded from Postgres.
    """
    if templates is None:
        templates = _load_templates(brand_id)

    winners = [t for t in templates if t.cohort == "winner"]
    losers = [t for t in templates if t.cohort == "loser"]
    graph = CreativeGraph(brand_id=brand_id, n_winners=len(winners), n_losers=len(losers))
    if not templates:
        return graph

    # (kind, value) -> counts per cohort, plus the thumb-stops of the ads carrying it
    seen: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"winner": 0, "loser": 0, "thumb": []})
    for t in templates:
        for atom in set(atoms_of(t)):          # set(): an atom is present or not, not twice
            row = seen[atom]
            row[t.cohort] += 1
            if t.thumb_stop_rate is not None:
                row["thumb"].append(t.thumb_stop_rate)

    n_w, n_l = len(winners) or 1, len(losers) or 1
    for (kind, value), row in seen.items():
        n_ads = row["winner"] + row["loser"]
        if n_ads < min_ads:
            continue                            # one ad using a macro shot is not a finding
        thumbs = row["thumb"]
        graph.atoms.append(AtomStat(
            kind=kind, value=value,
            n_winners=row["winner"], n_losers=row["loser"],
            winner_rate=row["winner"] / n_w,
            loser_rate=row["loser"] / n_l,
            lift=round(row["winner"] / n_w - row["loser"] / n_l, 6),
            mean_thumb_stop=(round(sum(thumbs) / len(thumbs), 6) if thumbs else None)))

    graph.atoms.sort(key=lambda a: abs(a.lift), reverse=True)
    return graph


# --- the durable teardown library ----------------------------------------------

def _load_templates(brand_id: str) -> list[CreativeTemplate]:
    import library as repository
    return [CreativeTemplate.model_validate(r["template_json"])
            for r in repository.load_teardowns(brand_id) if r.get("template_json")]


def remember(brand_id: str, template: CreativeTemplate) -> bool:
    """Persist one teardown. A teardown is expensive (one ASR + one vision call) and
    IMMUTABLE -- an ad's structure does not change after it ran -- so it is cached by
    (brand, ad_id) and never recomputed. That is what turns a per-run cost into a library
    that compounds."""
    try:
        import library as repository
        return repository.save_teardown(brand_id, template.ad_id, template.cohort,
                                        template.model_dump(mode="json"),
                                        template.thumb_stop_rate)
    except Exception:  # noqa: BLE001 -- no DB is not a reason to fail a run
        return False


def already_known(brand_id: str, ad_id: str) -> bool:
    """True when this ad has already been torn down, so we do not pay for it twice."""
    try:
        import library as repository
        return repository.has_teardown(brand_id, ad_id)
    except Exception:  # noqa: BLE001
        return False
