"""CLI entry point for the creative experiment (fal-only generation).

  # auto: kit + logo + N on-brand ads (text-free bg -> composite -> QA), multi-format
  python src/main.py --data ../data/_real_sample.json --select top-roas --images 4 \
      --formats 1:1,4:5,9:16 --vlm

  # review: kit + logo only; edit output/<run>/brand_kit.json, then:
  python src/main.py --mode review --data ../data/_real_sample.json
  python src/main.py --resume 2026-06-19_120000 --data ../data/_real_sample.json --images 4

  # video smoke (EXPLICIT, costs dollars): Seedance i2v from the text-free bg -> t2v
  python src/main.py --resume <run> --video --duration 5
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import pipeline  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8")     # Windows cp1252 chokes on ₹/€
except (AttributeError, ValueError):
    pass


def _new_run_id() -> str:
    return datetime.now().strftime("%Y-%m-%d_%H%M%S")


_DEFAULT_VIDEO_PROMPT = {
    "ugc": ("Filmed on a phone, handheld with small natural movement. Ordinary room, "
            "soft daylight from a window. Unstyled and lived-in, like a customer shot it."),
    "studio": "Cinematic product hero shot, slow push-in, on-brand.",
}


def main() -> None:
    ap = argparse.ArgumentParser(description="Creative Studio CLI experiment")
    ap.add_argument("--data", default=str(config.DEFAULT_DATA),
                    help="campaign data JSON (Meta envelope); default rnd/data mock")
    ap.add_argument("--select", default="top-roas",
                    choices=["last-n", "top-roas", "top-revenue", "all"])
    ap.add_argument("--n-campaigns", type=int, default=5)
    ap.add_argument("--mode", default="auto", choices=["auto", "review"])
    ap.add_argument("--images", type=int, default=5)
    ap.add_argument("--image-provider", default="flux",
                    choices=["flux", "flux_pro", "product"],
                    help="flux = FLUX.2 flex (brand scenes); product = Bria product-shot")
    ap.add_argument("--pro", action="store_true", help="use FLUX.2 [pro] for images")
    ap.add_argument("--no-logo", action="store_true",
                    help="do not generate or composite a logo onto the ads")
    ap.add_argument("--formats", default="4:5",
                    help="comma list of aspect ratios: 1:1,4:5,9:16,16:9 (first is the base)")
    ap.add_argument("--qa-retries", type=int, default=1,
                    help="background regenerations allowed before a concept is rejected")
    ap.add_argument("--vlm", action="store_true", help="run the VLM critic in the QA gate")
    # condition generation on REAL assets (Meta winners / a product image / explicit refs)
    ap.add_argument("--meta-account", help="act_<id>: pull the creative cohort as refs")
    ap.add_argument("--meta-preset", default="last_30d", help="Meta date_preset for the cohort")
    ap.add_argument("--top-creatives", type=int, default=5, help="how many winners to pull")
    ap.add_argument("--bottom-creatives", type=int, default=5,
                    help="how many LOSERS to pull; a winner-only corpus cannot support "
                         "an effect estimate (roadmap UGC-D5)")
    ap.add_argument("--min-spend", type=float, default=100.0,
                    help="spend floor for cohort eligibility; below it a low-ROAS ad is "
                         "not a loser, it is an ad that never got a chance")
    ap.add_argument("--no-ground", action="store_true",
                    help="do NOT ground the brand kit in the pulled winners. Grounding is "
                         "on by default: the vision pass is the only place the brain looks "
                         "at what actually converted for this account")
    ap.add_argument("--style", default="ugc", choices=["ugc", "studio"],
                    help="ugc = amateur capture aesthetic (default); studio = the old "
                         "premium editorial look, for product/catalogue work")
    ap.add_argument("--product", help="path to a product image -> Bria product-shot scenes")
    ap.add_argument("--ref", action="append", default=[],
                    help="explicit reference image path(s) for generation; repeatable")
    ap.add_argument("--resume", help="run_id to resume (generate ads from edited kit)")
    # script + storyboard (T6). No pixels: a shot list a human could shoot.
    ap.add_argument("--storyboard", action="store_true",
                    help="plan a Script + Storyboard for an existing run (needs --resume). "
                         "Renders nothing; the sequence IS the creative")
    ap.add_argument("--seconds", type=int, default=config.STORY_DEFAULT_SECONDS,
                    help="target length of the storyboard, in seconds")
    # sequenced render (T7). COSTS REAL MONEY: one Seedance clip per shot.
    ap.add_argument("--render", action="store_true",
                    help="render a planned storyboard into a timeline (needs --resume). "
                         "Costs $$: the renderer's floor is 4s, so a 2s shot bills 4s")
    ap.add_argument("--single-pass", action="store_true",
                    help="render the whole ad as ONE clip instead of shot by shot. Loses "
                         "per-shot repair and continuity; only sensible on a model that "
                         "holds a multi-shot structure by itself (UGC-D1 v2b)")
    # structural variants (T10): hold everything fixed, vary one axis.
    ap.add_argument("--variants", choices=["hook_type", "caption_style", "aesthetic"],
                    help="produce a matched variant set for a run (needs --resume). "
                         "caption_style/aesthetic cut the finished timeline for $0; "
                         "hook_type writes matched scripts to render separately")
    ap.add_argument("--variant-values", default="",
                    help="comma list of axis values, e.g. "
                         "pattern_interrupt,bold_claim,question")
    # temporal QA gate (T9). Free unless --qa-vlm.
    ap.add_argument("--qa", action="store_true",
                    help="verify a run's finished clip against its storyboard + script "
                         "(needs --resume). Four of five checks are arithmetic and free")
    ap.add_argument("--qa-clip", help="verify this clip instead of the run's final one")
    ap.add_argument("--qa-vlm", action="store_true",
                    help="also run the vision critic on a keyframe contact sheet (costs $)")
    ap.add_argument("--qa-lenient", action="store_true",
                    help="ship on an INCONCLUSIVE check instead of failing. An explicit "
                         "decision to release something we could not verify")
    # video smoke (gated)
    ap.add_argument("--video", action="store_true", help="run one video clip (costs $$)")
    ap.add_argument("--video-prompt", default="")
    ap.add_argument("--duration", type=int, default=10, help="clip length in seconds")
    ap.add_argument("--resolution", default="720p", choices=["720p", "1080p"])
    ap.add_argument("--video-aspect", default="9:16", choices=["9:16", "16:9"])
    ap.add_argument("--no-audio", action="store_true",
                    help="disable Seedance native audio (on by default)")
    ap.add_argument("--voiceover", action="store_true",
                    help="add an AI voiceover (brain script -> fal TTS -> muxed)")
    ap.add_argument("--no-captions", action="store_true",
                    help="do NOT burn per-word captions over the voiceover. Captions are "
                         "on by default with --voiceover: they are the strongest single "
                         "signal that a clip is creator content rather than an ad")
    args = ap.parse_args()

    formats = [f.strip() for f in args.formats.split(",") if f.strip()]
    from schemas import UGCStyle  # noqa: E402
    style = UGCStyle.model_validate(
        config.UGC_STYLE_DEFAULT if args.style == "ugc" else config.STUDIO_STYLE)

    if args.storyboard:
        if not args.resume:
            ap.error("--storyboard needs --resume <run_id> (it reads that run's "
                     "brand_kit.json and template.json)")
        pipeline.plan_story(run_id=args.resume, data_path=args.data, seconds=args.seconds)
        return

    if args.variants:
        if not args.resume:
            ap.error("--variants needs --resume <run_id>")
        vals = [v.strip() for v in args.variant_values.split(",") if v.strip()]
        if len(vals) < 2:
            ap.error("--variants needs --variant-values with at least two comma-separated "
                     "values to compare")
        pipeline.make_variants(run_id=args.resume, axis=args.variants, values=vals)
        return

    if args.render:
        if not args.resume:
            ap.error("--render needs --resume <run_id> (it reads that run's "
                     "storyboard.json and brand_kit.json). Plan one with --storyboard.")
        pipeline.render_story(run_id=args.resume, style=style, aspect=args.video_aspect,
                              resolution=args.resolution, single_pass=args.single_pass,
                              finish=not args.no_captions)
        return

    if args.qa:
        if not args.resume:
            ap.error("--qa needs --resume <run_id> (it reads that run's storyboard.json)")
        report = pipeline.qa_video(run_id=args.resume, clip=args.qa_clip,
                                   strict=not args.qa_lenient, run_vlm=args.qa_vlm)
        for c in report.checks:
            mark = "OK  " if c.passed else ("?   " if c.inconclusive else "FAIL")
            print(f"  {mark} {c.name:<18} {c.detail}")
        raise SystemExit(0 if report.approved else 1)

    if args.video:
        run_id = args.resume or _new_run_id()
        # The old default asked, in as many words, for an advertisement: "Cinematic
        # product hero shot, slow push-in, on-brand." No winning Reel has a slow
        # cinematic push-in. That one string literal was the whole gap.
        prompt = args.video_prompt or _DEFAULT_VIDEO_PROMPT[args.style]
        # for a voiceover we need the brand kit (+ an LLM client) from the run dir
        kit, client = None, None
        if args.voiceover:
            from schemas import BrandKit  # noqa: E402
            kit_file = config.OUTPUT_DIR / run_id / "brand_kit.json"
            if kit_file.exists():
                kit = BrandKit.model_validate_json(kit_file.read_text("utf-8"))
                client = pipeline._client()
        pipeline.video_smoke(run_id=run_id, prompt=prompt, duration=args.duration,
                             resolution=args.resolution, aspect=args.video_aspect,
                             generate_audio=not args.no_audio, voiceover=args.voiceover,
                             captions=not args.no_captions, kit=kit, client=client)
        return

    refs = args.ref or None

    if args.resume:
        pipeline.resume(run_id=args.resume, data_path=args.data, images=args.images,
                        image_provider=args.image_provider, formats=formats,
                        qa_retries=args.qa_retries, run_vlm=args.vlm, pro=args.pro,
                        refs=refs, product_image=args.product, style=style)
        return

    # Grounding is the default (Phase 9.1): fall back to the env-configured account so a
    # normal run attempts winner grounding without needing --meta-account. If the account
    # is unset or the token is down, _meta_cohort degrades gracefully to UNGROUNDED.
    meta_account = args.meta_account or config.META_AD_ACCOUNT

    pipeline.run(data_path=args.data, run_id=_new_run_id(), strategy=args.select,
                 n_campaigns=args.n_campaigns, mode=args.mode, images=args.images,
                 image_provider=args.image_provider, formats=formats,
                 qa_retries=args.qa_retries, run_vlm=args.vlm, pro=args.pro,
                 refs=refs, product_image=args.product, meta_account=meta_account,
                 ground_from_meta=not args.no_ground, meta_preset=args.meta_preset,
                 top_creatives=args.top_creatives, bottom_creatives=args.bottom_creatives,
                 min_spend=args.min_spend, style=style, no_logo=args.no_logo)


if __name__ == "__main__":
    main()
