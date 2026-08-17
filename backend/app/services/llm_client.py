"""OpenAI 兼容文字模型客户端（对齐 manju agents/llm.ts）。"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# DEFAULT_LLM_MODEL kimi-k2.6：关闭 thinking 后结构化长文本更快
DEFAULT_LLM_MODEL = "kimi-k2.6"

# DEFAULT_MAX_TOKENS 分集正文等结构化输出需要足够 completion 空间
DEFAULT_MAX_TOKENS = 32768


class LlmUnavailableError(RuntimeError):
    """文字 LLM 未配置或不可用。"""


# 解析 LLM API Key（对齐 manju resolveOpenaiApiKey）
def resolve_llm_api_key() -> str:
    key = (get_settings().openai_api_key or "").strip()
    if not key:
        raise LlmUnavailableError(
            "未配置 OPENAI_API_KEY，无法调用文字模型。"
            "请在 backend/.env 设置 OPENAI_API_KEY、OPENAI_BASE_URL，"
            f"并将 MODEL_LLM 设为 {DEFAULT_LLM_MODEL}（或你的 Kimi 接入点）。"
        )
    return key


# 解析 OpenAI 兼容 Base URL
def resolve_llm_base_url() -> str:
    base = (get_settings().openai_base_url or "").strip().rstrip("/")
    if base:
        return base
    return "https://api.openai.com/v1"


# kimi-k2.6 需关闭 thinking，否则 token 耗在 reasoning_content、content 为空
def _llm_extra_body(model: str) -> dict[str, Any]:
    if (model or "").strip().lower().startswith("kimi"):
        return {"thinking": {"type": "disabled"}}
    return {}


# 从 chat/completions 响应提取正文
def _message_content(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    if content:
        return str(content)
    # 部分兼容网关把结果放在 reasoning_content
    reasoning = message.get("reasoning_content")
    return str(reasoning or "")


# 调用 OpenAI 兼容 chat/completions
async def chat_completions(
    system: str,
    user: str,
    *,
    temperature: float = 0.6,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    timeout: float = 300.0,
    response_format: dict[str, Any] | None = None,
) -> str:
    settings = get_settings()
    api_key = resolve_llm_api_key()
    model = (settings.model_llm or DEFAULT_LLM_MODEL).strip() or DEFAULT_LLM_MODEL
    base = resolve_llm_base_url()
    # kimi-k2.6 仅允许 temperature=0.6，其它值会 400
    effective_temperature = 0.6 if model.lower().startswith("kimi") else temperature

    payload: dict[str, Any] = {
        "model": model,
        "temperature": effective_temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    extra = _llm_extra_body(model)
    if extra:
        payload.update(extra)
    if response_format:
        payload["response_format"] = response_format

    logger.info(
        "调用文字 LLM model=%s base=%s user_len=%s max_tokens=%s",
        model,
        base,
        len(user or ""),
        max_tokens,
    )
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(
            f"{base}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if res.status_code >= 400:
            raise RuntimeError(f"LLM error {res.status_code}: {res.text[:800]}")
        data = res.json()
    content = _message_content(data)
    logger.info("文字 LLM 返回 content_len=%s", len(content))
    return content
