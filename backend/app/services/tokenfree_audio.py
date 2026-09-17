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


# qwen-tts 实际认的音色名；豆包 zh_* / S_ 不在此列
_TOKENFREE_NATIVE_VOICES = frozenset({"Cherry", "Serena", "Ethan", "Chelsie", "alloy"})
_TOKENFREE_NATIVE_VOICES_FOLD = {v.casefold(): v for v in _TOKENFREE_NATIVE_VOICES}


def tokenfree_speech_honors_speaker(speaker: str) -> bool:
    """qwen-tts 只接受少数英文音色；豆包 id 会被压成 Ethan/Cherry。"""
    return (speaker or "").strip().casefold() in _TOKENFREE_NATIVE_VOICES_FOLD


def tokenfree_speech_voice(speaker: str) -> str:
    """豆包 speaker id → Qwen/OpenAI 兼容音色。"""
    raw = (speaker or "").strip()
    native = _TOKENFREE_NATIVE_VOICES_FOLD.get(raw.casefold())
    if native:
        return native
    low = raw.lower()
    if low.startswith("zh_male") or "_male_" in low:
        return "Ethan"
    return "Cherry"
