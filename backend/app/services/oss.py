"""Aliyun OSS upload helpers.

Local files stay on disk for FFmpeg; DB / frontend use public OSS URLs.
Object key layout: {folder}/generated/p{id}/... and {folder}/ for SPA.
"""

from __future__ import annotations

import logging
import mimetypes
from functools import lru_cache
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache
def _bucket():
    import oss2

    s = get_settings()
    if not s.oss_enabled:
        raise RuntimeError("OSS disabled")
    if not (s.oss_bucket and s.oss_access_key_id and s.oss_access_key_secret):
        raise RuntimeError("OSS credentials incomplete")
    auth = oss2.Auth(s.oss_access_key_id, s.oss_access_key_secret)
    endpoint = s.oss_endpoint.strip()
    if not endpoint.startswith("http"):
        endpoint = f"https://{endpoint}"
    return oss2.Bucket(auth, endpoint, s.oss_bucket)


def oss_enabled() -> bool:
    s = get_settings()
    return bool(
        s.oss_enabled
        and s.oss_bucket
        and s.oss_access_key_id
        and s.oss_access_key_secret
    )


def folder_prefix() -> str:
    return get_settings().oss_folder.strip().strip("/") or "kepu"


def public_base() -> str:
    s = get_settings()
    if s.oss_public_base.strip():
        return s.oss_public_base.rstrip("/")
    ep = s.oss_endpoint.strip().removeprefix("https://").removeprefix("http://")
    return f"https://{s.oss_bucket}.{ep}"


def public_url(object_key: str) -> str:
    key = object_key.lstrip("/")
    return f"{public_base()}/{key}"


def key_for_local(path: Path, *, static_root: Path) -> str:
    """Map backend/static/... → {folder}/..."""
    rel = path.resolve().relative_to(static_root.resolve()).as_posix()
    return f"{folder_prefix()}/{rel}"


def upload_file(local_path: Path, object_key: str | None = None) -> str:
    """Upload local file; return public URL. Raises on failure."""
    from app.services import storage

    path = Path(local_path)
    if not path.is_file():
        raise FileNotFoundError(str(path))
    key = object_key or key_for_local(path, static_root=storage.STATIC_ROOT)
    key = key.lstrip("/")
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    headers = {
        "Content-Type": mime,
        "x-oss-object-acl": "public-read",
    }
    bucket = _bucket()
    bucket.put_object_from_file(key, str(path), headers=headers)
    url = public_url(key)
    logger.info("oss uploaded %s → %s", path.name, url)
    return url


def upload_bytes(data: bytes, object_key: str, *, content_type: str = "application/octet-stream") -> str:
    key = object_key.lstrip("/")
    headers = {"Content-Type": content_type, "x-oss-object-acl": "public-read"}
    _bucket().put_object(key, data, headers=headers)
    return public_url(key)


def upload_dir(local_dir: Path, oss_prefix: str) -> int:
    """Upload directory recursively under oss_prefix. Returns file count."""
    root = Path(local_dir)
    if not root.is_dir():
        raise NotADirectoryError(str(root))
    prefix = oss_prefix.strip().strip("/")
    count = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        key = f"{prefix}/{rel}"
        upload_file(path, key)
        count += 1
    return count
