"""漫剧 Agent 文字 LLM（Kimi / OpenAI 兼容，对齐 manju agents/llm.ts）。"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.services.llm_client import (
    DEFAULT_MAX_TOKENS,
    LlmUnavailableError,
    chat_completions,
)

logger = logging.getLogger(__name__)

# 兼容旧引用
DramaLlmUnavailableError = LlmUnavailableError


def _extract_json(text: str) -> Any:
    # Parse JSON object/array from model output (strip fences if present)
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", raw)
        if not m:
            raise
        return json.loads(m.group(1))


async def drama_chat_json(
    system: str,
    user: str,
    *,
    temperature: float = 0.6,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> Any:
    """Call text LLM and parse JSON from the reply."""
    content = await chat_completions(
        system,
        user,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=300.0,
    )
    return _extract_json(content)


async def drama_chat_text(
    system: str,
    user: str,
    *,
    temperature: float = 0.6,
    max_tokens: int = 8192,
) -> str:
    """Call text LLM and return plain text."""
    return await chat_completions(
        system,
        user,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=180.0,
    )
