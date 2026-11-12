"""PiAPI 统一任务接口：Kling / Seedance / Veo 以外各视频模型的任务体与参考价。

入参 `src` 是方舟 Seedance 风格的请求体（model / duration / ratio / resolution / generate_audio），
`parts` 是 video.py 拆出的 {prompt, first, last, refs, audios}。字段按 PiAPI 文档（2026-11）。
"""

from __future__ import annotations

from typing import Any, Callable

# 参考价（美元/秒，PiAPI 官网文档；按条计费的按默认时长折算）：初始化价格草稿用，不是用户实收价
PIAPI_VIDEO_REFERENCE_USD: dict[str, dict[str, str]] = {
    "seedance-2.0": {"480p": "0.10", "720p": "0.20"},
    "seedance-2.0-fast": {"480p": "0.048", "720p": "0.096"},
    "seedance-2-mini": {"480p": "0.042", "720p": "0.084"},
    "kling-4.0": {"720p": "0.1667", "1080p": "0.25"},
    "kling-4.0-flash": {"720p": "0.10"},
    "kling-3.0": {"720p": "0.15", "1080p": "0.20"},  # 按带声音的价，宁高勿低
    "kling-3.0-turbo": {"720p": "0.13", "1080p": "0.19"},
    "kling-2.6": {"720p": "0.04", "1080p": "0.066"},
    "kling-2.5": {"720p": "0.04", "1080p": "0.066"},
    "kling-2.1": {"720p": "0.052", "1080p": "0.092"},
    "veo3": {"720p": "0.24", "1080p": "0.24"},  # 带声音 0.24，不带 0.12
    "veo3-fast": {"720p": "0.09", "1080p": "0.09"},
    "wan-2.6": {"720p": "0.08", "1080p": "0.12"},
    "wan-2.2": {"720p": "0.056"},  # $0.28/条 ÷ 5 秒
    "wan-2.1": {"480p": "0.056"},
    "hailuo-2.3": {"768p": "0.045", "1080p": "0.0667"},
    "hailuo-2.3-fast": {"768p": "0.0267", "1080p": "0.0433"},
    "hunyuan-video": {"720p": "0.018"},  # $0.09/条 ÷ 5 秒
    "hunyuan-video-fast": {"720p": "0.006"},
    "luma-ray-2": {"720p": "0.0445"},  # $0.2/5s、$0.4/9s
    "skyreels": {"720p": "0.03"},  # $0.15/条 ÷ 5 秒
    "framepack": {"480p": "0.03"},
    "MiniMax-H3": {"480p": "0.03", "768p": "0.05"},
}

# Seedance 策略 id → PiAPI task_type
SEEDANCE_TASK_TYPES = {
    "seedance-2.5": "seedance-2.5",
    "seedance-2.0": "seedance-2",
    "seedance-2.0-fast": "seedance-2-fast",
    "seedance-2-mini": "seedance-2-mini",
}


def _seconds(src: dict[str, Any], default: int = 5) -> int:
    """时长转整数秒；非法值用默认。"""
    try:
        return int(float(src.get("duration")))
    except (TypeError, ValueError):
        return default


def _ratio(src: dict[str, Any], allowed: set[str]) -> str | None:
    """只传上游认识的画幅。"""
    value = str(src.get("ratio") or "").strip()
    return value if value in allowed else None


def _resolution(src: dict[str, Any]) -> str:
    return str(src.get("resolution") or "").strip().lower()


def _first_image(parts: dict[str, Any]) -> str | None:
    """首帧：显式首帧优先，否则第一张参考图。"""
    return parts["first"] or (parts["refs"][0] if parts["refs"] else None)


def _wan26(model_id: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """Wan 2.6：有首帧走 wan26-img2video（画幅随图），否则 wan26-txt2video。"""
    inp: dict[str, Any] = {
        "prompt": parts["prompt"],
        "resolution": "1080P" if _resolution(src) == "1080p" else "720P",
        "duration": _seconds(src),
        "audio": bool(src.get("generate_audio")),
        "watermark": False,
    }
    image = _first_image(parts)
    if image:
        inp["image"] = image
        return {"model": "Wan", "task_type": "wan26-img2video", "input": inp}
    if ratio := _ratio(src, {"16:9", "9:16", "1:1", "4:3", "3:4"}):
        inp["aspect_ratio"] = ratio
    return {"model": "Wan", "task_type": "wan26-txt2video", "input": inp}


def _wanx(model_id: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """WanX：Wan 2.2 用 wan22-* 任务，Wan 2.1 用 14B 任务；首尾帧都有时走 keyframe。"""
    inp: dict[str, Any] = {"prompt": parts["prompt"]}
    image = _first_image(parts)
    v22 = model_id == "wan-2.2"
    if image and parts["last"] and not v22:
        inp.update(start_image=image, end_image=parts["last"])
        task = "img2video-14b-keyframe"
    elif image:
        inp["image"] = image
        task = "wan22-img2video-14b" if v22 else "img2video-14b"
    else:
        task = "wan22-txt2video-14b" if v22 else "txt2video-14b"
    if task not in {"wan22-img2video-14b"} and (ratio := _ratio(src, {"16:9", "9:16"})):
        inp["aspect_ratio"] = ratio
    return {"model": "Qubico/wanx", "task_type": task, "input": inp}


def _hailuo(model_id: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """Hailuo 2.3：6 / 10 秒，768 / 1080（1080 只能 6 秒）；首帧走 image_url。"""
    resolution = 1080 if _resolution(src) == "1080p" else 768
    duration = 10 if _seconds(src, 6) >= 8 else 6
    if resolution == 1080:
        duration = 6
    inp: dict[str, Any] = {
        "prompt": parts["prompt"][:2000],
        "model": "v2.3-fast" if model_id.endswith("fast") else "v2.3",
        "duration": duration,
        "resolution": resolution,
    }
    if image := _first_image(parts):
        inp["image_url"] = image
    return {"model": "hailuo", "task_type": "video_generation", "input": inp, "config": {"service_mode": "public"}}


def _hunyuan(model_id: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """Hunyuan：文生 txt2video / fast-txt2video；有首帧走 img2video-concat。"""
    inp: dict[str, Any] = {
        "prompt": parts["prompt"],
        "aspect_ratio": _ratio(src, {"16:9", "9:16", "1:1"}) or "16:9",
    }
    image = _first_image(parts)
    if image and model_id == "hunyuan-video":
        inp["image"] = image
        task = "img2video-concat"
    else:
        task = "fast-txt2video" if model_id == "hunyuan-video-fast" else "txt2video"
    return {"model": "Qubico/hunyuan", "task_type": task, "input": inp}


def _luma(model_id: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """Luma Ray 2：5 / 9 秒，首尾帧 start_image / end_image。"""
    inp: dict[str, Any] = {
        "prompt": parts["prompt"],
        "model_name": "ray-v2",
        "duration": 9 if _seconds(src) >= 7 else 5,
        "loop": False,
    }
    if ratio := _ratio(src, {"9:16", "3:4", "1:1", "4:3", "16:9", "21:9"}):
        inp["aspect_ratio"] = ratio
    if image := _first_image(parts):
        inp["start_image"] = image
        if parts["last"]:
            inp["end_image"] = parts["last"]
    return {"model": "luma", "task_type": "video_generation", "input": inp}


def _skyreels(model_id: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """SkyReels：只有图生视频，没首帧直接报错，避免白扣费。"""
    image = _first_image(parts)
    if not image:
        raise RuntimeError("SkyReels 只支持图生视频，请先提供首帧图片")
    inp: dict[str, Any] = {"prompt": parts["prompt"], "image": image}
    if ratio := _ratio(src, {"16:9", "9:16", "1:1"}):
        inp["aspect_ratio"] = ratio
    return {"model": "Qubico/skyreels", "task_type": "img2video", "input": inp}


def _framepack(model_id: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """FramePack：图生长镜头，首帧必填、尾帧可选，10–30 秒。"""
    image = _first_image(parts)
    if not image:
        raise RuntimeError("FramePack 只支持图生视频，请先提供首帧图片")
    inp: dict[str, Any] = {
        "prompt": parts["prompt"],
        "start_image": image,
        "duration": max(10, min(30, _seconds(src, 10))),
    }
    if parts["last"]:
        inp["end_image"] = parts["last"]
    return {"model": "Qubico/framepack", "task_type": "img2video", "input": inp}


def _minimax_h3(model_id: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """MiniMax H3：5–15 秒，512p / 768p（文档枚举）；有首帧走 img2video。"""
    inp: dict[str, Any] = {
        "prompt": parts["prompt"][:2000],
        "resolution": "768p" if _resolution(src) == "768p" else "512p",
        "duration": max(5, min(15, _seconds(src))),
    }
    if ratio := _ratio(src, {"16:9", "9:16", "1:1"}):
        inp["aspect_ratio"] = ratio
    image = _first_image(parts)
    if image:
        inp["image"] = image
    return {
        "model": "Qubico/minimax-h3",
        "task_type": "img2video" if image else "txt2video",
        "input": inp,
        "config": {"service_mode": "public"},
    }


_BUILDERS: dict[str, Callable[[str, dict[str, Any], dict[str, Any]], dict[str, Any]]] = {
    "wan-2.6": _wan26,
    "wan-2.2": _wanx,
    "wan-2.1": _wanx,
    "hailuo-2.3": _hailuo,
    "hailuo-2.3-fast": _hailuo,
    "hunyuan-video": _hunyuan,
    "hunyuan-video-fast": _hunyuan,
    "luma-ray-2": _luma,
    "skyreels": _skyreels,
    "framepack": _framepack,
    "minimax-h3": _minimax_h3,
}


def build_extra_video_task(model_id: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any] | None:
    """按策略 id 构造任务体；Kling / Seedance / Veo 及不认识的返回 None，由 video.py 处理。"""
    key = (model_id or "").strip().lower()
    builder = _BUILDERS.get(key)
    return builder(key, src, parts) if builder else None
