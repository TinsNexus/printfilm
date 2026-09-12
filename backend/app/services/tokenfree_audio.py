"""TokenFree / New API 语音：OpenAI 兼容 POST /v1/audio/speech。"""

from __future__ import annotations

from app.services.tokenfree_gateway import TOKENFREE_CHANNEL_ID


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
