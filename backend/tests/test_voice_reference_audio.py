"""参考音色时长：合成源头截断。"""

from app.services.drama.voice_reference_audio import (
    SEEDANCE_REFERENCE_AUDIO_MAX_SEC,
    VOICE_REFERENCE_TARGET_SEC,
    patch_params_voice_url,
)


def test_voice_reference_target_under_api_limit():
    assert VOICE_REFERENCE_TARGET_SEC < SEEDANCE_REFERENCE_AUDIO_MAX_SEC
    assert SEEDANCE_REFERENCE_AUDIO_MAX_SEC <= 30.2


def test_patch_params_voice_url():
    params = {
        "voiceAudio": {"sourceAssetId": 1, "url": "/static/old.mp3", "label": "禹音色"},
        "canvas": {"voiceAudio": {"sourceAssetId": 1, "url": "/static/old.mp3"}},
    }
    next_params = patch_params_voice_url(params, "/static/new.mp3")
    assert next_params["voiceAudio"]["url"] == "/static/new.mp3"
    assert next_params["canvas"]["voiceAudio"]["url"] == "/static/new.mp3"
