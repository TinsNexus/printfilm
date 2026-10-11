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


def test_pick_9router_image_size():
    from app.services.nine_router.image import pick_9router_image_size as pick

    assert pick("2560x1440") == "1792x1024"
    assert pick("1440x2560") == "1024x1792"
    assert pick("2K", "9:16") == "1024x1792"
    assert pick("2K", "16:9") == "1792x1024"
    assert pick("1K") == "1024x1024"
    assert pick("1024x1024") == "1024x1024"


def test_infer_capability_for_common_9router_models():
    from app.services.model_routing_config import infer_model_capability as f

    assert f("openai/dall-e-3") == "image"
    assert f("fal-ai/flux-pro") == "image"
    assert f("black-forest-labs/flux-1.1") == "image"
    assert f("deepgram/aura-asteria-en") == "audio"
    assert f("cc/claude-sonnet-4") == "text"
    assert f("xai/grok-imagine-video") == "video"


def test_video_task_id_carries_9router_connection_id():
    assert extract_video_task_id({"request_id": "r1", "_9router_connection_id": "c9"}) == "r1|c9"
    assert extract_video_task_id({"request_id": "r1"}) == "r1"
    assert extract_video_task_id({"task_id": "t1", "_9router_connection_id": "c9"}) == "t1"


def test_poll_request_splits_connection_id():
    from app.services.ark import ArkGateway

    gw = ArkGateway()
    with patch(ON, return_value=True):
        url, headers = gw._video_poll_request("r1|c9")
    assert url.endswith("/videos/r1")
    assert headers["x-connection-id"] == "c9"
    with patch(ON, return_value=True):
        url, headers = gw._video_poll_request("plain")
    assert "x-connection-id" not in headers


def test_infer_sora_and_veo_video():
    from app.services.model_routing_config import infer_model_capability as f

    assert f("openai/sora-2") == "video"
    assert f("gemini/veo-3.0-generate-preview") == "video"
    assert f("gemini/gemini-2.5-flash-preview-tts") == "audio"
    assert f("openai/gpt-4o-mini-tts") == "audio"
