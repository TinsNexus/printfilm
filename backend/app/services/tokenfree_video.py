"""TokenFree / New API 视频任务：路径映射与 Seedance 请求体包装。

方舟原生是 POST /contents/generations/tasks；New API 不注册该路径，
客户端应走 POST /video/generations，由网关再转到上游 /api/v3/contents/generations/tasks。
"""

from __future__ import annotations

from typing import Any

from app.services.tokenfree_gateway import TOKENFREE_CHANNEL_ID

# 方舟原生异步视频任务前缀
ARK_VIDEO_TASK_PREFIX = "/contents/generations/tasks"
# New API 通用视频任务前缀（相对 /v1）
NEWAPI_VIDEO_TASK_PREFIX = "/video/generations"
# 任务成功态（方舟 + New API）
VIDEO_SUCCESS_STATUSES = {"succeeded", "success", "completed", "complete"}
# 任务失败态
VIDEO_FAILED_STATUSES = {"failed", "cancelled", "canceled", "expired", "failure"}


def uses_tokenfree_video(*, base_url: str = "", channel_id: str = "") -> bool:
    """判断该基址/渠道是否走 New API 视频路径（而非方舟原生）。"""
    if (channel_id or "").strip().lower() == TOKENFREE_CHANNEL_ID:
        return True
    raw = (base_url or "").strip().lower()
    if "tokenfree.com" in raw:
        return True
    if "volces.com" in raw or "volcengineapi.com" in raw:
        return False
    return False


def remap_video_path(path: str, *, base_url: str = "", channel_id: str = "") -> str:
    """TokenFree 上将方舟任务路径改写成 New API /video/generations。"""
    normalized = path if str(path).startswith("/") else f"/{path}"
    if not uses_tokenfree_video(base_url=base_url, channel_id=channel_id):
        return normalized
    if normalized == ARK_VIDEO_TASK_PREFIX or normalized.startswith(ARK_VIDEO_TASK_PREFIX + "/"):
        return NEWAPI_VIDEO_TASK_PREFIX + normalized[len(ARK_VIDEO_TASK_PREFIX) :]
    return normalized


def wrap_seedance_payload_for_newapi(payload: dict[str, Any]) -> dict[str, Any]:
    """把方舟 Seedance body 转成 New API /video/generations 请求体。

    顶层走 prompt/image/duration；完整 content、ratio、generate_audio 等放进 metadata，
    供 doubao adaptor UnmarshalMetadata 还原上游 payload。
    """
    src = dict(payload)
    content = src.get("content")
    # texts 全部文案段（adaptor 可能丢掉非首段 text）
    # images 参考图 URL，顶层 image 给通用 i2v；带 role 的完整项仍在 metadata.content
    texts: list[str] = []
    images: list[str] = []
    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text":
                piece = str(item.get("text") or "").strip()
                if piece:
                    texts.append(piece)
            if item.get("type") == "image_url":
                image_url = item.get("image_url")
                url = image_url.get("url") if isinstance(image_url, dict) else None
                if isinstance(url, str) and url.strip():
                    images.append(url.strip())
    prompt = "\n".join(texts) or str(src.get("prompt") or "").strip() or "."
    metadata = {
        key: value
        for key, value in src.items()
        if key not in {"prompt", "image", "images", "seconds", "metadata"}
    }
    out: dict[str, Any] = {
        "model": src.get("model"),
        "prompt": prompt,
        "metadata": metadata,
    }
    duration = src.get("duration")
    if duration is not None:
        try:
            out["duration"] = int(duration)
            out["seconds"] = str(int(duration))
        except (TypeError, ValueError):
            out["duration"] = duration
    if images:
        out["image"] = images[0]
        if len(images) > 1:
            out["images"] = images
    return out


def prepare_video_create_body(
    body: dict[str, Any],
    *,
    base_url: str = "",
    channel_id: str = "",
) -> dict[str, Any]:
    """按渠道决定是否包装 Seedance 请求体。"""
    if uses_tokenfree_video(base_url=base_url, channel_id=channel_id):
        return wrap_seedance_payload_for_newapi(body)
    return body


def unwrap_video_task_payload(data: dict[str, Any] | None) -> dict[str, Any]:
    """摊平 New API `{data: {...}}` 包装，便于取 status / url / task_id。"""
    if not isinstance(data, dict):
        return {}
    inner = data.get("data")
    if isinstance(inner, dict) and any(
        key in inner for key in ("status", "url", "content", "task_id", "id", "video_url")
    ):
        merged = dict(data)
        merged.update(inner)
        return merged
    return data


def _scalar_task_id(value: Any) -> str | None:
    """把标量任务 ID 收成非空字符串；忽略明显不是 ID 的状态词。"""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (str, int)) and str(value).strip():
        text = str(value).strip()
        if text.lower() in {"success", "ok", "true", "none", "null", "0"}:
            return None
        return text
    return None


def extract_video_task_id(data: dict[str, Any] | None) -> str | None:
    """从创建/查询响应取出轮询用任务 ID。

    New API 可能同时给 `id`（视频对象）和 `task_id`（查询用）；优先 task_id。
    部分网关把 ID 放在字符串 `data` 里。
    """
    if not isinstance(data, dict):
        return None
    payload = unwrap_video_task_payload(data)
    for key in ("task_id", "taskId"):
        found = _scalar_task_id(payload.get(key))
        if found:
            return found
    found = _scalar_task_id(data.get("data"))
    if found:
        return found
    return _scalar_task_id(payload.get("id"))


def format_video_task_error(err: Any) -> str:
    """把上游 error 对象收成可读短句。"""
    if isinstance(err, dict):
        for key in ("message", "msg", "error"):
            value = err.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            if isinstance(value, dict):
                nested = format_video_task_error(value)
                if nested:
                    return nested
        return "视频生成失败"
    text = str(err or "").strip()
    return text or "视频生成失败"


def extract_video_result_url(data: dict[str, Any]) -> str | None:
    """从任务成功响应中取视频 URL（New API `url` 或方舟 `content.video_url`）。"""
    for key in ("url", "video_url"):
        value = data.get(key)
        if isinstance(value, str) and value.strip().startswith(("http://", "https://", "/")):
            return value.strip()
    content = data.get("content")
    if isinstance(content, dict):
        for key in ("video_url", "url"):
            value = content.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def normalize_video_task_status(status: str) -> str:
    """把上游状态归一成 running/succeeded/failed。"""
    raw = (status or "").strip().lower()
    if raw in VIDEO_SUCCESS_STATUSES:
        return "succeeded"
    if raw in VIDEO_FAILED_STATUSES:
        return "failed"
    return "running"
