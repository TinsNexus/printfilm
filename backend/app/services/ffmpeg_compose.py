"""FFmpeg compose: per-shot A/V mux → concat → soft/hard subtitles / image-text Ken Burns."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger(__name__)

# Punctuation removed from on-screen captions (TTS narration keeps original)
_CAPTION_PUNCT_RE = re.compile(
    r"[，。！？；：、,.!?;:…··〜～「」『』【】（）\(\)\[\]\"'“”‘’《》〈〉"
    r"—_\-/\\|@#$%^&*+=<>{}]+"
)

# Output sizes keyed by aspect ratio
_RATIO_SIZE = {
    "16:9": (854, 480),
    "9:16": (720, 1280),
    "1:1": (720, 720),
    "4:3": (640, 480),
    "21:9": (1280, 540),
}


@dataclass
class ShotMedia:
    shot_no: int
    duration: float
    narration: str
    video_path: Path | None
    audio_path: Path | None
    image_path: Path | None = None
    overlay_title: str = ""
    overlay_subtitle: str = ""


@dataclass
class ComposeOptions:
    ratio: str = "16:9"
    mode: str = "full"  # full | image_text
    resolution_mode: str = "preview"  # preview | hd
    # One continuous TTS track for the whole film (preferred over per-shot audio)
    full_audio_path: Path | None = None
    # Overlay / caption sizing & layout (from template.subtitle_config)
    subtitle_layout: str = "top"  # top | split (title top, subtitle bottom)
    title_scale: float = 1.35
    sub_scale: float = 1.3
    caption_scale: float = 1.25
    # Optional continuous BGM under narration
    bgm_path: Path | None = None
    bgm_volume: float = 0.22


def allocate_durations_by_narration(
    narrations: list[str],
    total_audio_dur: float,
    *,
    min_shot: float = 0.8,
) -> list[float]:
    """Split continuous TTS length across shots by narration character weight."""
    n = len(narrations)
    if n == 0:
        return []
    total = max(float(total_audio_dur), min_shot * n)
    weights = [max(len((t or "").strip()), 1) for t in narrations]
    wsum = float(sum(weights))
    raw = [total * (w / wsum) for w in weights]
    # Ensure minimums then renormalize
    capped = [max(d, min_shot) for d in raw]
    csum = sum(capped)
    if csum > total + 1e-6:
        # shrink proportionally above min
        extra = csum - total
        flexible = [max(0.0, d - min_shot) for d in capped]
        fsum = sum(flexible) or 1.0
        capped = [d - extra * (f / fsum) for d, f in zip(capped, flexible)]
    # Fix float drift on last shot
    head = [round(d, 3) for d in capped[:-1]]
    last = max(min_shot, round(total - sum(head), 3))
    return [*head, last]


def probe_duration(path: Path) -> float | None:
    """Return media duration in seconds via ffprobe, or None."""
    ffprobe = shutil.which(get_settings().ffprobe_path) or shutil.which("ffprobe")
    if not ffprobe or not path.exists():
        return None
    try:
        proc = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            return None
        return float(proc.stdout.strip())
    except Exception:  # noqa: BLE001
        return None


def is_near_silent_audio(path: Path, *, max_db: float = -70.0) -> bool:
    """True when file missing/tiny or peak volume is below max_db (e.g. anullsrc)."""
    if not path.exists() or path.stat().st_size < 2000:
        return True
    ffmpeg = shutil.which(get_settings().ffmpeg_path) or shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    try:
        proc = subprocess.run(
            [ffmpeg, "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
            capture_output=True,
            text=True,
            check=False,
        )
        text = (proc.stderr or "") + (proc.stdout or "")
        peak: float | None = None
        for line in text.splitlines():
            if "max_volume:" in line:
                # e.g. max_volume: -91.0 dB
                part = line.split("max_volume:", 1)[1].strip().split()[0]
                peak = float(part)
                break
        if peak is None:
            return False
        return peak <= max_db
    except Exception:  # noqa: BLE001
        return False


def _run(cmd: list[str]) -> None:
    logger.info("ffmpeg: %s", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-2000:] or proc.stdout[-2000:] or "ffmpeg failed")


def _which(bin_name: str) -> str:
    settings = get_settings()
    configured = settings.ffmpeg_path if bin_name == "ffmpeg" else settings.ffprobe_path
    path = shutil.which(configured) or shutil.which(bin_name)
    if not path:
        raise RuntimeError(f"{bin_name} not found in PATH")
    return path


def _canvas(opts: ComposeOptions) -> tuple[int, int]:
    w, h = _RATIO_SIZE.get(opts.ratio, _RATIO_SIZE["16:9"])
    if opts.resolution_mode == "hd":
        # Scale up ~1.5x for HD preview of image_text / compose
        return int(w * 1.5) // 2 * 2, int(h * 1.5) // 2 * 2
    return w, h


def _find_cjk_font() -> str | None:
    """Return a path usable by drawtext fontfile=…"""
    candidates = [
        os.environ.get("FRAMECUT_FONT"),
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\simkai.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
    ]
    for c in candidates:
        if c and Path(c).exists():
            return c
    return None


def _escape_drawtext(text: str) -> str:
    """Escape text for ffmpeg drawtext filter."""
    t = (text or "").replace("\n", " ").replace("\r", " ").strip()
    t = t.replace("\\", "\\\\")
    t = t.replace(":", "\\:")
    t = t.replace("'", "\\'")
    t = t.replace("%", "\\%")
    return t


def _strip_caption_punct(text: str) -> str:
    """Remove punctuation/symbols from on-screen subtitle text."""
    t = _CAPTION_PUNCT_RE.sub("", text or "")
    return re.sub(r"\s+", " ", t).strip()


def _escape_fontfile(path: str) -> str:
    # Windows paths need escaping for filtergraph: C\:/Windows/Fonts/msyh.ttc
    p = Path(path).resolve().as_posix()
    return p.replace(":", "\\:")


def _one_line_caption(text: str, *, max_chars: int = 22) -> str:
    """Single-line bottom caption; truncate if too long (no ellipsis punctuation)."""
    raw = _strip_caption_punct((text or "").replace("\n", " ").replace("\r", " "))
    if not raw:
        return ""
    if len(raw) <= max_chars:
        return raw
    return raw[:max_chars]


def _split_caption_chunks(text: str, *, max_chars: int = 18) -> list[str]:
    """Split narration into timed bottom-caption cues (one line each)."""
    raw = (text or "").replace("\n", " ").replace("\r", " ").strip()
    if not raw:
        return []

    # Prefer clause breaks on Chinese/English punctuation
    pieces: list[str] = []
    buf = ""
    for ch in raw:
        buf += ch
        if ch in "，。！？；、,.!?;:":
            piece = _strip_caption_punct(buf)
            if piece:
                pieces.append(piece)
            buf = ""
    if buf.strip():
        piece = _strip_caption_punct(buf)
        if piece:
            pieces.append(piece)
    if not pieces:
        pieces = [_strip_caption_punct(raw)]
        if not pieces[0]:
            return []

    # Further split long pieces so each cue stays one readable line
    chunks: list[str] = []
    for piece in pieces:
        body = _strip_caption_punct(piece)
        if not body:
            continue
        if len(body) <= max_chars:
            chunks.append(body)
            continue
        cur = ""
        for ch in body:
            cur += ch
            if len(cur) >= max_chars:
                chunks.append(cur.strip())
                cur = ""
        if cur.strip():
            chunks.append(cur.strip())

    # Merge tiny leftovers into previous cue
    merged: list[str] = []
    for c in chunks:
        if merged and len(c) <= 2:
            merged[-1] = merged[-1] + c
        else:
            merged.append(c)
    clean = [_strip_caption_punct(c) for c in merged if _strip_caption_punct(c)]
    return clean or [_strip_caption_punct(raw)[:max_chars]]


def _timed_caption_windows(
    text: str,
    *,
    start: float,
    duration: float,
    max_chars: int = 18,
) -> list[tuple[float, float, str]]:
    """Allocate each caption chunk a time window proportional to character length."""
    chunks = _split_caption_chunks(text, max_chars=max_chars)
    if not chunks:
        return []
    total = max(duration, 0.5)
    weights = [max(len(c), 1) for c in chunks]
    weight_sum = float(sum(weights))
    cursor = start
    windows: list[tuple[float, float, str]] = []
    for i, (chunk, w) in enumerate(zip(chunks, weights)):
        if i == len(chunks) - 1:
            end = start + total
        else:
            end = start + total * (sum(weights[: i + 1]) / weight_sum)
            end = max(end, cursor + 0.5)
        end = min(end, start + total)
        if end <= cursor:
            continue
        windows.append((cursor, end, chunk))
        cursor = end
    if windows:
        s0, _, t0 = windows[-1]
        windows[-1] = (s0, start + total, t0)
    return windows


def _ass_ts(seconds: float) -> str:
    cs = int(round(max(seconds, 0) * 100))
    h, rem = divmod(cs, 3600_00)
    m, rem = divmod(rem, 60_00)
    s, c = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def _escape_ass_text(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def _write_ass(
    shots: list[ShotMedia],
    path: Path,
    *,
    w: int,
    h: int,
    font: str | None,
) -> None:
    """Write ASS with PlayRes matching canvas; captions refresh by clause over time."""
    portrait = (h / max(w, 1)) > 1.2
    font_size = 36 if portrait else 30
    margin_v = 56 if portrait else 40
    max_chars = 16 if portrait else 24
    font_name = "Microsoft YaHei"
    if font:
        stem = Path(font).stem.lower()
        if stem.startswith("msyh"):
            font_name = "Microsoft YaHei"
        elif stem == "simhei":
            font_name = "SimHei"
        elif stem == "simkai":
            font_name = "KaiTi"
        elif stem == "simsun":
            font_name = "SimSun"

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{font_name},{font_size},&H00FFFFFF,&H000000FF,&H80000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,36,36,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    cursor = 0.0
    for shot in shots:
        shot_start = cursor
        shot_dur = max(shot.duration, 0.5)
        windows = _timed_caption_windows(
            shot.narration,
            start=shot_start,
            duration=shot_dur,
            max_chars=max_chars,
        )
        if not windows:
            windows = [(shot_start, shot_start + shot_dur, f"镜头{shot.shot_no}")]
        for a, b, text in windows:
            if b - a < 0.25:
                continue
            events.append(
                f"Dialogue: 0,{_ass_ts(a)},{_ass_ts(b)},Caption,,0,0,0,,{_escape_ass_text(text)}"
            )
        cursor = shot_start + shot_dur
    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8-sig")


def _write_srt(shots: list[ShotMedia], path: Path) -> None:
    """Legacy SRT helper with timed clause captions."""
    lines: list[str] = []
    cursor = 0.0
    idx = 1

    def ts(seconds: float) -> str:
        ms = int(round(seconds * 1000))
        h, rem = divmod(ms, 3600_000)
        m, rem = divmod(rem, 60_000)
        s, milli = divmod(rem, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{milli:03d}"

    for shot in shots:
        shot_start = cursor
        shot_dur = max(shot.duration, 0.5)
        windows = _timed_caption_windows(
            shot.narration,
            start=shot_start,
            duration=shot_dur,
            max_chars=22,
        )
        for a, b, text in windows:
            lines.append(str(idx))
            lines.append(f"{ts(a)} --> {ts(b)}")
            lines.append(text)
            lines.append("")
            idx += 1
        cursor = shot_start + shot_dur
    path.write_text("\n".join(lines), encoding="utf-8")

def _make_silent_audio(path: Path, duration: float) -> None:
    ffmpeg = _which("ffmpeg")
    _run(
        [
            ffmpeg,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-t",
            f"{max(duration, 0.5):.3f}",
            "-c:a",
            "aac",
            str(path),
        ]
    )


def _scale_pad(w: int, h: int) -> str:
    return (
        f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
        f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
    )


def _ken_burns_filter(w: int, h: int, duration: float, shot_no: int) -> str:
    """Ken Burns zoom / pan — stronger push-in / pull-out with directional drift."""
    frames = max(int(round(duration * 24)), 12)
    last = max(frames - 1, 1)
    # ~32% scale change (was ~12%) so motion reads clearly on short clips
    amp = 0.32
    z_max = f"{1.0 + amp:.2f}"
    pattern = shot_no % 4
    if pattern == 0:
        # Push in, centered
        z = f"min(1.0+{amp}*on/{last},{z_max})"
        x = "iw/2-(iw/zoom/2)"
        y = "ih/2-(ih/zoom/2)"
    elif pattern == 1:
        # Pull out + drift upward
        z = f"max({z_max}-{amp}*on/{last},1.0)"
        x = "iw/2-(iw/zoom/2)"
        y = f"ih/2-(ih/zoom/2)-ih*0.08*on/{last}"
    elif pattern == 2:
        # Push in + pan right
        z = f"min(1.0+{amp}*on/{last},{z_max})"
        x = f"(iw-iw/zoom)*on/{last}"
        y = "ih/2-(ih/zoom/2)"
    else:
        # Push in + pan left / slight down
        z = f"min(1.0+{amp}*on/{last},{z_max})"
        x = f"(iw-iw/zoom)*(1-on/{last})"
        y = f"(ih-ih/zoom)*0.4*on/{last}"
    return (
        f"scale=8000:-1,"
        f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={w}x{h}:fps=24,"
        f"format=yuv420p"
    )


def _bottom_caption_drawtext(
    narration: str,
    *,
    duration: float,
    w: int,
    h: int,
    font: str | None,
    scale: float = 1.25,
) -> str:
    """Pixel-sized bottom captions via drawtext (avoids libass PlayRes blow-up)."""
    portrait = (h / max(w, 1)) > 1.2
    max_chars = 14 if portrait else 22
    base = 32 if portrait else 28
    font_size = max(24, min(44, int(base * max(0.8, scale))))
    y = max(0, h - font_size - (64 if portrait else 48))
    windows = _timed_caption_windows(
        narration,
        start=0.0,
        duration=max(duration, 0.5),
        max_chars=max_chars,
    )
    if not windows:
        return ""
    font_opt = f":fontfile='{_escape_fontfile(font)}'" if font else ""
    parts: list[str] = []
    for a, b, text in windows:
        if b - a < 0.2:
            continue
        te = _escape_drawtext(text)
        # Commas in enable= must be escaped for filtergraph
        parts.append(
            f"drawtext=text='{te}'{font_opt}:fontsize={font_size}:"
            f"fontcolor=white:borderw=3:bordercolor=black@0.85:"
            f"box=1:boxcolor=black@0.4:boxborderw=8:"
            f"x=(w-text_w)/2:y={y}:"
            f"enable='between(t\\,{a:.2f}\\,{b:.2f})'"
        )
    return ",".join(parts)


def _overlay_drawtext(
    w: int,
    h: int,
    title: str,
    subtitle: str,
    font: str | None,
    *,
    layout: str = "top",
    title_scale: float = 1.35,
    sub_scale: float = 1.3,
) -> str:
    """Title + subtitle overlays. layout=split → title top / subtitle bottom (开源展示风)."""
    title = _strip_caption_punct(title)
    subtitle = _strip_caption_punct(subtitle)
    title_cap = 14 if layout == "split" else 12
    sub_cap = 24 if layout == "split" else 18
    if len(title) > title_cap:
        title = title[:title_cap]
    if len(subtitle) > sub_cap:
        subtitle = subtitle[:sub_cap]
    title_e = _escape_drawtext(title)
    sub_e = _escape_drawtext(subtitle)
    # Portrait 720 base ~ larger than before so 叠字更醒目
    title_size = max(34, min(52, int(w * 0.058 * max(0.8, title_scale))))
    sub_size = max(24, min(36, int(w * 0.042 * max(0.8, sub_scale))))
    title_y = int(h * 0.055)
    if layout == "split":
        sub_y = max(0, h - sub_size - int(h * 0.07))
    else:
        sub_y = title_y + title_size + int(h * 0.014)

    parts: list[str] = []
    # Soft vignette behind text
    if layout == "split":
        parts.append(f"drawbox=x=0:y=0:w={w}:h={int(h * 0.16)}:color=black@0.28:t=fill")
        parts.append(
            f"drawbox=x=0:y={h - int(h * 0.16)}:w={w}:h={int(h * 0.16)}:color=black@0.32:t=fill"
        )
    else:
        parts.append(f"drawbox=x=0:y=0:w={w}:h={int(h * 0.2)}:color=black@0.22:t=fill")

    font_opt = f":fontfile='{_escape_fontfile(font)}'" if font else ""

    if title_e:
        parts.append(
            f"drawtext=text='{title_e}'{font_opt}:fontsize={title_size}:"
            f"fontcolor=white:borderw=4:bordercolor=black@0.8:"
            f"x=(w-text_w)/2:y={title_y}"
        )
    if sub_e:
        parts.append(
            f"drawtext=text='{sub_e}'{font_opt}:fontsize={sub_size}:"
            f"fontcolor=white:borderw=3:bordercolor=black@0.75:"
            f"x=(w-text_w)/2:y={sub_y}"
        )
    return ",".join(parts)


def _image_to_video_kenburns(
    image: Path,
    duration: float,
    out: Path,
    *,
    w: int,
    h: int,
    shot_no: int,
    title: str,
    subtitle: str,
    narration: str,
    font: str | None,
    subtitle_layout: str = "top",
    title_scale: float = 1.35,
    sub_scale: float = 1.3,
    caption_scale: float = 1.25,
) -> None:
    ffmpeg = _which("ffmpeg")
    vf = _ken_burns_filter(w, h, duration, shot_no)
    overlay = _overlay_drawtext(
        w,
        h,
        title,
        subtitle,
        font,
        layout=subtitle_layout,
        title_scale=title_scale,
        sub_scale=sub_scale,
    )
    if overlay:
        vf = f"{vf},{overlay}"
    # split 布局底部已是副标题，不再叠旁白滚动字幕以免抢戏
    if subtitle_layout != "split":
        captions = _bottom_caption_drawtext(
            narration, duration=duration, w=w, h=h, font=font, scale=caption_scale
        )
        if captions:
            vf = f"{vf},{captions}"
    _run(
        [
            ffmpeg,
            "-y",
            "-loop",
            "1",
            "-i",
            str(image),
            "-t",
            f"{max(duration, 0.5):.3f}",
            "-vf",
            vf,
            "-r",
            "24",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(out),
        ]
    )


def _burn_captions_on_video(
    video_in: Path,
    video_out: Path,
    *,
    narration: str,
    duration: float,
    w: int,
    h: int,
    font: str | None,
    caption_scale: float = 1.25,
    title: str = "",
    subtitle: str = "",
    subtitle_layout: str = "top",
    title_scale: float = 1.35,
    sub_scale: float = 1.3,
) -> None:
    """Burn title/subtitle + timed bottom captions onto an existing video clip (full mode)."""
    parts: list[str] = []
    overlay = _overlay_drawtext(
        w,
        h,
        title,
        subtitle,
        font,
        layout=subtitle_layout,
        title_scale=title_scale,
        sub_scale=sub_scale,
    )
    if overlay:
        parts.append(overlay)
    # split 布局底部已是副标题，不再叠旁白滚动字幕以免抢戏
    if subtitle_layout != "split":
        captions = _bottom_caption_drawtext(
            narration, duration=duration, w=w, h=h, font=font, scale=caption_scale
        )
        if captions:
            parts.append(captions)
    ffmpeg = _which("ffmpeg")
    if not parts:
        _run([ffmpeg, "-y", "-i", str(video_in), "-c", "copy", str(video_out)])
        return
    _run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(video_in),
            "-vf",
            ",".join(parts),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(video_out),
        ]
    )



def _image_to_video(image: Path, duration: float, out: Path, *, w: int, h: int) -> None:
    ffmpeg = _which("ffmpeg")
    _run(
        [
            ffmpeg,
            "-y",
            "-loop",
            "1",
            "-i",
            str(image),
            "-t",
            f"{max(duration, 0.5):.3f}",
            "-vf",
            _scale_pad(w, h),
            "-r",
            "24",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(out),
        ]
    )


def _pad_or_trim_video(
    src: Path,
    dest: Path,
    duration: float,
    *,
    w: int,
    h: int,
) -> None:
    """Scale video to canvas and force exact duration: trim if longer, freeze-pad if shorter.

    AI clips (Seedance) are often shorter than TTS-allocated shot length; without
    padding, continuous mux -shortest truncates narration.
    """
    ffmpeg = _which("ffmpeg")
    target = max(float(duration), 0.5)
    src_dur = probe_duration(src) or 0.0
    base_vf = f"{_scale_pad(w, h).replace(',format=yuv420p', '')},fps=24"
    if src_dur > 0.05 and src_dur + 0.08 < target:
        pad = target - src_dur
        vf = f"{base_vf},tpad=stop_mode=clone:stop_duration={pad:.3f},format=yuv420p"
    else:
        vf = f"{base_vf},format=yuv420p"
    _run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(src),
            "-t",
            f"{target:.3f}",
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-an",
            str(dest),
        ]
    )


def _mux_shot(video: Path, audio: Path, duration: float, out: Path) -> None:
    ffmpeg = _which("ffmpeg")
    target = max(float(duration), 0.5)
    _run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(video),
            "-i",
            str(audio),
            "-t",
            f"{target:.3f}",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            # Video was already fitted to target; avoid -shortest cutting early
            str(out),
        ]
    )


def _mux_continuous_narration(merged: Path, narration: Path, output: Path) -> None:
    """Attach full-film TTS; pad video with freeze if shorter so旁白不被裁切."""
    ffmpeg = _which("ffmpeg")
    vid_d = probe_duration(merged) or 0.0
    aud_d = probe_duration(narration) or 0.0
    video_in = merged
    tmp_pad: Path | None = None
    if aud_d > 0.5 and vid_d > 0.05 and aud_d > vid_d + 0.12:
        tmp_pad = merged.with_name(merged.stem + "_pad.mp4")
        pad = aud_d - vid_d
        _run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(merged),
                "-vf",
                f"tpad=stop_mode=clone:stop_duration={pad:.3f}",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-an",
                str(tmp_pad),
            ]
        )
        video_in = tmp_pad
    out_t = max(aud_d, vid_d, 0.5)
    _run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(video_in),
            "-i",
            str(narration),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-t",
            f"{out_t:.3f}",
            "-movflags",
            "+faststart",
            str(output),
        ]
    )


def compose_project(
    shots: list[ShotMedia],
    output: Path,
    opts: ComposeOptions | None = None,
) -> Path:
    if not shots:
        raise ValueError("no shots to compose")

    opts = opts or ComposeOptions()
    w, h = _canvas(opts)
    ffmpeg = _which("ffmpeg")
    output.parent.mkdir(parents=True, exist_ok=True)
    font = _find_cjk_font()
    if opts.mode == "image_text" and not font:
        logger.warning("No CJK font found; drawtext may fail for Chinese")

    with tempfile.TemporaryDirectory(prefix="framecut_") as tmp:
        tmp_path = Path(tmp)
        segment_paths: list[Path] = []
        continuous = bool(opts.full_audio_path and opts.full_audio_path.exists())

        for shot in shots:
            seg = tmp_path / f"shot_{shot.shot_no:03d}.mp4"
            audio = tmp_path / f"shot_{shot.shot_no:03d}.m4a"
            video = tmp_path / f"shot_{shot.shot_no:03d}_v.mp4"

            if continuous:
                # Visual-only segments; continuous narration muxed after concat
                _make_silent_audio(audio, shot.duration)
            elif shot.audio_path and shot.audio_path.exists():
                # Keep full narration; do not truncate to planned duration when audio is longer
                audio_dur = probe_duration(shot.audio_path) or shot.duration
                use_dur = max(shot.duration, audio_dur)
                shot.duration = use_dur
                _run(
                    [
                        ffmpeg,
                        "-y",
                        "-i",
                        str(shot.audio_path),
                        "-c:a",
                        "aac",
                        str(audio),
                    ]
                )
            else:
                _make_silent_audio(audio, shot.duration)

            if opts.mode == "image_text" and shot.image_path and shot.image_path.exists():
                title = (shot.overlay_title or "").strip()
                subtitle = (shot.overlay_subtitle or "").strip()
                _image_to_video_kenburns(
                    shot.image_path,
                    shot.duration,
                    video,
                    w=w,
                    h=h,
                    shot_no=shot.shot_no,
                    title=title,
                    subtitle=subtitle,
                    narration=shot.narration or "",
                    font=font,
                    subtitle_layout=opts.subtitle_layout or "top",
                    title_scale=opts.title_scale,
                    sub_scale=opts.sub_scale,
                    caption_scale=opts.caption_scale,
                )
            elif shot.video_path and shot.video_path.exists() and shot.video_path.suffix.lower() in {
                ".mp4",
                ".mov",
                ".webm",
                ".mkv",
            }:
                raw_v = tmp_path / f"shot_{shot.shot_no:03d}_raw.mp4"
                _pad_or_trim_video(
                    shot.video_path,
                    raw_v,
                    shot.duration,
                    w=w,
                    h=h,
                )
                _burn_captions_on_video(
                    raw_v,
                    video,
                    narration=shot.narration or "",
                    duration=shot.duration,
                    w=w,
                    h=h,
                    font=font,
                    caption_scale=opts.caption_scale,
                    title=shot.overlay_title or "",
                    subtitle=shot.overlay_subtitle or "",
                    subtitle_layout=opts.subtitle_layout or "top",
                    title_scale=opts.title_scale,
                    sub_scale=opts.sub_scale,
                )
            elif shot.image_path and shot.image_path.exists():
                _image_to_video(shot.image_path, shot.duration, video, w=w, h=h)
                capped = tmp_path / f"shot_{shot.shot_no:03d}_cap.mp4"
                _burn_captions_on_video(
                    video,
                    capped,
                    narration=shot.narration or "",
                    duration=shot.duration,
                    w=w,
                    h=h,
                    font=font,
                    caption_scale=opts.caption_scale,
                    title=shot.overlay_title or "",
                    subtitle=shot.overlay_subtitle or "",
                    subtitle_layout=opts.subtitle_layout or "top",
                    title_scale=opts.title_scale,
                    sub_scale=opts.sub_scale,
                )
                video = capped
            else:
                _run(
                    [
                        ffmpeg,
                        "-y",
                        "-f",
                        "lavfi",
                        "-i",
                        f"color=c=0x1a1714:s={w}x{h}:d={max(shot.duration, 0.5):.3f}",
                        "-c:v",
                        "libx264",
                        "-pix_fmt",
                        "yuv420p",
                        str(video),
                    ]
                )

            _mux_shot(video, audio, shot.duration, seg)
            segment_paths.append(seg)

        concat_list = tmp_path / "concat.txt"
        concat_list.write_text(
            "\n".join(f"file '{p.resolve().as_posix()}'" for p in segment_paths),
            encoding="utf-8",
        )
        merged = tmp_path / "merged.mp4"
        _run(
            [
                ffmpeg,
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-c",
                "copy",
                str(merged),
            ]
        )

        if continuous and opts.full_audio_path:
            # Replace silent concat audio with one continuous narration track
            voiced = tmp_path / "voiced.mp4"
            _mux_continuous_narration(merged, opts.full_audio_path, voiced)
            staged = voiced
        else:
            staged = merged

        if opts.bgm_path and Path(opts.bgm_path).is_file():
            mixed = tmp_path / "with_bgm.mp4"
            try:
                _mix_bgm(staged, Path(opts.bgm_path), mixed, volume=float(opts.bgm_volume or 0.22))
                shutil.copy2(mixed, output)
            except Exception:  # noqa: BLE001
                logger.exception("BGM mix failed; exporting without BGM")
                if staged == merged and not continuous:
                    _run(
                        [
                            ffmpeg,
                            "-y",
                            "-i",
                            str(merged),
                            "-c",
                            "copy",
                            "-movflags",
                            "+faststart",
                            str(output),
                        ]
                    )
                else:
                    shutil.copy2(staged, output)
        elif continuous and opts.full_audio_path:
            shutil.copy2(staged, output)
        else:
            # Captions already burned per-shot via drawtext — remux only.
            _run(
                [
                    ffmpeg,
                    "-y",
                    "-i",
                    str(merged),
                    "-c",
                    "copy",
                    "-movflags",
                    "+faststart",
                    str(output),
                ]
            )

    return output


def _mix_bgm(video: Path, bgm: Path, output: Path, *, volume: float = 0.22) -> None:
    """Loop/trim BGM under existing audio; duck volume below narration."""
    ffmpeg = _which("ffmpeg")
    vol = max(0.05, min(float(volume), 0.5))
    # amix: original audio + quieter looped BGM, duration = first (video)
    _run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(video),
            "-stream_loop",
            "-1",
            "-i",
            str(bgm),
            "-filter_complex",
            f"[1:a]volume={vol:.3f}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]",
            "-map",
            "0:v:0",
            "-map",
            "[a]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-shortest",
            "-movflags",
            "+faststart",
            str(output),
        ]
    )
