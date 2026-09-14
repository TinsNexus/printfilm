"""Project-level BGM resolution for FFmpeg compose."""

from __future__ import annotations

import logging
import os
import re
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_STATIC_ROOT = Path(__file__).resolve().parents[2] / "static"
SHOT_BGM_MAX = 64

# Map mood keywords → filename stems under static/bgm/
_BGM_FILES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"紧张|悬疑|压迫"), "tense"),
    (re.compile(r"温暖|人文|故事"), "warm"),
    (re.compile(r"赛博|电子|科技"), "tech"),
    (re.compile(r"史诗|宏大|奇幻"), "epic"),
    (re.compile(r"轻快|专业|开源|产品|工作"), "upbeat"),
    (re.compile(r"冷静|纪实"), "calm"),
]


def clip_shot_bgm(mood: str | None) -> str:
    """Shot.bgm_mood 列上限 64，写入前截断。"""
    text = (mood or "").strip()
    return (text[:SHOT_BGM_MAX] if text else "neutral") or "neutral"


def _ensure_default_bed() -> Path | None:
    """无曲库时在系统临时目录生成轻垫乐；失败则跳过 BGM，不成片失败。"""
    dest = Path(tempfile.gettempdir()) / "printfilm_bgm" / "default.wav"
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.is_file() and dest.stat().st_size > 1000:
            return dest
        import math
        import struct
        import wave

        fd, tmp_name = tempfile.mkstemp(suffix=".wav", dir=str(dest.parent))
        os.close(fd)
        tmp = Path(tmp_name)
        rate = 22050
        seconds = 8
        amp = 1800
        with wave.open(str(tmp), "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(rate)
            frames = bytearray()
            for i in range(rate * seconds):
                t = i / rate
                fade = min(1.0, t * 4, (seconds - t) * 4)
                sample = int(
                    amp
                    * fade
                    * (0.55 * math.sin(2 * math.pi * 196 * t) + 0.45 * math.sin(2 * math.pi * 247 * t))
                )
                frames.extend(struct.pack("<h", max(-32767, min(32767, sample))))
            wf.writeframes(bytes(frames))
        os.replace(tmp, dest)
        return dest if dest.is_file() else None
    except OSError:
        logger.warning("Failed to write fallback BGM bed; compose will skip BGM", exc_info=True)
        return None


def resolve_bgm_path(mood: str | None) -> Path | None:
    """Return a local BGM file if present; otherwise a generated quiet bed."""
    root = _STATIC_ROOT / "bgm"
    blob = (mood or "").strip()
    stem = "default"
    for pattern, name in _BGM_FILES:
        if pattern.search(blob):
            stem = name
            break
    for candidate in (
        root / f"{stem}.mp3",
        root / f"{stem}.m4a",
        root / f"{stem}.wav",
        root / "default.mp3",
        root / "default.m4a",
        root / "default.wav",
    ):
        if candidate.is_file():
            return candidate
    for ext in ("*.mp3", "*.m4a", "*.wav", "*.aac"):
        found = sorted(root.glob(ext))
        if found:
            return found[0]
    logger.debug("No BGM file under %s for mood=%s; using generated bed", root, mood)
    return _ensure_default_bed()
