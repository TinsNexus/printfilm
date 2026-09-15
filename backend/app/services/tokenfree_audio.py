"""TokenFree / New API 语音：OpenAI 兼容 POST /v1/audio/speech。"""

from __future__ import annotations

from app.services.tokenfree_gateway import TOKENFREE_CHANNEL_ID

# 账号目录里实际有的 TTS；seed-tts-2.0 不在 TokenFree 价目/渠道中
TOKENFREE_DEFAULT_TTS_MODEL = "qwen-tts-2025-05-22"

_SEED_TTS_MARKERS = ("seed-tts",)


def uses_tokenfree_audio(*, base_url: str = "", channel_id: str = "") -> bool:
    """判断 TTS 是否应走 TokenFree（与视频、LLM 同一 Base URL / Key）。"""
    if (channel_id or "").strip().lower() == TOKENFREE_CHANNEL_ID:
        return True
    raw = (base_url or "").strip().lower()
    if "tokenfree.com" in raw:
        return True
    if "volces.com" in raw or "volcengineapi.com" in raw:
        return False
    return False


def resolve_tokenfree_tts_model(model: str | None) -> str:
    """把已下线的 seed-tts 换成目录内 Qwen TTS。"""
    mid = (model or "").strip()
    low = mid.lower()
    if not mid or any(mark in low for mark in _SEED_TTS_MARKERS):
        return TOKENFREE_DEFAULT_TTS_MODEL
    return mid


def tokenfree_speech_voice(speaker: str) -> str:
    """豆包 speaker id → Qwen/OpenAI 兼容音色。"""
    raw = (speaker or "").strip()
    low = raw.lower()
    if low.startswith("zh_male") or "_male_" in low:
        return "Ethan"
    if raw in {"Cherry", "Serena", "Ethan", "Chelsie", "alloy"}:
        return raw
    return "Cherry"
