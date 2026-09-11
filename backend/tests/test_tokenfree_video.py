"""TokenFree / New API 视频路径与 Seedance 请求体包装。"""

from __future__ import annotations

from app.services.ark import ArkGateway, _build_task_result_from_payload
from app.services.tokenfree_gateway import TOKENFREE_BASE_URL, TOKENFREE_CHANNEL_ID
from app.services.tokenfree_video import (
    extract_video_task_id,
    prepare_video_create_body,
    remap_video_path,
    uses_tokenfree_video,
    wrap_seedance_payload_for_newapi,
)


def test_remap_video_path_on_tokenfree():
    create = remap_video_path(
        "/contents/generations/tasks",
        base_url=TOKENFREE_BASE_URL,
        channel_id=TOKENFREE_CHANNEL_ID,
    )
    poll = remap_video_path(
        "/contents/generations/tasks/task-1",
        base_url=TOKENFREE_BASE_URL,
    )
    assert create == "/video/generations"
    assert poll == "/video/generations/task-1"


def test_remap_video_path_keeps_ark_volces():
    path = remap_video_path(
        "/contents/generations/tasks",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
    )
    assert path == "/contents/generations/tasks"
    assert uses_tokenfree_video(base_url="https://ark.cn-beijing.volces.com/api/v3") is False


def test_wrap_seedance_payload_puts_content_in_metadata():
    payload = {
        "model": "seedance-2-5",
        "content": [
            {"type": "text", "text": "镜头推进"},
            {
                "type": "image_url",
                "image_url": {"url": "https://cdn.example.com/a.jpg"},
                "role": "first_frame",
            },
        ],
        "duration": 8,
        "resolution": "720p",
        "ratio": "9:16",
        "watermark": False,
        "generate_audio": True,
        "return_last_frame": True,
    }
    wrapped = wrap_seedance_payload_for_newapi(payload)
    assert wrapped["model"] == "seedance-2-5"
    assert wrapped["prompt"] == "镜头推进"
    assert wrapped["image"] == "https://cdn.example.com/a.jpg"
    assert wrapped["duration"] == 8
    assert wrapped["seconds"] == "8"
    assert wrapped["metadata"]["content"] == payload["content"]
    assert wrapped["metadata"]["ratio"] == "9:16"
    assert wrapped["metadata"]["generate_audio"] is True
    assert "content" not in wrapped or wrapped.get("content") is None


def test_prepare_video_create_body_only_wraps_tokenfree():
    body = {"model": "seedance-2-5", "content": [{"type": "text", "text": "hi"}], "duration": 5}
    ark = prepare_video_create_body(
        body,
        base_url="https://ark.cn-beijing.volces.com/api/v3",
    )
    tf = prepare_video_create_body(body, base_url=TOKENFREE_BASE_URL)
    assert ark["content"][0]["text"] == "hi"
    assert tf["prompt"] == "hi"
    assert tf["metadata"]["content"] == body["content"]


def test_extract_video_task_id_from_newapi_and_wrapped_data():
    assert extract_video_task_id({"task_id": "abc"}) == "abc"
    assert extract_video_task_id({"id": "ark-1"}) == "ark-1"
    assert extract_video_task_id({"data": {"task_id": "nested"}}) == "nested"
    assert extract_video_task_id({"id": "video_123", "task_id": "abcd"}) == "abcd"
    assert extract_video_task_id({"id": "outer", "data": {"task_id": "nested", "status": "queued"}}) == "nested"
    assert extract_video_task_id({"code": "success", "data": "cgt-xxx"}) == "cgt-xxx"


def test_build_task_result_from_newapi_completed_url():
    result = _build_task_result_from_payload(
        {
            "task_id": "abcd",
            "status": "completed",
            "url": "https://example.com/video.mp4",
        }
    )
    assert result.status == "succeeded"
    assert result.url == "https://example.com/video.mp4"


def test_build_task_result_from_newapi_nested_data():
    result = _build_task_result_from_payload(
        {
            "data": {
                "status": "succeeded",
                "content": {"video_url": "https://example.com/ark.mp4"},
            }
        }
    )
    assert result.status == "succeeded"
    assert result.url == "https://example.com/ark.mp4"


def test_ark_client_tokenfree_video_url():
    from app.config import get_settings

    settings = get_settings().model_copy(update={"ark_base_url": TOKENFREE_BASE_URL})
    client = ArkGateway(settings=settings)
    assert client._url("/contents/generations/tasks") == f"{TOKENFREE_BASE_URL}/video/generations"
    assert (
        client._url("/contents/generations/tasks/t1")
        == f"{TOKENFREE_BASE_URL}/video/generations/t1"
    )
    wrapped = client._video_json(
        {
            "model": "seedance-2-5",
            "content": [{"type": "text", "text": "hi"}],
            "duration": 4,
        }
    )
    assert wrapped["prompt"] == "hi"
    assert wrapped["metadata"]["duration"] == 4
