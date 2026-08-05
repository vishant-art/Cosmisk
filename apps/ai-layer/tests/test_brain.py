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
