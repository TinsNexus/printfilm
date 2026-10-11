"""9Router 开启时：视频路径/请求体/响应解析、TokenFree 判定关闭。"""

from __future__ import annotations

from unittest.mock import patch

from app.services.tokenfree_audio import uses_tokenfree_audio
from app.services.tokenfree_image import uses_tokenfree_image
from app.services.tokenfree_video import (
    extract_video_result_url,
    extract_video_task_id,
    normalize_video_task_status,
    prepare_video_create_body,
    remap_video_path,
    uses_tokenfree_video,
)

ON = "app.services.nine_router.config.is_9router_active"


def test_uses_tokenfree_flags_off_when_9router():
    with patch(ON, return_value=True):
        assert not uses_tokenfree_video(channel_id="tokenfree")
        assert not uses_tokenfree_image(channel_id="tokenfree")
        assert not uses_tokenfree_audio(channel_id="tokenfree")
    with patch(ON, return_value=False):
        assert uses_tokenfree_video(channel_id="tokenfree")


def test_video_paths_9router():
    with patch(ON, return_value=True):
        assert remap_video_path("/contents/generations/tasks") == "/videos/generations"
        assert remap_video_path("/contents/generations/tasks/abc") == "/videos/abc"
    with patch(ON, return_value=False):
        assert remap_video_path("/contents/generations/tasks", channel_id="tokenfree") == "/videos"


def test_video_body_9router():
    body = {
        "model": "grok-imagine-video",
        "content": [
            {"type": "text", "text": "a cat"},
            {"type": "image_url", "image_url": {"url": "https://x/a.png"}, "role": "first_frame"},
        ],
        "duration": 5,
        "ratio": "16:9",
        "resolution": "720p",
        "watermark": False,
    }
    with patch(ON, return_value=True):
        out = prepare_video_create_body(body)
    assert out == {
        "model": "grok-imagine-video",
        "prompt": "a cat",
        "duration": 5,
        "aspect_ratio": "16:9",
        "resolution": "720p",
        "image": {"url": "https://x/a.png"},
    }


def test_video_response_parsing_xai_style():
    assert extract_video_task_id({"request_id": "req-1"}) == "req-1"
    assert normalize_video_task_status("done") == "succeeded"
    assert normalize_video_task_status("pending") == "running"
    assert extract_video_result_url({"status": "done", "video": {"url": "https://v/1.mp4"}}) == "https://v/1.mp4"
