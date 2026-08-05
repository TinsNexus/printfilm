"""Force visual style + character consistency across storyboard shots."""

from __future__ import annotations

import re
from urllib.parse import urlparse

# Terms that cause 真人 / 动漫 / 3D drift across shots
_STYLE_DRIFT = re.compile(
    r"(写实照片|照片级真实|真人实拍|真实人脸|真人脸|摄影棚人像|电影真人剧照|"
    r"超写实皮肤|照片质感|live[\s-]?action|photoreal(?:istic)?|"
    r"赛璐璐二次元|日系动漫脸|动漫大眼睛|萌系二次元|3D超写实|CGI写实人像)",
    re.IGNORECASE,
)

_EXTRA_NEGATIVE = (
    "写实照片，真人，真实人脸，摄影棚人像，电影真人剧照，照片级皮肤，"
    "风格混杂，镜头间画风跳变，另一套画风，赛璐璐二次元与写实混用"
)

_SCENE_TAG = re.compile(r"【场景】\s*(.+?)(?=\n【|\Z)", re.S)
_LOCK_LINE = re.compile(r"【(?:风格锁定|人物锁定|约束)】[^\n]*")
_PERSON_SETTING = re.compile(r"(?:人物设定|角色设定)[：:][^\n【]{0,400}")


def strip_style_drift(prompt: str) -> str:
    out = _STYLE_DRIFT.sub("", prompt or "")
    out = re.sub(r"[，,]{2,}", "，", out)
    return out.strip("，,。 \n\t")


def strip_lock_blocks(prompt: str) -> str:
    """Remove internal lock wrappers for UI / stored scene prompts."""
    raw = (prompt or "").strip()
    if not raw:
        return ""
    # New tagged format
    m = _SCENE_TAG.search(raw)
    if m:
        return m.group(1).strip("，,。 \n\t")
    # Drop tagged lock lines
    out = _LOCK_LINE.sub("", raw)
    out = _PERSON_SETTING.sub("", out)
    # Legacy: drop comma segments that start with lock tags / boilerplate
    if "【风格锁定】" in raw or "【人物锁定】" in raw:
        kept: list[str] = []
        for part in re.split(r"[，,\n]", raw):
            p = part.strip()
            if not p:
                continue
            if p.startswith(("【风格锁定】", "【人物锁定】", "【约束】", "人物设定", "角色设定")):
                continue
            if p.startswith(("同一画风", "全片必须保持", "凡出现人物", "禁止写实", "禁止换脸", "画面干净无文字")):
                continue
            # Drop mid-lock fragments
            if "禁止镜头间切换" in p or "必须严格沿用以上外形" in p:
                continue
            kept.append(p)
        out = "，".join(kept)
    out = re.sub(r"[，,]{2,}", "，", out)
    out = re.sub(r"\s{2,}", " ", out)
    return out.strip("，,。；; \n\t")


def build_locked_image_prompt(
    style_prefix: str,
    img_prompt: str,
    character_bible: str = "",
) -> str:
    """Canonical prompt sent to Seedream — style + cast locked every shot."""
    body = strip_lock_blocks(strip_style_drift(img_prompt))
    if style_prefix and style_prefix in body:
        body = body.replace(style_prefix, "", 1).strip("，, ")
    parts: list[str] = []
    if style_prefix:
        parts.append(
            f"【风格锁定】{style_prefix}。全片统一此画风，禁止写实摄影与风格跳变"
        )
    if (character_bible or "").strip():
        parts.append(
            f"【人物锁定】{(character_bible or '').strip()}。人物外形全片一致，禁止换脸换装"
        )
    if body:
        parts.append(f"【场景】{body}")
    parts.append("【约束】同一画风同一人物，画面干净无文字")
    return "\n".join(parts)


def merge_negative(template_negative: str, *, image_text: bool = False) -> str:
    base = (template_negative or "").strip("，, ")
    parts = [p for p in (base, _EXTRA_NEGATIVE) if p]
    merged = "，".join(parts)
    if image_text and "文字" not in merged:
        merged = f"{merged}，画面文字，字幕，水印，标题字"
    return merged


def seedream_ref_urls(*candidates: str | None) -> list[str]:
    """Normalize refs for Seedream — **public https only**.

    Skip data: URIs (multi‑MB base64 often hangs Seedream) and LAN/localhost URLs
    (Ark cloud cannot fetch them). Prefer prior shot `image_ark_url` CDN links.
    """
    out: list[str] = []
    seen: set[str] = set()
    for raw in candidates:
        if not raw:
            continue
        u = raw.strip()
        if not u or u in seen:
            continue
        if not (u.startswith("https://") or u.startswith("http://")):
            continue
        host = (urlparse(u).hostname or "").lower()
        if not host or host in {"localhost", "127.0.0.1", "::1"}:
            continue
        if host.startswith("192.168.") or host.startswith("10."):
            continue
        if re.match(r"^172\.(1[6-9]|2\d|3[0-1])\.", host):
            continue
        out.append(u)
        seen.add(u)
    return out[:2]
