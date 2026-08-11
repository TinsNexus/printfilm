"""Drama LLM helpers via Ark chat/completions."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.config import get_settings
from app.services.ark import get_ark

logger = logging.getLogger(__name__)


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
    max_tokens: int = 32768,
) -> Any:
    """Call Ark LLM and parse JSON from the reply."""
    settings = get_settings()
    ark = get_ark()
    if ark.mock:
        logger.info("LLM JSON（mock）")
        return {"mock": True, "note": "ARK_MOCK=true"}

    logger.info(
        "调用 LLM JSON model=%s user_len=%s max_tokens=%s",
        settings.model_llm,
        len(user or ""),
        max_tokens,
    )
    payload: dict[str, Any] = {
        "model": settings.model_llm,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    async with httpx.AsyncClient(timeout=300.0) as client:
        res = await client.post(
            ark._url("/chat/completions"),
            headers={"Authorization": f"Bearer {settings.ark_api_key}"},
            json=payload,
        )
        res.raise_for_status()
        data = res.json()
    content = data["choices"][0]["message"]["content"]
    logger.info("LLM JSON 返回 content_len=%s", len(content or ""))
    return _extract_json(content)


async def drama_chat_text(
    system: str,
    user: str,
    *,
    temperature: float = 0.7,
    max_tokens: int = 8192,
) -> str:
    """Call Ark LLM and return plain text."""
    settings = get_settings()
    ark = get_ark()
    if ark.mock:
        return f"[mock] {user[:200]}"

    payload: dict[str, Any] = {
        "model": settings.model_llm,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        res = await client.post(
            ark._url("/chat/completions"),
            headers={"Authorization": f"Bearer {settings.ark_api_key}"},
            json=payload,
        )
        res.raise_for_status()
        data = res.json()
    return str(data["choices"][0]["message"]["content"] or "")
