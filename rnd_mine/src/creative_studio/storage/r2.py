# src/creative_studio/storage/r2.py
"""R2 (Cloudflare, S3-compatible) asset store for the Creative Studio working copy.

`key_for` is the single source of truth for the canonical key layout (design
doc section 6); every caller that needs a key must go through it rather than
formatting paths inline, so the layout can only change in one place.
"""
from __future__ import annotations

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

_ROOT = "creative-studio"


def _need(parts: dict, name: str, kind: str):
    value = parts.get(name)
    if value is None:
        raise ValueError(f"key_for(kind={kind!r}): missing required part {name!r}")
    return value


def _product_key(parts: dict, kind: str, sub: str, default_filename: str | None) -> str:
    brand_id = _need(parts, "brand_id", kind)
    product_id = _need(parts, "product_id", kind)
    filename = parts.get("filename", default_filename) if default_filename is not None else _need(parts, "filename", kind)
    return f"{_ROOT}/brands/{brand_id}/products/{product_id}/{sub}/{filename}"


def _run_key(parts: dict, kind: str, sub: str) -> str:
    generation_id = _need(parts, "generation_id", kind)
    return f"{_ROOT}/runs/{generation_id}/{sub}"


_FINAL_SUBPATHS = {
    "voice": "voice/narration.wav",
    "subtitles": "voice/subtitles.srt",
    "final_video": "final/ad.mp4",
    "final_static": "final/static.png",
    "thumbnail": "final/thumb.jpg",
}


def key_for(kind: str, **parts) -> str:
    """Build the canonical R2 key for `kind` from `parts`.

    Raises ValueError naming the problem for an unknown kind or a missing
    required part.
    """
    if kind == "product_original":
        return _product_key(parts, kind, "original", default_filename=None)
    if kind == "product_cutout":
        return _product_key(parts, kind, "cutouts", default_filename="cutout.png")
    if kind == "product_mask":
        return _product_key(parts, kind, "masks", default_filename="mask.png")
    if kind == "portrait":
        generation_id = _need(parts, "generation_id", kind)
        filename = parts.get("filename", "primary.png")
        return f"{_ROOT}/runs/{generation_id}/portraits/{filename}"
    if kind == "keyframe_raw":
        generation_id = _need(parts, "generation_id", kind)
        shot = _need(parts, "shot", kind)
        return f"{_ROOT}/runs/{generation_id}/keyframes/shot{shot}/raw.png"
    if kind == "keyframe_replaced":
        generation_id = _need(parts, "generation_id", kind)
        shot = _need(parts, "shot", kind)
        return f"{_ROOT}/runs/{generation_id}/keyframes/shot{shot}/replaced.png"
    if kind == "clip":
        generation_id = _need(parts, "generation_id", kind)
        shot = _need(parts, "shot", kind)
        return f"{_ROOT}/runs/{generation_id}/clips/shot{shot}.mp4"
    if kind in _FINAL_SUBPATHS:
        return _run_key(parts, kind, _FINAL_SUBPATHS[kind])
    raise ValueError(f"key_for: unknown kind {kind!r}")


class R2Store:
    """Thin boto3-backed client for the `creative-studio/...` R2 layout."""

    def __init__(self, settings) -> None:
        self._bucket = settings.storage_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.storage_endpoint,
            aws_access_key_id=settings.storage_access_key_id,
            aws_secret_access_key=settings.storage_secret_access_key,
            region_name=settings.storage_region,
            config=BotoConfig(s3={"addressing_style": "path"}),
        )

    def put_bytes(self, key: str, data: bytes, content_type: str) -> str:
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)
        return f"r2://{self._bucket}/{key}"

    def get_bytes(self, key: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket, Key=key)
        return response["Body"].read()

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if error_code in ("404", "NoSuchKey") or status == 404:
                return False
            raise
        return True

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def presign(self, key: str, expires: int = 3600) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires,
        )

    def key_from_uri(self, uri: str) -> str:
        prefix = f"r2://{self._bucket}/"
        if not uri.startswith(prefix):
            raise ValueError(f"key_from_uri: {uri!r} is not an r2://{self._bucket}/... uri")
        return uri[len(prefix):]
