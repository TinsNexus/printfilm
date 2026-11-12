"""PiAPI 图片 / 视频模型：每个预设都要有策略、每档分辨率都能构造任务体；图片 2K 默认在 1K 模型上降档，视频时长对齐上游档位。"""

import pytest

from app.services.media_model_presets import PRESET_MODELS
from app.services.media_models import get_strategy
from app.services.media_models.strategies import clamp_image_tier
from app.services.piapi.image import build_piapi_image_task, extract_piapi_image_url
from app.services.piapi.image_tasks import PIAPI_IMAGE_REFERENCE_USD, fit_size

PIAPI_IMAGE_IDS = [row["id"] for row in PRESET_MODELS["image"] if "piapi" in str(row.get("gateways") or "")]


@pytest.mark.parametrize("model_id", PIAPI_IMAGE_IDS)
def test_every_piapi_image_preset_builds_task(model_id):
    strategy = get_strategy(model_id)
    assert strategy.model_id == model_id
    for resolution in strategy.resolutions:
        refs = ["https://example.com/ref.png"] if strategy.max_reference_images else []
        body = build_piapi_image_task(model=model_id, prompt="cat", resolution=resolution,
                                      aspect_ratio="16:9", ref_urls=refs)
        assert body["model"] and body["task_type"] and body["input"]["prompt"] == "cat"


@pytest.mark.parametrize("model_id", list(PIAPI_IMAGE_REFERENCE_USD))
def test_reference_prices_match_strategy_tiers(model_id):
    assert set(PIAPI_IMAGE_REFERENCE_USD[model_id]) <= set(get_strategy(model_id).resolutions)


def test_native_bodies_follow_piapi_docs():
    body = build_piapi_image_task(model="nano-banana-pro", prompt="p", resolution="4K", aspect_ratio="9:16",
                                  ref_urls=[f"https://e/{i}.png" for i in range(20)])
    assert body["model"] == "gemini" and body["task_type"] == "nano-banana-pro"
    assert body["input"]["resolution"] == "4K" and body["input"]["aspect_ratio"] == "9:16"
    assert len(body["input"]["image_urls"]) == 14
    seedream = build_piapi_image_task(model="seedream-5.0-pro", prompt="p", resolution="2K", aspect_ratio="auto")
    assert seedream["task_type"] == "seedream-5-pro" and seedream["input"]["size"] == "2K"
    assert "aspect_ratio" not in seedream["input"]  # auto 不传
    edit = build_piapi_image_task(model="qwen-image", prompt="p", resolution="1K",
                                  ref_urls=["https://e/a.png", "https://e/b.png"])
    assert edit["task_type"] == "image-edit" and edit["input"]["image2"] == "https://e/b.png"
    minimax = build_piapi_image_task(model="minimax-image-01", prompt="p", resolution="2K", aspect_ratio="16:9")
    w, h = (int(v) for v in minimax["input"]["size"].split("x"))
    assert 512 <= min(w, h) and max(w, h) <= 2048 and w % 8 == 0 and h % 8 == 0


def test_fit_size_respects_caps():
    w, h = fit_size(None, "21:9", max_pixels=1024 * 1024, max_side=1440)
    assert w <= 1440 and w * h <= 1024 * 1024
    assert fit_size(None, None, max_pixels=1024 * 1024) == (1024, 1024)


def test_minimax_output_url_is_extracted():
    task = {"output": {"images": [{"url": "https://e/out.png"}]}}
    assert extract_piapi_image_url(task) == "https://e/out.png"


@pytest.mark.parametrize(("requested", "allowed", "expected"), [
    ("2K", ("1K",), "1K"),
    ("4K", ("1K", "2K"), "2K"),
    ("1K", ("2K", "3K"), "2K"),
    ("2K", ("1K", "2K", "4K"), "2K"),
])
def test_clamp_image_tier(requested, allowed, expected):
    assert clamp_image_tier(requested, allowed) == expected


def test_one_k_model_accepts_default_two_k():
    assert get_strategy("flux1-dev").normalize_and_validate({"prompt": "x", "resolution": "2K"})["resolution"] == "1K"


# ---- 视频 ----
from app.services.piapi.video import wrap_seedance_payload_for_piapi  # noqa: E402
from app.services.piapi.video_tasks import PIAPI_VIDEO_REFERENCE_USD  # noqa: E402

PIAPI_VIDEO_IDS = [row["id"] for row in PRESET_MODELS["video"] if "piapi" in str(row.get("gateways") or "")]
_FIRST = {"type": "image_url", "image_url": {"url": "https://e/first.png"}, "role": "first_frame"}


def _payload(model_id, *, image=True, **extra):
    content = [{"type": "text", "text": "a cat"}, *([_FIRST] if image else [])]
    return {"model": model_id, "content": content, **extra}


@pytest.mark.parametrize("model_id", PIAPI_VIDEO_IDS)
def test_every_piapi_video_preset_builds_task(model_id):
    strategy = get_strategy(model_id)
    defaults = strategy.describe()["defaults"]
    params = strategy.normalize_and_validate({"prompt": "a cat"})
    assert params["duration"] == defaults["duration"]
    for resolution in strategy.resolutions:
        body = wrap_seedance_payload_for_piapi(_payload(model_id, duration=params["duration"], resolution=resolution,
                                                        ratio=strategy.ratios[0]))
        assert body["model"] and body["task_type"] and body["input"]["prompt"]


@pytest.mark.parametrize("model_id", list(PIAPI_VIDEO_REFERENCE_USD))
def test_video_reference_prices_match_strategy_tiers(model_id):
    assert set(PIAPI_VIDEO_REFERENCE_USD[model_id]) <= set(get_strategy(model_id).resolutions)


@pytest.mark.parametrize(("model_id", "task_type"), [
    ("seedance-2.5", "seedance-2.5"), ("seedance-2.0", "seedance-2"),
    ("seedance-2.0-fast", "seedance-2-fast"), ("seedance-2-mini", "seedance-2-mini"),
])
def test_seedance_task_type_follows_model(model_id, task_type):
    assert wrap_seedance_payload_for_piapi(_payload(model_id, duration=5))["task_type"] == task_type


def test_discrete_durations_snap_for_billing():
    assert get_strategy("kling-2.6").normalize_and_validate({"prompt": "x", "duration": 7})["duration"] == 5
    assert get_strategy("luma-ray-2").describe()["defaults"]["duration"] == 9
    assert get_strategy("wan-2.2").normalize_and_validate({"prompt": "x"})["duration"] == 5


def test_text_only_models_switch_task_type():
    assert wrap_seedance_payload_for_piapi(_payload("wan-2.6", image=False, duration=5))["task_type"] == "wan26-txt2video"
    assert wrap_seedance_payload_for_piapi(_payload("wan-2.6", duration=5))["task_type"] == "wan26-img2video"
    hailuo = wrap_seedance_payload_for_piapi(_payload("hailuo-2.3", duration=10, resolution="1080p"))
    assert hailuo["input"]["duration"] == 6 and hailuo["input"]["resolution"] == 1080  # 1080p 只能 6 秒


@pytest.mark.parametrize("model_id", ["skyreels", "framepack"])
def test_image_only_models_require_first_frame(model_id):
    with pytest.raises(RuntimeError, match="首帧"):
        wrap_seedance_payload_for_piapi(_payload(model_id, image=False, duration=10))


def test_hailuo_1080p_billed_as_six_seconds():
    params = get_strategy("hailuo-2.3").normalize_and_validate({"prompt": "x", "duration": 10, "resolution": "1080p"})
    assert params["duration"] == 6


@pytest.mark.parametrize("model_id", [m for m in PIAPI_VIDEO_IDS if m not in {"skyreels", "framepack"}])
def test_text_to_video_path_builds(model_id):
    strategy = get_strategy(model_id)
    duration = strategy.normalize_and_validate({"prompt": "x"})["duration"]
    body = wrap_seedance_payload_for_piapi(_payload(model_id, image=False, duration=duration))
    assert body["task_type"] and "image" not in body["input"] and "image_url" not in body["input"]
