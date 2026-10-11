"""Audio & Text-to-Speech (TTS) module for 9Router gateway.

Unlike TokenFree which required complex Qwen-Omni streaming chat workarounds,
9Router routes standard POST /v1/audio/speech to native TTS providers
(e.g., OpenAI TTS, ElevenLabs, Edge-TTS, Deepgram, Google TTS).
"""

from __future__ import annotations

import logging
from typing import Literal

from app.services.nine_router.client import NineRouterClient
from app.services.nine_router.models import NineRouterAudioSpeechRequest

logger = logging.getLogger(__name__)

DEFAULT_9ROUTER_TTS_MODEL = "tts-1"
DEFAULT_9ROUTER_VOICE = "alloy"


def resolve_9router_tts_model(model: str | None) -> str:
    """Normalize model identifier for 9Router TTS."""
    mid = (model or "").strip()
    if not mid or "qwen" in mid.lower():
        # Fall back to high quality standard OpenAI or Edge TTS
        return DEFAULT_9ROUTER_TTS_MODEL
    return mid


async def synthesize_speech_via_9router(
    client: NineRouterClient,
    *,
    text: str,
    model: str = DEFAULT_9ROUTER_TTS_MODEL,
    voice: str = DEFAULT_9ROUTER_VOICE,
    response_format: Literal["mp3", "opus", "aac", "flac", "wav", "pcm"] = "mp3",
    speed: float = 1.0,
) -> bytes:
    """Generate spoken audio bytes using 9Router /v1/audio/speech endpoint."""
    req = NineRouterAudioSpeechRequest(
        model=resolve_9router_tts_model(model),
        input=text.strip(),
        voice=voice or DEFAULT_9ROUTER_VOICE,
        response_format=response_format,
        speed=speed,
    )
    return await client.generate_speech(req)
