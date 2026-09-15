"""TokenFree 音频路由检测。"""

from app.services.tokenfree_audio import (
    resolve_tokenfree_tts_model,
    tokenfree_speech_voice,
    uses_tokenfree_audio,
)
from app.services.tokenfree_gateway import TOKENFREE_BASE_URL, TOKENFREE_CHANNEL_ID


def test_uses_tokenfree_audio():
    assert uses_tokenfree_audio(base_url=TOKENFREE_BASE_URL, channel_id=TOKENFREE_CHANNEL_ID)
    assert uses_tokenfree_audio(base_url="https://www.tokenfree.com/v1") is True
    assert uses_tokenfree_audio(base_url="https://ark.cn-beijing.volces.com/api/v3") is False


def test_resolve_tokenfree_tts_model_replaces_seed_tts():
    assert resolve_tokenfree_tts_model("seed-tts-2.0") == "qwen-tts-2025-05-22"
    assert resolve_tokenfree_tts_model("") == "qwen-tts-2025-05-22"
    assert resolve_tokenfree_tts_model("qwen-tts-2025-05-22") == "qwen-tts-2025-05-22"


def test_tokenfree_speech_voice_gender():
    assert tokenfree_speech_voice("zh_female_cancan_uranus_bigtts") == "Cherry"
    assert tokenfree_speech_voice("zh_male_shaonianzixin_uranus_bigtts") == "Ethan"
    assert tokenfree_speech_voice("Cherry") == "Cherry"
