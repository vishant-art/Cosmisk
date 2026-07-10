"""The two-tailed cohort (UGC-D5) and the creative-proximal outcome metrics (UGC-D6).

Why these tests exist. A corpus of winners only has no negative class and no variance
in the outcome, so every structural feature it contains is, by construction, a feature
of a winner. "Pattern interrupt appears in 40% of winners" is exactly as true, and
exactly as meaningless, as "40% of winners ran on a Tuesday". The defect is not a small
sample, it is an unidentifiable one, and it cannot be repaired after the fact because
the losers were never downloaded.

$0 and offline: `_api` and `_download` are module-level seams in meta_creatives.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import meta_creatives as mc  # noqa: E402


def _row(ad_id, *, roas, spend, impressions=10_000, three_sec=None, thruplay=None):
    row = {
        "ad_id": ad_id, "ad_name": f"ad {ad_id}", "spend": str(spend),
        "impressions": str(impressions),
        "purchase_roas": [{"action_type": "purchase", "value": str(roas)}],
    }
    if three_sec is not None:
        row["video_3_sec_watched_actions"] = [{"action_type": "video_view",
                                               "value": str(three_sec)}]
    if thruplay is not None:
        row["video_thruplay_watched_actions"] = [{"action_type": "video_view",
                                                  "value": str(thruplay)}]
    return row


# --- UGC-D6: the outcome variable ----------------------------------------------

def test_thumb_stop_rate_is_three_sec_over_impressions():
    m = mc.metrics_of(_row("a", roas=3.0, spend=500, impressions=10_000, three_sec=2_500))
    assert m["thumb_stop_rate"] == pytest.approx(0.25)


def test_rates_are_none_not_zero_without_impressions():
    """'We did not observe this' and 'nobody stopped' are different facts, and a 0.0
    silently poisons any average taken over the corpus later."""
    m = mc.metrics_of(_row("a", roas=0.0, spend=0, impressions=0, three_sec=0))
    assert m["thumb_stop_rate"] is None
    assert m["thruplay_rate"] is None


def test_roas_rides_along_but_is_not_the_signal():
    m = mc.metrics_of(_row("a", roas=4.5, spend=500))
    assert m["roas"] == pytest.approx(4.5)
    assert m["thumb_stop_rate"] is None       # no video fields -> absent, not fabricated


# --- UGC-D5: both tails ---------------------------------------------------------

def test_cohort_returns_winners_and_losers():
    rows = [_row("hi1", roas=6.0, spend=500), _row("hi2", roas=5.0, spend=500),
            _row("lo1", roas=0.4, spend=500), _row("lo2", roas=0.2, spend=500)]
    picks = mc.rank_cohort(rows, top_n=2, bottom_n=2, min_spend=100)

    cohorts = {aid: cohort for aid, _, _, cohort, _ in picks}
    assert cohorts == {"hi1": "winner", "hi2": "winner",
                       "lo1": "loser", "lo2": "loser"}


def test_spend_floor_excludes_ads_that_never_got_a_chance():
    """A low-ROAS ad under the floor is not a loser. It is an ad with no data, and
    labelling it a loser would teach the model that its structure failed."""
    rows = [_row("hi", roas=6.0, spend=500), _row("starved", roas=0.1, spend=5)]
    picks = mc.rank_cohort(rows, top_n=2, bottom_n=2, min_spend=100)
    assert [p[0] for p in picks] == ["hi"]


def test_tails_never_overlap_on_a_thin_account():
    """With 3 eligible ads and top_n=bottom_n=2 the naive slice labels the middle ad
    both winner and loser. That would put the same structure on both sides of the
    contrast, which is worse than having no contrast at all."""
    rows = [_row("a", roas=6.0, spend=500), _row("b", roas=3.0, spend=500),
            _row("c", roas=1.0, spend=500)]
    picks = mc.rank_cohort(rows, top_n=2, bottom_n=2, min_spend=100)

    ids = [p[0] for p in picks]
    assert len(ids) == len(set(ids)), f"an ad appears in both tails: {ids}"
    assert dict((p[0], p[3]) for p in picks)["b"] == "winner"   # top slice wins ties


def test_empty_cohort_when_nothing_clears_the_floor():
    rows = [_row("a", roas=6.0, spend=10), _row("b", roas=1.0, spend=20)]
    assert mc.rank_cohort(rows, min_spend=100) == []


# --- asset fetch: the still AND the mp4 -----------------------------------------

def test_one_asset_keeps_both_the_still_and_the_video(monkeypatch, tmp_path):
    """The MP4 used to be reachable only when no image existed, and was then dropped
    by a kind=='image' filter downstream. Both must survive: the still conditions FLUX,
    the MP4 is the teardown's only input."""
    monkeypatch.setattr(mc, "_api", lambda path, params: {
        "creative": {"image_url": "https://cdn/img.png", "video_id": "v9"}
    } if not path.startswith("v") else {
        "source": "https://cdn/clip.mp4", "permalink_url": "https://fb/p"})

    written = []

    def _dl(url, out_path):
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_bytes(b"x")
        written.append(str(out_path))
        return str(out_path)

    monkeypatch.setattr(mc, "_download", _dl)

    asset = mc._one_asset("tok", "act_1", "ad_7", "Seven", 4.2, tmp_path, 1, True,
                          cohort="winner", metrics={"thumb_stop_rate": 0.3})
    assert asset.local_path and asset.local_path.endswith("winner_01.png")
    assert asset.video_path and asset.video_path.endswith("winner_01.mp4")
    assert asset.kind == "video" and asset.has_source is True
    assert asset.cohort == "winner"
    assert asset.metrics["thumb_stop_rate"] == pytest.approx(0.3)


def test_video_fields_are_requested_from_meta():
    """UGC-D6 is worthless if the fields are never asked for. Every day they are not
    collected is a day of data that cannot be recovered."""
    for field in ("video_3_sec_watched_actions", "video_thruplay_watched_actions",
                  "video_avg_time_watched_actions"):
        assert field in mc.AD_FIELDS
