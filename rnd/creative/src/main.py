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
    ap.add_argument("--meta-account", help="act_<id>: pull winning running-ad images as refs")
    ap.add_argument("--meta-preset", default="last_30d", help="Meta date_preset for winners")
    ap.add_argument("--top-creatives", type=int, default=5, help="how many winners to pull")
    ap.add_argument("--ground", action="store_true",
                    help="ground the brand kit in the pulled winners (vision pass)")
    ap.add_argument("--product", help="path to a product image -> Bria product-shot scenes")
    ap.add_argument("--ref", action="append", default=[],
                    help="explicit reference image path(s) for generation; repeatable")
    ap.add_argument("--resume", help="run_id to resume (generate ads from edited kit)")
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
    args = ap.parse_args()

    formats = [f.strip() for f in args.formats.split(",") if f.strip()]

    if args.video:
        run_id = args.resume or _new_run_id()
        prompt = args.video_prompt or "Cinematic product hero shot, slow push-in, on-brand."
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
                             kit=kit, client=client)
        return

    refs = args.ref or None

    if args.resume:
        pipeline.resume(run_id=args.resume, data_path=args.data, images=args.images,
                        image_provider=args.image_provider, formats=formats,
                        qa_retries=args.qa_retries, run_vlm=args.vlm, pro=args.pro,
                        refs=refs, product_image=args.product)
        return

    pipeline.run(data_path=args.data, run_id=_new_run_id(), strategy=args.select,
                 n_campaigns=args.n_campaigns, mode=args.mode, images=args.images,
                 image_provider=args.image_provider, formats=formats,
                 qa_retries=args.qa_retries, run_vlm=args.vlm, pro=args.pro,
                 refs=refs, product_image=args.product, meta_account=args.meta_account,
                 ground_from_meta=args.ground, meta_preset=args.meta_preset,
                 top_creatives=args.top_creatives, no_logo=args.no_logo)


if __name__ == "__main__":
    main()
