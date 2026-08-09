"""Vendor-neutral S3 object store for FINISHED creative deliverables (R2 in prod).

ffmpeg scratch stays on local disk; only delivered files land here. When STORAGE_BUCKET
is unset every caller falls back to local disk — enabled() gates that.

Key convention: {PREFIX}{job_id}/{relpath}. PREFIX defaults empty (single-tenant); a real
tenant_id/ prefix is deferred to the per-brand identity work.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


def enabled() -> bool:
    return bool(os.getenv("STORAGE_BUCKET"))


def asset_key(job_id: str, relpath: str) -> str:
    return f"{os.getenv('STORAGE_PREFIX', '')}{job_id}/{relpath}"


@lru_cache(maxsize=1)
def _client():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3",
        endpoint_url=os.environ["STORAGE_ENDPOINT"],
        aws_access_key_id=os.environ["STORAGE_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["STORAGE_SECRET_ACCESS_KEY"],
        region_name=os.getenv("STORAGE_REGION", "auto"),
        # R2 rejects the boto3>=1.36 default aws-chunked checksums.
        config=Config(request_checksum_calculation="when_required",
                      response_checksum_validation="when_required"),
    )


def put_file(key: str, local_path: str | Path, content_type: str) -> None:
    """Plain PutObject (never multipart) — one Class A op per delivered file."""
    with open(local_path, "rb") as fh:
        _client().put_object(Bucket=os.environ["STORAGE_BUCKET"], Key=key,
                             Body=fh, ContentType=content_type)


def presign_get(key: str, expires: int = 3600, *, filename: str | None = None) -> str:
    """Presigned GET. With `filename`, signs in a Content-Disposition: attachment so the
    browser saves rather than renders: the <a download> attribute is IGNORED cross-origin,
    so the header is the only thing that actually produces a save dialog in prod."""
    params = {"Bucket": os.environ["STORAGE_BUCKET"], "Key": key}
    if filename:
        # Quote the filename: a comma or space in it would otherwise split the header value.
        params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
    return _client().generate_presigned_url("get_object", Params=params, ExpiresIn=expires)


if __name__ == "__main__":  # ponytail: assert-based self-check, no pytest harness / no DB
    import os
    os.environ.update(
        STORAGE_ENDPOINT="https://acct.r2.cloudflarestorage.com",
        STORAGE_ACCESS_KEY_ID="AKIA_TEST", STORAGE_SECRET_ACCESS_KEY="secret_test",
        STORAGE_BUCKET="cosmisk-media", STORAGE_REGION="auto", STORAGE_PREFIX="",
    )
    _client.cache_clear()
    assert enabled() is True
    assert asset_key("job123", "winners/w_06.png") == "job123/winners/w_06.png"
    url = presign_get("job123/a.png", expires=60)
    assert url.startswith("https://acct.r2.cloudflarestorage.com/cosmisk-media/job123/a.png")
    assert "X-Amz-Signature=" in url and "X-Amz-Expires=60" in url
    os.environ["STORAGE_PREFIX"] = "tenantA/"
    assert asset_key("j", "a.png") == "tenantA/j/a.png"
    del os.environ["STORAGE_BUCKET"]
    assert enabled() is False
    print("ai_layer.storage self-check OK")
