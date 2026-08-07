"""Selectable TTS voice presets (豆包 openspeech + template aliases)."""

from __future__ import annotations

from typing import Any

# id used in API / project.voice_id; speaker is openspeech speaker id
VOICE_PRESETS: list[dict[str, Any]] = [
    {
        "id": "zh_female_cancan_uranus_bigtts",
        "label": "灿灿 · 女声旁白",
        "gender": "female",
        "speaker": "zh_female_cancan_uranus_bigtts",
    },
    {
        "id": "zh_female_tianmeixiaoyuan_uranus_bigtts",
        "label": "甜美女声 · 故事",
        "gender": "female",
        "speaker": "zh_female_tianmeixiaoyuan_uranus_bigtts",
    },
    {
        "id": "zh_female_shuangkuaisisi_uranus_bigtts",
        "label": "爽快女声 · 都市",
        "gender": "female",
        "speaker": "zh_female_shuangkuaisisi_uranus_bigtts",
    },
    {
        "id": "zh_female_vv_uranus_bigtts",
        "label": "Vivi · 国风女声",
        "gender": "female",
        "speaker": "zh_female_vv_uranus_bigtts",
    },
    {
        "id": "zh_male_shaonianzixin_uranus_bigtts",
        "label": "少年梓辛 · 男声",
        "gender": "male",
        "speaker": "zh_male_shaonianzixin_uranus_bigtts",
    },
]

# Template audio_config.voice_preset aliases → speaker
VOICE_ALIASES: dict[str, str] = {
    "narrator_calm": "zh_female_cancan_uranus_bigtts",
    "warm_storyteller": "zh_female_tianmeixiaoyuan_uranus_bigtts",
    "teacher_clear": "zh_male_shaonianzixin_uranus_bigtts",
    "urban_editorial": "zh_female_shuangkuaisisi_uranus_bigtts",
    "retro_host": "zh_male_shaonianzixin_uranus_bigtts",
    "guqin_narrator": "zh_female_vv_uranus_bigtts",
}


def list_voices() -> list[dict[str, Any]]:
    return list(VOICE_PRESETS)


def resolve_speaker(voice_id: str | None, *, template_preset: str | None = None) -> str:
    """Map UI voice id / template alias to openspeech speaker."""
    raw = (voice_id or "").strip() or (template_preset or "").strip()
    if not raw:
        return "zh_female_cancan_uranus_bigtts"
    if raw in VOICE_ALIASES:
        return VOICE_ALIASES[raw]
    for preset in VOICE_PRESETS:
        if preset["id"] == raw or preset["speaker"] == raw:
            return str(preset["speaker"])
    # Pass-through custom speaker ids
    return raw


PREVIEW_TEXT = "大家好，这是当前音色的试听效果，适合科普短视频旁白讲解。"


async def ensure_voice_preview(voice_id: str) -> str:
    """Generate (or reuse cached) short TTS sample; return public URL."""
    import hashlib
    from pathlib import Path

    from app.services import storage
    from app.services.ark import get_ark

    speaker = resolve_speaker(voice_id)
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in speaker)[:80]
    cache_dir = Path(__file__).resolve().parents[2] / "static" / "voice_previews"
    cache_dir.mkdir(parents=True, exist_ok=True)
    dest = cache_dir / f"{safe}.mp3"
    if dest.exists() and dest.stat().st_size > 2000:
        return storage.publish_local(dest)

    ark = get_ark()
    shot_no = int(hashlib.md5(speaker.encode()).hexdigest()[:4], 16) % 800 + 100
    url = await ark.tts(PREVIEW_TEXT, speaker, project_id=0, shot_no=shot_no)
    src = storage.local_path_from_url(url)
    if src and src.exists():
        dest.write_bytes(src.read_bytes())
        return storage.publish_local(dest)
    if dest.exists() and dest.stat().st_size > 2000:
        return storage.publish_local(dest)
    return url
