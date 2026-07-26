"""Run: ../../.venv/bin/python -m ai_layer.creative._publish_check"""
from pathlib import Path
import tempfile
from ai_layer.creative import service


def main() -> None:
    with tempfile.TemporaryDirectory() as d:
        run = Path(d)
        (run / "ad_00_1x1.png").write_bytes(b"png")
        (run / "timeline_final.mp4").write_bytes(b"mp4")
        (run / "winners").mkdir()
        (run / "winners" / "w_01.png").write_bytes(b"png")
        (run / "variants").mkdir()
        (run / "variants" / "v1.mp4").write_bytes(b"mp4")
        (run / "variants_aesthetic.json").write_text("{}")
        (run / "concept_00_bg.png").write_bytes(b"png")  # scratch — must be SKIPPED
        (run / "logo.png").write_bytes(b"png")           # scratch — must be SKIPPED
        (run / "ledger.jsonl").write_text("{}")          # scratch — must be SKIPPED

        uploaded: list[tuple[str, str]] = []
        service.storage.enabled = lambda: True
        service.storage.put_file = lambda key, path, content_type: uploaded.append((key, content_type))

        service._publish_assets("job9", run)

        keys = {k for k, _ in uploaded}
        assert keys == {"job9/ad_00_1x1.png", "job9/timeline_final.mp4",
                        "job9/winners/w_01.png", "job9/variants/v1.mp4",
                        "job9/variants_aesthetic.json"}, keys
        types = dict(uploaded)
        assert types["job9/ad_00_1x1.png"] == "image/png"
        assert types["job9/timeline_final.mp4"] == "video/mp4"
        assert types["job9/variants_aesthetic.json"] == "application/json"
        print("_publish_assets self-check OK")


if __name__ == "__main__":
    main()
