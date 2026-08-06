"""Calendar WoW/MoM engine + statements adapter (Task 8)."""
from datetime import date, timedelta

import pandas as pd

from ai_layer import brain


def _facts(days=28, roas_recent=1.0, roas_prior=4.0, freq_recent=2.4, freq_prior=1.5):
    """Prior fortnight strong, recent week weak -> WoW decline + FATIGUE flag."""
    out, start = [], date(2026, 7, 1)
    for i in range(days):
        d = start + timedelta(days=i)
        recent = i >= days - 7
        spend = 1000.0
        roas = roas_recent if recent else roas_prior
        out.append({"campaign_name": "Main", "date": d.isoformat(), "spend": spend,
                    "revenue": spend * roas, "impressions": 10000.0, "link_clicks": 150.0,
                    "purchases": 10.0, "frequency": freq_recent if recent else freq_prior,
                    "cpm": 100.0, "link_ctr": 1.5, "cpa": 100.0, "roas": roas})
    return out


def test_analyze_wow_delta_and_fatigue_flag():
    res = brain.analyze(_facts())
    assert "WoW" in res["windows"]
    wow = next(a for a in res["account"] if a["period"] == "WoW")
    assert wow["pct"]["roas"] < -25            # calendar week-over-week, exact math
    camp = res["campaigns"][0]
    assert camp["flag"] == "FATIGUE" and any("fatigue" in c for c in camp["causes"])


def test_analyze_short_window_yields_no_periods():
    res = brain.analyze(_facts(days=7))
    assert res["windows"] == [] and res["account"] == []
    assert "too short" in brain.render_analysis_block(res)


def test_render_block_contains_exact_sections():
    block = brain.render_analysis_block(brain.analyze(_facts()))
    assert "ACCOUNT TREND:" in block and "CAMPAIGN SIGNALS" in block
    assert "likely:" in block                  # deterministic candidate causes


def test_statements_adapter_contract():
    df = pd.DataFrame(_facts())
    stmts = brain.statements(df, "INR")
    tags = [t for t, _ in stmts]
    assert tags[0] == "Overview"
    assert "WARN fatigue" in tags              # maps analyze() FATIGUE -> legacy tag
    known = {"Overview", "Trend", "Best campaign", "Worst campaign", "Wasted spend",
             "Budget concentration", "WARN fatigue", "UP scaling", "Bad day"}
    assert set(tags) <= known                  # never emits a tag /insights can't card
    assert all(isinstance(t, str) and isinstance(x, str) for t, x in stmts)


def _zero_prior_facts():
    """Prior week: nothing at all. Recent week: real spend -> a 0 -> N campaign."""
    out = []
    for i in range(14):
        d = date(2026, 7, 1) + timedelta(days=i)
        recent = i >= 7
        out.append({"campaign_name": "Launch", "date": d.isoformat(),
                    "spend": 100.0 if recent else 0.0,
                    "revenue": 500.0 if recent else 0.0,
                    "impressions": 1000.0 if recent else 0.0,
                    "link_clicks": 50.0 if recent else 0.0,
                    "purchases": 5.0 if recent else 0.0,
                    "frequency": 1.2 if recent else 0.0,
                    "cpm": 100.0, "link_ctr": 5.0, "cpa": 20.0,
                    "roas": 5.0 if recent else 0.0})
    return out


def test_zero_prior_yields_no_percentage_but_keeps_the_flag():
    res = brain.analyze(_zero_prior_facts())
    camp = next(c for c in res["campaigns"] if c["campaign"] == "Launch")
    assert camp["flag"] == "SCALING", "a 0 -> N campaign must still flag (B1 is intentional)"
    assert camp["pct"]["roas"] is None, "no fabricated 100% for a zero prior"
    assert camp["pct"]["spend"] is None
    assert not any("100%" in c for c in camp["causes"]), \
        "the fabricated figure must not reach a cause sentence"


def test_genuine_doubling_still_reports_100_pct():
    """The sentinel and a real doubling are both 100.0 -- only the prior tells them
    apart, so the fix must not blunt genuine +100%."""
    facts = []
    for i in range(14):
        d = date(2026, 7, 1) + timedelta(days=i)
        mult = 2.0 if i >= 7 else 1.0
        facts.append({"campaign_name": "Steady", "date": d.isoformat(),
                      "spend": 100.0 * mult, "revenue": 200.0 * mult,
                      "impressions": 1000.0 * mult, "link_clicks": 50.0 * mult,
                      "purchases": 10.0 * mult, "frequency": 1.0,
                      "cpm": 100.0, "link_ctr": 5.0, "cpa": 10.0, "roas": 2.0})
    res = brain.analyze(facts)
    assert res["account"][0]["pct"]["spend"] == 100.0, "a real doubling is a real +100%"


def test_short_window_states_insufficient_history():
    rows = [{"campaign_name": "c", "date": (date(2026, 7, 1) + timedelta(days=i)).isoformat(),
             "spend": 100.0, "revenue": 200.0, "impressions": 1000.0, "link_clicks": 50.0,
             "purchases": 10.0, "frequency": 1.0, "cpm": 100.0, "link_ctr": 5.0,
             "cpa": 10.0, "roas": 2.0}
            for i in range(7)]                    # 7 days: under the 14-day WoW floor
    stmts = brain.statements(pd.DataFrame(rows))
    assert "Trend" in {t for t, _ in stmts}, "a short window must explain itself"
    text = next(x for t, x in stmts if t == "Trend")
    assert "7 days" in text and "14" in text
