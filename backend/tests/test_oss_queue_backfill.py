"""OSS 队列回填：漫剧表 + 旧 /static 补传。"""

from __future__ import annotations

from app.services.oss_queue import (
    _collect_local_urls_from_params,
    _rewrite_local_urls_in_params,
)


def test_rewrite_local_urls_in_params_nested():
    params = {
        "voiceAudio": "/static/generated/p1/voice.mp3",
        "canvas": {"voiceAudio": "/static/generated/p1/voice.mp3", "other": 1},
    }
    assert _rewrite_local_urls_in_params(
        params,
        "/static/generated/p1/voice.mp3",
        "https://cdn.example/voice.mp3",
    )
    assert params["voiceAudio"] == "https://cdn.example/voice.mp3"
    assert params["canvas"]["voiceAudio"] == "https://cdn.example/voice.mp3"


def test_collect_local_urls_from_params():
    found: set[str] = set()
    _collect_local_urls_from_params(
        {
            "voiceAudio": "/static/a.mp3",
            "canvas": {"voiceAudio": "https://cdn.example/b.mp3"},
            "note": "/static/not-a-media-key.txt",
        },
        found,
    )
    assert found == {"/static/a.mp3"}
