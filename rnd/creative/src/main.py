"""CLI entry point for the creative experiment.

  # auto: kit + logo + N on-brand images, grounded in top-ROAS campaigns
  python src/main.py --data ../data/_real_sample.json --select top-roas --images 4

  # review: kit + logo only; edit output/<run>/brand_kit.json, then:
  python src/main.py --mode review --data ../data/_real_sample.json
  python src/main.py --resume 2026-06-19_120000 --data ../data/_real_sample.json --images 4

  # video smoke (EXPLICIT, costs dollars): Veo -> Seedance fallback
  python src/main.py --resume <run> --video --video-provider veo --duration 8
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
    ap.add_argument("--image-provider", default="nanobanana",
                    choices=["nanobanana", "flux", "cloudflare"],
                    help="cloudflare = free FLUX.1 schnell (no card; draft quality)")
    ap.add_argument("--pro", action="store_true", help="use Nano Banana Pro for images")
    ap.add_argument("--aspect", default="4:5")
    ap.add_argument("--size", default="2K", choices=["1K", "2K", "4K"])
    ap.add_argument("--resume", help="run_id to resume (generate images from edited kit)")
    # video smoke (gated)
    ap.add_argument("--video", action="store_true", help="run one video clip (costs $$)")
    ap.add_argument("--video-provider", default="veo", choices=["veo", "seedance"])
    ap.add_argument("--video-prompt", default="")
    ap.add_argument("--duration", type=int, default=8)
    ap.add_argument("--resolution", default="720p", choices=["720p", "1080p", "4k"])
    args = ap.parse_args()

    if args.video:
        run_id = args.resume or _new_run_id()
        prompt = args.video_prompt or "Cinematic product hero shot, slow push-in, on-brand."
        pipeline.video_smoke(run_id=run_id, prompt=prompt, provider=args.video_provider,
                             duration=args.duration, resolution=args.resolution)
        return

    if args.resume:
        pipeline.resume(run_id=args.resume, data_path=args.data, images=args.images,
                        image_provider=args.image_provider, aspect=args.aspect,
                        size=args.size, pro=args.pro)
        return

    pipeline.run(data_path=args.data, run_id=_new_run_id(), strategy=args.select,
                 n_campaigns=args.n_campaigns, mode=args.mode, images=args.images,
                 image_provider=args.image_provider, aspect=args.aspect,
                 size=args.size, pro=args.pro)


if __name__ == "__main__":
    main()
