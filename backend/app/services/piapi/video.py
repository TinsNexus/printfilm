"""PiAPI 视频：把方舟 Seedance 请求体转成统一任务接口 `{model, task_type, input}`。

Kling / Seedance / Veo 在本文件；Wan / Hailuo / Hunyuan / Luma / SkyReels / FramePack / MiniMax H3
见 video_tasks.py。模型 id 约定见 `catalog.py`。
任务查询响应 `{code, data: {status, output: {video}}}` 由 tokenfree_video 的通用解析处理。
"""

from __future__ import annotations

from typing import Any

from app.services.piapi.config import PIAPI_TASK_URL, is_piapi_active

# 方舟原生异步视频任务前缀（与 tokenfree_video.ARK_VIDEO_TASK_PREFIX 一致）
_ARK_VIDEO_TASK_PREFIX = "/contents/generations/tasks"

# Kling 支持的 version（PiAPI 文档枚举）
KLING_VERSIONS = ("4.0-flash", "4.0", "3.0-turbo", "3.0", "2.6", "2.5", "2.1-master", "2.1", "1.6", "1.5")
_SEEDANCE_RATIOS = {"16:9", "9:16", "4:3", "3:4", "21:9", "1:1", "adaptive"}
_SEEDANCE_RESOLUTIONS = {"480p", "720p", "1080p"}
DEFAULT_SEEDANCE_TASK_TYPE = "seedance-2.5"


def uses_piapi_gateway() -> bool:
    """后台开关选了 PiAPI 时，ark 层的图/视频改走 PiAPI 统一任务接口。"""
    return is_piapi_active()


def piapi_task_url_for_ark_path(path: str) -> str | None:
    """PiAPI 开启时把方舟视频任务路径映射为统一任务 URL；非视频任务路径返回 None。"""
    if not is_piapi_active():
        return None
    normalized = path if str(path).startswith("/") else f"/{path}"
    if normalized == _ARK_VIDEO_TASK_PREFIX:
        return PIAPI_TASK_URL
    if normalized.startswith(_ARK_VIDEO_TASK_PREFIX + "/"):
        return PIAPI_TASK_URL + normalized[len(_ARK_VIDEO_TASK_PREFIX) :]
    return None


def _parse_seedance_content(payload: dict[str, Any]) -> dict[str, Any]:
    """拆出方舟 content：文案、首帧、尾帧、参考图、参考音频。"""
    texts: list[str] = []
    first: str | None = None
    last: str | None = None
    refs: list[str] = []
    audios: list[str] = []
    content = payload.get("content")
    for item in content if isinstance(content, list) else []:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        if kind == "text":
            piece = str(item.get("text") or "").strip()
            if piece:
                texts.append(piece)
            continue
        raw = item.get(kind) if kind in {"image_url", "audio_url"} else None
        url = str(raw.get("url") or "").strip() if isinstance(raw, dict) else ""
        if not url:
            continue
        if kind == "audio_url":
            audios.append(url)
            continue
        role = str(item.get("role") or "").strip()
        if role == "last_frame":
            last = last or url
        elif role == "reference_image":
            refs.append(url)
        elif first is None:
            first = url
        else:
            refs.append(url)
    return {
        "prompt": "\n".join(texts) or str(payload.get("prompt") or "").strip() or ".",
        "first": first,
        "last": last,
        "refs": list(dict.fromkeys(refs)),
        "audios": audios,
    }


def _int_duration(value: Any, default: int = 5) -> int:
    """时长转整数秒；非法值用默认。"""
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def parse_kling_model(model: str) -> tuple[str | None, str]:
    """从模型 id 解析 Kling (version, mode)：`kling-3.0-pro` → ("3.0", "pro")；裸 `kling` 不带 version。"""
    low = (model or "").strip().lower()
    mode = "pro" if low.endswith("-pro") or low.endswith("/pro") else "std"
    version = next((v for v in KLING_VERSIONS if v in low), None)
    return version, mode


def _kling_duration(seconds: int, version: str | None) -> int:
    """按版本钳制 Kling 时长：4.0 为 3–30、4.0-flash 3–20、3.0 系 3–15，更早只有 5/10。"""
    if version == "4.0":
        return max(3, min(30, seconds))
    if version == "4.0-flash":
        return max(3, min(20, seconds))
    if version in {"3.0", "3.0-turbo"}:
        return max(3, min(15, seconds))
    return 5 if seconds <= 7 else 10


def _build_kling(model: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """Kling：首帧 image_url、尾帧 image_tail_url；参考图上游不支持，丢弃。1080p 对应 pro 档。"""
    version, mode = parse_kling_model(model)
    if str(src.get("resolution") or "").strip().lower() == "1080p":
        mode = "pro"
    inp: dict[str, Any] = {
        "prompt": parts["prompt"][:2500],
        "duration": _kling_duration(_int_duration(src.get("duration")), version),
        "mode": mode,
    }
    if version:
        inp["version"] = version
    ratio = str(src.get("ratio") or "").strip()
    allowed = {"16:9", "9:16", "1:1"} | ({"21:9"} if version in {"4.0", "4.0-flash"} else set())
    if ratio in allowed:
        inp["aspect_ratio"] = ratio
    # Kling 只认首/尾帧：多出来的参考图上游会丢掉，提前报错以免白扣费
    if len(parts["refs"]) > (0 if parts["first"] else 1):
        raise RuntimeError("Kling 只支持首帧 / 尾帧，不支持多张参考图，请改用首尾帧或换 Seedance / Veo")
    first = parts["first"] or (parts["refs"][0] if parts["refs"] else None)
    if first:
        inp["image_url"] = first
        if parts["last"] and version != "4.0-flash":
            inp["image_tail_url"] = parts["last"]
    if src.get("generate_audio"):
        inp["enable_audio"] = True
    return {"model": "kling", "task_type": "video_generation", "input": inp}


def _build_seedance(model: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """Seedance 2.5 / 2.0 / 2.0 Fast / 2.0 Mini：首/尾帧与参考图统一走 image_urls。"""
    from app.services.piapi.video_tasks import SEEDANCE_TASK_TYPES

    task_type = SEEDANCE_TASK_TYPES.get(_canonical_video_model(model), DEFAULT_SEEDANCE_TASK_TYPE)
    longest = 30 if task_type == "seedance-2.5" else 15
    inp: dict[str, Any] = {
        "prompt": parts["prompt"][:4000],
        "duration": max(4, min(longest, _int_duration(src.get("duration")))),
    }
    ratio = str(src.get("ratio") or "").strip()
    if ratio in _SEEDANCE_RATIOS:
        inp["aspect_ratio"] = ratio
    resolution = str(src.get("resolution") or "").strip().lower()
    if resolution in _SEEDANCE_RESOLUTIONS:
        inp["resolution"] = resolution
    images = [u for u in (parts["first"], *parts["refs"], parts["last"]) if u]
    if images:
        inp["image_urls"] = list(dict.fromkeys(images))[: 30 if task_type == "seedance-2.5" else 9]
    if parts["audios"]:
        inp["audio_urls"] = parts["audios"][: 10 if task_type == "seedance-2.5" else 3]
    return {"model": "seedance", "task_type": task_type, "input": inp}


def _build_veo(model: str, src: dict[str, Any], parts: dict[str, Any]) -> dict[str, Any]:
    """Veo：时长只有 4s/6s/8s；有首帧走图生视频，否则 1–3 张参考图走 reference_image_urls。"""
    low = (model or "").strip().lower()
    family = "veo3.1" if "3.1" in low or "3-1" in low else "veo3"
    task_type = f"{family}-video-fast" if "fast" in low else f"{family}-video"
    seconds = _int_duration(src.get("duration"), 8)
    inp: dict[str, Any] = {
        "prompt": parts["prompt"],
        "duration": "4s" if seconds <= 4 else ("6s" if seconds <= 6 else "8s"),
        "generate_audio": bool(src.get("generate_audio")),
    }
    ratio = str(src.get("ratio") or "").strip()
    if ratio in {"16:9", "9:16"}:
        inp["aspect_ratio"] = ratio
    resolution = str(src.get("resolution") or "").strip().lower()
    if resolution in {"720p", "1080p"}:
        inp["resolution"] = resolution
    if parts["first"]:
        inp["image_url"] = parts["first"]
        if parts["last"] and family == "veo3.1":
            inp["tail_image_url"] = parts["last"]
    elif parts["refs"] and family == "veo3.1":
        inp["reference_image_urls"] = parts["refs"][:3]
    return {"model": family, "task_type": task_type, "input": inp}


def _canonical_video_model(model: str) -> str:
    """后台填的模型名 → 策略 id（小写）；不认识的原样小写返回。"""
    from app.services.media_models import MediaValidationError, get_strategy

    try:
        return get_strategy(model).model_id.lower()
    except (MediaValidationError, ValueError):
        return (model or "").strip().lower()


def wrap_seedance_payload_for_piapi(payload: dict[str, Any]) -> dict[str, Any]:
    """把方舟 Seedance body 转成 PiAPI `POST /api/v1/task` 请求体；不支持的模型直接报错。"""
    from app.services.piapi.video_tasks import build_extra_video_task

    src = dict(payload)
    model = str(src.get("model") or "").strip()
    low = model.lower()
    parts = _parse_seedance_content(src)
    extra = build_extra_video_task(_canonical_video_model(model), src, parts)
    if extra is not None:
        return extra
    if "kling" in low:
        return _build_kling(model, src, parts)
    if "seedance" in low:
        return _build_seedance(model, src, parts)
    if "veo" in low:
        return _build_veo(model, src, parts)
    if "sora" in low:
        raise RuntimeError("PiAPI 已下线 Sora 2 接口，请改用 Kling / Veo / Seedance 视频模型")
    raise RuntimeError(f"PiAPI 暂不支持视频模型「{model}」，请在后台改选 PiAPI 视频模型")
