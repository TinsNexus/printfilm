"""Download / persist generated assets under backend/static/generated.

When OSS is enabled, public URLs point to OSS while FFmpeg still uses local files.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
from pathlib import Path

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

STATIC_ROOT = Path(__file__).resolve().parents[2] / "static"
GENERATED_ROOT = STATIC_ROOT / "generated"


def project_dir(project_id: int) -> Path:
    path = GENERATED_ROOT / f"p{project_id}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def to_public_url(rel_or_abs: str) -> str:
    """Convert /static/... path to absolute URL for frontend."""
    if rel_or_abs.startswith("http://") or rel_or_abs.startswith("https://"):
        return rel_or_abs
    settings = get_settings()
    if not rel_or_abs.startswith("/"):
        rel_or_abs = "/" + rel_or_abs
    return f"{settings.public_base_url.rstrip('/')}{rel_or_abs}"


def local_path_from_url(url: str) -> Path | None:
    """Resolve DB/media URL to a local filesystem path when possible."""
    if not url:
        return None
    if url.startswith("/static/"):
        return STATIC_ROOT / url.removeprefix("/static/")
    settings = get_settings()
    prefix = settings.public_base_url.rstrip("/") + "/static/"
    if url.startswith(prefix):
        return STATIC_ROOT / url.removeprefix(prefix)

    # OSS public URL → kepu/generated/... → static/generated/...
    if url.startswith("http://") or url.startswith("https://"):
        from app.services import oss as oss_svc

        if oss_svc.oss_enabled():
            folder = oss_svc.folder_prefix()
            marker = f"/{folder}/"
            idx = url.find(marker)
            if idx >= 0:
                rest = url[idx + len(marker) :].split("?", 1)[0]
                return STATIC_ROOT / rest
        # Generic: .../generated/pN/...
        marker2 = "/generated/"
        idx2 = url.find(marker2)
        if idx2 >= 0:
            rest = url[idx2 + 1 :].split("?", 1)[0]  # generated/pN/...
            return STATIC_ROOT / rest
    return None


async def download_to(
    url: str,
    dest: Path,
    *,
    timeout: float = 120.0,
) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
    return dest


def file_to_data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


async def ensure_local_media(url: str, dest: Path) -> Path:
    """If url is remote, download; if already local, copy/resolve."""
    local = local_path_from_url(url)
    if local and local.exists():
        if local.resolve() != dest.resolve():
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(local.read_bytes())
        return dest
    if url.startswith("http://") or url.startswith("https://"):
        return await download_to(url, dest)
    raise FileNotFoundError(f"cannot resolve media: {url}")


def rel_static_url(path: Path) -> str:
    rel = path.resolve().relative_to(STATIC_ROOT.resolve())
    return f"/static/{rel.as_posix()}"


def publish_local(path: Path) -> str:
    """Return frontend URL for a local media file.

    Always keeps the file on disk for FFmpeg. When OSS is enabled, uploads and
    returns the public OSS URL; otherwise returns /static/... relative path.
    """
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(str(path))
    from app.services import oss as oss_svc

    if not oss_svc.oss_enabled():
        return rel_static_url(path)
    try:
        return oss_svc.upload_file(path)
    except Exception:  # noqa: BLE001
        logger.exception("OSS upload failed for %s, falling back to local URL", path)
        return rel_static_url(path)
