"""PiAPI 网关：视频请求体映射、Flux 出图、任务响应解析与 ark 层 URL/鉴权头。"""

from __future__ import annotations

from unittest.mock import patch

import httpx
import pytest

from app.services.ark import ArkGateway, _build_task_result_from_payload
from app.services.piapi import image as piapi_image
from app.services.piapi.catalog import list_piapi_catalog_models
from app.services.piapi.config import PIAPI_LLM_BASE_URL, PIAPI_TASK_URL
from app.services.piapi.image import build_flux_task, generate_image_via_piapi, pick_flux_size
from app.services.piapi.video import (
    parse_kling_model,
    piapi_task_url_for_ark_path,
    wrap_seedance_payload_for_piapi,
)
from app.services.tokenfree_gateway import apply_gateway_to_channels, gateway_from_flat, locked_tokenfree_channel
from app.services.tokenfree_video import extract_video_task_id, prepare_video_create_body, uses_tokenfree_video

# 所有 PiAPI 判定都经 piapi.config.is_piapi_active，统一在这里打桩
ON = "app.services.piapi.config.is_piapi_active"
ON_VIDEO = "app.services.piapi.video.is_piapi_active"


def _body(model: str, **extra) -> dict:
    """方舟 Seedance 风格请求体：文案 + 首帧 + 尾帧 + 参考图。"""
    return {
        "model": model,
        "content": [
            {"type": "text", "text": "一只纸船"},
            {"type": "image_url", "image_url": {"url": "https://x/first.png"}, "role": "first_frame"},
            {"type": "image_url", "image_url": {"url": "https://x/last.png"}, "role": "last_frame"},
            {"type": "image_url", "image_url": {"url": "https://x/ref.png"}, "role": "reference_image"},
        ],
        "duration": 8,
        "ratio": "9:16",
        "resolution": "720p",
        **extra,
    }


def test_parse_kling_model():
    assert parse_kling_model("kling-3.0-pro") == ("3.0", "pro")
    assert parse_kling_model("kling-4.0-flash") == ("4.0-flash", "std")
    assert parse_kling_model("kling-2.1-master") == ("2.1-master", "std")
    assert parse_kling_model("kling") == (None, "std")


def _frames_body(model: str, **extra) -> dict:
    """只有首帧 + 尾帧（Kling 支持的形态）。"""
    body = _body(model, **extra)
    body["content"] = [item for item in body["content"] if item.get("role") != "reference_image"]
    return body


def test_kling_rejects_extra_reference_images():
    with pytest.raises(RuntimeError, match="Kling"):
        wrap_seedance_payload_for_piapi(_body("kling-3.0"))
    single = {"model": "kling-3.0", "content": [
        {"type": "text", "text": "p"},
        {"type": "image_url", "image_url": {"url": "https://x/r.png"}, "role": "reference_image"},
    ]}
    assert wrap_seedance_payload_for_piapi(single)["input"]["image_url"] == "https://x/r.png"


def test_kling_payload_first_and_tail_frame():
    out = wrap_seedance_payload_for_piapi(_frames_body("kling-3.0-pro"))
    assert out["model"] == "kling" and out["task_type"] == "video_generation"
    assert out["input"] == {
        "prompt": "一只纸船",
        "duration": 8,
        "mode": "pro",
        "version": "3.0",
        "aspect_ratio": "9:16",
        "image_url": "https://x/first.png",
        "image_tail_url": "https://x/last.png",
    }


def test_kling_1080p_maps_to_pro_mode():
    out = wrap_seedance_payload_for_piapi(_frames_body("kling-3.0", resolution="1080p"))
    assert out["input"]["mode"] == "pro" and out["input"]["version"] == "3.0"
    assert wrap_seedance_payload_for_piapi(_frames_body("kling-3.0"))["input"]["mode"] == "std"


def test_kling_legacy_duration_snaps_to_5_or_10():
    assert wrap_seedance_payload_for_piapi(_frames_body("kling-2.6"))["input"]["duration"] == 10
    assert wrap_seedance_payload_for_piapi(_frames_body("kling-2.6", duration=6))["input"]["duration"] == 5


def test_seedance_payload_merges_images():
    out = wrap_seedance_payload_for_piapi(_body("seedance-2.5", duration=2))
    assert out["model"] == "seedance" and out["task_type"] == "seedance-2.5"
    assert out["input"]["duration"] == 4
    assert out["input"]["image_urls"] == ["https://x/first.png", "https://x/ref.png", "https://x/last.png"]
    # 上游模型名写法不同（seedance-2-5 等）也统一映射到 PiAPI 的 seedance-2.5
    assert wrap_seedance_payload_for_piapi(_body("seedance-2-5"))["task_type"] == "seedance-2.5"


def test_veo_payload():
    out = wrap_seedance_payload_for_piapi(_body("veo3.1-fast", duration=5, generate_audio=True))
    assert out["model"] == "veo3.1" and out["task_type"] == "veo3.1-video-fast"
    assert out["input"]["duration"] == "6s"
    assert out["input"]["generate_audio"] is True
    assert out["input"]["image_url"] == "https://x/first.png"
    assert out["input"]["tail_image_url"] == "https://x/last.png"


def test_unsupported_video_models_raise():
    with pytest.raises(RuntimeError, match="Sora"):
        wrap_seedance_payload_for_piapi(_body("sora2"))
    with pytest.raises(RuntimeError, match="暂不支持"):
        wrap_seedance_payload_for_piapi(_body("wan-2.6"))


def test_flux_task_and_size():
    assert pick_flux_size("", "16:9") == (1344, 768)
    assert pick_flux_size("", "9:16") == (768, 1344)
    assert pick_flux_size("2K", None) == (1024, 1024)
    w, h = pick_flux_size("2560x1440")
    assert w * h <= 1024 * 1024 and w > h
    txt = build_flux_task(model="flux1-schnell", prompt="p", aspect_ratio="16:9")
    assert txt == {
        "model": "Qubico/flux1-schnell",
        "task_type": "txt2img",
        "input": {"prompt": "p", "width": 1344, "height": 768},
    }
    img = build_flux_task(model="Qubico/flux1-dev", prompt="p", ref_urls=["https://x/a.png", "https://x/b.png"])
    assert img["task_type"] == "img2img" and img["input"]["image"] == "https://x/a.png"
    with pytest.raises(RuntimeError, match="Midjourney"):
        build_flux_task(model="midjourney", prompt="p")
    with pytest.raises(RuntimeError, match="暂不支持"):
        build_flux_task(model="doubao-seedream-5-0", prompt="p")


def test_task_response_parsing():
    created = {"code": 200, "data": {"task_id": "abc", "status": "pending", "output": None}, "message": "success"}
    assert extract_video_task_id(created) == "abc"
    assert _build_task_result_from_payload(created).status == "running"
    done = {"code": 200, "data": {"task_id": "abc", "status": "Completed", "output": {"video": "https://v/a.mp4"}}}
    result = _build_task_result_from_payload(done)
    assert result.status == "succeeded" and result.url == "https://v/a.mp4"
    legacy = {"data": {"status": "completed", "output": {"video": "", "works": [{"video": {"resource": "https://v/b.mp4"}}]}}}
    assert _build_task_result_from_payload(legacy).url == "https://v/b.mp4"
    failed = {"data": {"status": "failed", "error": {"code": 1, "message": "", "raw_message": "nsfw"}}}
    result = _build_task_result_from_payload(failed)
    assert result.status == "failed" and result.error == "nsfw"


def test_ark_urls_and_headers_when_piapi():
    ark = ArkGateway()
    with patch(ON, return_value=True), patch(ON_VIDEO, return_value=True):
        assert not uses_tokenfree_video(channel_id="tokenfree")
        assert ark._route_url("/contents/generations/tasks", None) == PIAPI_TASK_URL
        with patch.object(ArkGateway, "_ark_api_key", return_value="pk-test"):
            url, headers = ark._video_poll_request("abc")
        assert url == f"{PIAPI_TASK_URL}/abc"
        assert headers["X-API-Key"] == "pk-test"
        assert prepare_video_create_body(_frames_body("kling-3.0"))["model"] == "kling"
    assert piapi_task_url_for_ark_path("/contents/generations/tasks") is None


def test_gateway_flat_overlay_for_piapi():
    flat = {"upstream_gateway_type": "piapi", "piapi_api_key": " pk-1 ", "ninerouter_api_key": "sk-9r"}
    assert gateway_from_flat(flat) == (True, PIAPI_LLM_BASE_URL, "pk-1")
    channels = apply_gateway_to_channels([locked_tokenfree_channel(api_key="sk-tf", force_tokenfree=True)], flat)
    assert channels[0].name == "PiAPI"
    assert channels[0].base_url == PIAPI_LLM_BASE_URL and channels[0].api_key == "pk-1"


def test_catalog_filter():
    assert {m["capability"] for m in list_piapi_catalog_models("video")} == {"video"}
    ids = {m["id"] for m in list_piapi_catalog_models("all")}
    assert {"flux1-dev", "kling-3.0", "veo3.1", "seedance-2.5", "gpt-4o"} <= ids
    assert "seedream-5.0-pro" not in ids


def test_presets_follow_active_gateway():
    """预设按上游过滤：PiAPI 下只剩 PiAPI 模型（含共用的 Seedance 2.5），TokenFree 下看不到 PiAPI 专属模型。"""
    from app.services.media_model_presets import clamp_default_to_preset, gateway_supports_model, preset_ids
    from app.services.model_availability import is_model_enabled

    assert "kling-3.0" not in preset_ids("video") and "seedance-2.5" in preset_ids("video")
    assert not gateway_supports_model("flux1-dev") and gateway_supports_model("some-custom-model")
    assert not is_model_enabled("video", "kling-3.0", [])
    with patch(ON, return_value=True):
        assert preset_ids("image") == ["flux1-dev", "flux1-schnell"]
        assert preset_ids("video") == ["seedance-2.5", "kling-3.0", "kling-4.0", "veo3.1", "veo3.1-fast"]
        assert clamp_default_to_preset("image", "seedream-5.0-pro") == "flux1-dev"
        assert clamp_default_to_preset("text", "kimi-k2.6") == "gpt-4o"
        assert not is_model_enabled("image", "seedream-5.0-pro", [])
        assert is_model_enabled("video", "kling-3.0", [])
    assert "kling-3.0" in preset_ids("video", all_gateways=True)
    # 9Router 可自由填写上游模型：即使是 PiAPI 预设的 id 也不拦
    with patch("app.services.nine_router.config.is_9router_active", return_value=True):
        assert gateway_supports_model("kling-3.0")
        assert is_model_enabled("video", "kling-3.0", [])


def test_piapi_strategies_registered():
    from app.services.media_models import MediaValidationError, get_strategy

    flux = get_strategy("flux1-dev")
    assert flux.capability == "image" and flux.resolutions == ("1K",)
    with pytest.raises(MediaValidationError):
        flux.normalize_and_validate({"resolution": "2K"})
    kling = get_strategy("kling-3.0")
    assert kling.describe()["defaults"]["resolution"] == "720p"
    assert get_strategy("veo3.1").describe()["defaults"]["resolution"] == "720p"
    assert kling.normalize_and_validate({"duration": 3, "resolution": "1080p"})["duration"] == 3
    veo = get_strategy("veo3.1-fast")
    with pytest.raises(MediaValidationError):
        veo.normalize_and_validate({"duration": 10})
    with pytest.raises(MediaValidationError):
        veo.normalize_and_validate({"aspect_ratio": "1:1"})
    body = kling.build_provider_request(
        {"prompt": "p", "duration": 5, "resolution": "1080p", "first_frame": "https://x/a.png"},
        {"upstream_model": "kling-3.0"},
    )
    out = wrap_seedance_payload_for_piapi(body)
    assert out["input"]["mode"] == "pro" and out["input"]["image_url"] == "https://x/a.png"


@pytest.mark.asyncio
async def test_generate_image_polls_until_completed(monkeypatch):
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, str(request.url)))
        assert request.headers["x-api-key"] == "pk-test"
        if request.method == "POST":
            return httpx.Response(200, json={"code": 200, "data": {"task_id": "t1", "status": "pending"}})
        status = "processing" if len(calls) < 3 else "completed"
        output = {"image_url": "https://img/a.png"} if status == "completed" else None
        return httpx.Response(200, json={"code": 200, "data": {"task_id": "t1", "status": status, "output": output}})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        piapi_image.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler))
    )
    data = await generate_image_via_piapi(api_key="pk-test", model="flux1-dev", prompt="p", poll_interval=0)
    assert data["data"][0]["url"] == "https://img/a.png"
    assert calls[0] == ("POST", PIAPI_TASK_URL)
    assert calls[-1] == ("GET", f"{PIAPI_TASK_URL}/t1")


@pytest.mark.asyncio
async def test_generate_image_failed_task_raises(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"code": 200, "data": {"task_id": "t1", "status": "failed", "error": {"message": "bad prompt"}}}
        )

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        piapi_image.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler))
    )
    with pytest.raises(RuntimeError, match="bad prompt"):
        await generate_image_via_piapi(api_key="pk-test", model="flux1-dev", prompt="p", poll_interval=0)


def test_switched_gateway_error_is_not_reported_as_disabled():
    """切到 PiAPI 后请求 TokenFree 专属模型：提示上游不支持，而不是“已停用”。"""
    from app.services.logical_model_router import resolve_upstream_model

    with patch(ON, return_value=True):
        with pytest.raises(ValueError, match="当前上游网关不支持 seedream-5.0-pro"):
            resolve_upstream_model("image", "seedream-5.0-pro")
