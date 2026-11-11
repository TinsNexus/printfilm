"""文字 LLM 遇上游限流时按退避重试，非限流错误不重试。"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services import llm_client


def _resp(status: int, body: str = "{}", headers: dict | None = None) -> httpx.Response:
    return httpx.Response(status, text=body, headers=headers or {}, request=httpx.Request("POST", "http://x/v1/chat/completions"))


OK = '{"choices":[{"message":{"content":"hi"}}]}'


def _route():
    return patch.multiple(
        llm_client,
        resolve_upstream_model=lambda *a: "m",
        resolve_logical_model_id=lambda *a: "m",
        resolve_logical_model=lambda *a: None,
        resolve_llm_api_key=lambda: "k",
        resolve_llm_base_url=lambda: "http://x/v1",
    )


@pytest.mark.parametrize("status", [429, 503])
async def test_retries_rate_limit_then_succeeds(status, monkeypatch):
    monkeypatch.setattr(llm_client.get_settings(), "model_llm", "m", raising=False)
    calls = AsyncMock(side_effect=[_resp(status, headers={"retry-after": "0"}), _resp(200, OK)])
    with _route(), patch.object(llm_client, "observed_request", calls), patch.object(llm_client.asyncio, "sleep", AsyncMock()) as sleep:
        assert await llm_client.chat_completions("s", "u") == "hi"
    assert calls.await_count == 2 and sleep.await_count == 1


async def test_gives_up_after_three_attempts(monkeypatch):
    monkeypatch.setattr(llm_client.get_settings(), "model_llm", "m", raising=False)
    calls = AsyncMock(return_value=_resp(429, '{"error":"busy"}'))
    with _route(), patch.object(llm_client, "observed_request", calls), patch.object(llm_client.asyncio, "sleep", AsyncMock()) as sleep:
        with pytest.raises(RuntimeError, match="LLM error 429"):
            await llm_client.chat_completions("s", "u")
    assert calls.await_count == 3
    assert [c.args[0] for c in sleep.await_args_list] == [2.0, 4.0]


async def test_client_error_is_not_retried(monkeypatch):
    monkeypatch.setattr(llm_client.get_settings(), "model_llm", "m", raising=False)
    calls = AsyncMock(return_value=_resp(400, '{"error":"bad"}'))
    with _route(), patch.object(llm_client, "observed_request", calls):
        with pytest.raises(RuntimeError, match="LLM error 400"):
            await llm_client.chat_completions("s", "u")
    assert calls.await_count == 1
