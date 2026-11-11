"""PiAPI 网关配置：固定地址、网关类型判定与 Key 解析。

PiAPI 有两套接口，共用同一个 Key：
- 文本：OpenAI 兼容 `POST {origin}/v1/chat/completions`（Authorization: Bearer）
- 图/视频：统一任务接口 `POST {origin}/api/v1/task` + `GET {origin}/api/v1/task/{id}`（X-API-Key）
"""

from __future__ import annotations

from app.config import Settings, get_settings

PIAPI_CHANNEL_NAME = "PiAPI"
PIAPI_ORIGIN = "https://api.piapi.ai"
# 文本模型 OpenAI 兼容基址
PIAPI_LLM_BASE_URL = f"{PIAPI_ORIGIN}/v1"
# 图/视频统一任务接口
PIAPI_TASK_URL = f"{PIAPI_ORIGIN}/api/v1/task"
PIAPI_CONSOLE_URL = "https://piapi.ai/workspace"

GATEWAY_TYPE_PIAPI = "piapi"


def is_piapi_type(value: str | None) -> bool:
    """判断网关类型字符串是否表示 PiAPI。"""
    return (value or "").strip().lower() in {GATEWAY_TYPE_PIAPI, "pi_api", "pi-api"}


def is_piapi_active(settings: Settings | None = None) -> bool:
    """PiAPI 是否为当前上游（后台开关 / 环境变量 UPSTREAM_GATEWAY_TYPE）。"""
    s = settings or get_settings()
    return is_piapi_type(getattr(s, "upstream_gateway_type", ""))


def resolve_piapi_api_key(settings: Settings | None = None) -> str:
    """PiAPI Key，只取 PIAPI 配置，不回落到 TokenFree / 9Router Key。"""
    s = settings or get_settings()
    return (getattr(s, "piapi_api_key", "") or "").strip()
