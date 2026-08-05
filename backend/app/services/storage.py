"""Download / persist generated assets under backend/static/generated."""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path

import httpx

from app.config import get_settings

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
    if url.startswith("/static/"):
        return STATIC_ROOT / url.removeprefix("/static/")
    settings = get_settings()
    prefix = settings.public_base_url.rstrip("/") + "/static/"
    if url.startswith(prefix):
        return STATIC_ROOT / url.removeprefix(prefix)
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
