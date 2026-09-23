"""Seedance 参考图宽高比钳制：上游要求约 0.40–2.50，边界/略超会被拒。"""

from __future__ import annotations

import logging
import math
import struct
import subprocess
import uuid
from pathlib import Path

from app.services.ffmpeg_compose import _which

logger = logging.getLogger(__name__)

# 官方口径 [0.40, 2.50]；实测 1983×793≈2.5006 会被报成 2.50 并拒绝
SEEDANCE_AR_MIN = 0.40
SEEDANCE_AR_MAX = 2.50
SEEDANCE_AR_SAFE_MIN = 0.41
SEEDANCE_AR_SAFE_MAX = 2.49


# 计算 letterbox 后的画布尺寸（只垫黑边、不裁切）
def target_canvas_for_seedance_ar(
    width: int,
    height: int,
    *,
    ar_min: float = SEEDANCE_AR_SAFE_MIN,
    ar_max: float = SEEDANCE_AR_SAFE_MAX,
) -> tuple[int, int] | None:
    """若已在安全区间返回 None；否则返回需 pad 到的 (canvas_w, canvas_h)。"""
    w = int(width)
    h = int(height)
    if w <= 0 or h <= 0:
        return None
    ar = w / h
    if ar_min <= ar <= ar_max:
        return None
    if ar > ar_max:
        canvas_h = max(h, int(math.ceil(w / ar_max)))
        canvas_w = w
    else:
        canvas_w = max(w, int(math.ceil(h * ar_min)))
        canvas_h = h
    if canvas_w % 2:
        canvas_w += 1
    if canvas_h % 2:
        canvas_h += 1
    if canvas_w == w and canvas_h == h:
        return None
    return canvas_w, canvas_h


# 从文件头读宽高（PNG / JPEG / WEBP）
def read_image_size(path: Path) -> tuple[int, int] | None:
    try:
        data = path.read_bytes()[:65536]
    except OSError:
        return None
    return _png_size(data) or _jpeg_size(data) or _webp_size(data)


def _png_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", data[16:24])
    return int(w), int(h)


def _jpeg_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", data[i + 5 : i + 9])
            return int(w), int(h)
        if marker == 0xD9:
            break
        if marker in (0x00, 0x01) or 0xD0 <= marker <= 0xD9:
            i += 2
            continue
        seglen = struct.unpack(">H", data[i + 2 : i + 4])[0]
        i += 2 + seglen
    return None


def _webp_size(data: bytes) -> tuple[int, int] | None:
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    if data[12:16] == b"VP8 " and len(data) >= 30:
        w = struct.unpack("<H", data[26:28])[0] & 0x3FFF
        h = struct.unpack("<H", data[28:30])[0] & 0x3FFF
        return int(w), int(h)
    if data[12:16] == b"VP8L" and len(data) >= 25:
        b = data[21:25]
        bits = b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)
        w = (bits & 0x3FFF) + 1
        h = ((bits >> 14) & 0x3FFF) + 1
        return int(w), int(h)
    return None


# 本地图若超 Seedance 比例，FFmpeg 居中垫黑边写出新文件
def pad_image_to_seedance_ar(src: Path, dest: Path) -> Path | None:
    """需要钳制时写出 dest 并返回路径；无需改动或失败返回 None。"""
    dims = read_image_size(src)
    if not dims:
        logger.warning("seedance ar: cannot read size path=%s", src)
        return None
    canvas = target_canvas_for_seedance_ar(*dims)
    if not canvas:
        return None
    cw, ch = canvas
    try:
        ffmpeg = _which("ffmpeg")
    except RuntimeError:
        logger.warning("seedance ar: ffmpeg missing, skip pad path=%s", src)
        return None
    dest.parent.mkdir(parents=True, exist_ok=True)
    vf = f"pad={cw}:{ch}:(ow-iw)/2:(oh-ih)/2:black"
    cmd = [ffmpeg, "-y", "-i", str(src), "-vf", vf, str(dest)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not dest.exists() or dest.stat().st_size <= 0:
        logger.warning(
            "seedance ar pad failed src=%s stderr=%s",
            src,
            (proc.stderr or "")[-400:],
        )
        return None
    logger.info(
        "seedance ar padded %sx%s -> %sx%s src=%s",
        dims[0],
        dims[1],
        cw,
        ch,
        src.name,
    )
    return dest


# 确保参考图比例可被 Seedance 接受；必要时本地垫边并同步 OSS
async def ensure_seedance_compatible_image_url(image_url: str) -> str:
    from app.services import storage

    raw = (image_url or "").strip()
    if not raw:
        return raw

    local = storage.local_path_from_url(raw)
    work_dir = storage.GENERATED_ROOT / "_seedance_ar"
    if not local or not local.exists():
        if not raw.startswith(("http://", "https://")):
            return raw
        work_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(raw.split("?", 1)[0]).suffix.lower()
        if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
            suffix = ".png"
        local = work_dir / f"dl_{uuid.uuid4().hex[:12]}{suffix}"
        try:
            await storage.download_to(raw, local)
        except Exception:  # noqa: BLE001
            logger.exception("seedance ar: download failed url=%s", raw[:160])
            return raw

    dims = read_image_size(local)
    if not dims or target_canvas_for_seedance_ar(*dims) is None:
        return raw

    out = local.parent / f"{local.stem}_ar{uuid.uuid4().hex[:8]}{local.suffix or '.png'}"
    padded = pad_image_to_seedance_ar(local, out)
    if not padded:
        return raw

    local_url = storage.rel_static_url(padded)
    public = storage.republish_url(local_url, sync=True)
    if public and str(public).startswith(("http://", "https://", "/static/")):
        return str(public)
    return local_url
