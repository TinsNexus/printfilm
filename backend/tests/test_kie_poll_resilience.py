# -*- coding: utf-8 -*-
"""Kie 轮询韧性回归：

- fetch_video_once：429/5xx、网络异常、HTTP 200 业务错误码、成功但结果 URL 缺失，
  一律按 running 退避；404/401 等终态 4xx 判 failed；
- wait_job_success / wait_veo_success：单次查询故障不杀整任务，退避后继续，总超时收敛。
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import kie_client as kie_module
from app.services.kie_client import KieClient, KiePollTransientError


class _FakeResponse:
    """最小 httpx.Response 替身。"""

    def __init__(self, status_code: int = 200, payload=None, text: str = "err", content: bytes = b"x"):
        self.status_code = status_code
        self.text = text
        self.content = content
        self._payload = payload if payload is not None else {}

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def _install_fake_http(monkeypatch, handler):
    """把 httpx.AsyncClient 替换为按 handler 脚本应答的假客户端。"""

    class _FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, headers=None, params=None):
            outcome = handler()
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

    monkeypatch.setattr(kie_module.httpx, "AsyncClient", _FakeAsyncClient)


@pytest.fixture
def kie(monkeypatch) -> KieClient:
    monkeypatch.setattr(KieClient, "_headers", lambda self: {"Authorization": "Bearer test"})
    return KieClient(api_key="test-key")


@pytest.fixture
def no_sleep(monkeypatch):
    monkeypatch.setattr(kie_module.asyncio, "sleep", AsyncMock())


# ---------- fetch_video_once：jobs ----------

@pytest.mark.parametrize("code", [429, 500, 502, 503, 504])
async def test_fetch_jobs_transient_http_is_running(kie, monkeypatch, code: int) -> None:
    _install_fake_http(monkeypatch, lambda: _FakeResponse(code, payload={}, text="busy"))
    result = await kie.fetch_video_once("t1")
    assert result.status == "running"
    assert result.provider_task_id == "t1"


async def test_fetch_jobs_network_error_is_running(kie, monkeypatch) -> None:
    _install_fake_http(monkeypatch, lambda: httpx.ConnectError("reset"))
    result = await kie.fetch_video_once("t1")
    assert result.status == "running"


async def test_fetch_jobs_biz_code_error_is_running(kie, monkeypatch) -> None:
    _install_fake_http(
        monkeypatch,
        lambda: _FakeResponse(200, payload={"code": 500, "msg": "internal"}),
    )
    result = await kie.fetch_video_once("t1")
    assert result.status == "running"


@pytest.mark.parametrize("code", [401, 404])
async def test_fetch_jobs_terminal_4xx_is_failed(kie, monkeypatch, code: int) -> None:
    _install_fake_http(monkeypatch, lambda: _FakeResponse(code, payload={"msg": "denied"}))
    result = await kie.fetch_video_once("t1")
    assert result.status == "failed"
    assert "denied" in (result.error or "")


async def test_fetch_jobs_empty_payload_is_running(kie, monkeypatch) -> None:
    _install_fake_http(monkeypatch, lambda: _FakeResponse(200, payload={}))
    result = await kie.fetch_video_once("t1")
    assert result.status == "running"


async def test_fetch_jobs_success_with_urls(kie, monkeypatch) -> None:
    payload = {
        "code": 0,
        "data": {
            "state": "success",
            "creditsConsumed": 10,
            "resultJson": json.dumps({"resultUrls": ["https://cdn.example.com/v.mp4"]}),
        },
    }
    _install_fake_http(monkeypatch, lambda: _FakeResponse(200, payload=payload))
    result = await kie.fetch_video_once("t1")
    assert result.status == "succeeded"
    assert result.url == "https://cdn.example.com/v.mp4"
    assert result.raw_usage and result.raw_usage["creditsConsumed"] == 10


async def test_fetch_jobs_success_without_urls_keeps_running(kie, monkeypatch) -> None:
    payload = {"code": 0, "data": {"state": "success", "resultJson": json.dumps({"resultUrls": []})}}
    _install_fake_http(monkeypatch, lambda: _FakeResponse(200, payload=payload))
    result = await kie.fetch_video_once("t1")
    assert result.status == "running"


async def test_fetch_jobs_failed_state(kie, monkeypatch) -> None:
    payload = {"code": 0, "data": {"state": "fail", "failMsg": "content policy", "failCode": "POL"}}
    _install_fake_http(monkeypatch, lambda: _FakeResponse(200, payload=payload))
    result = await kie.fetch_video_once("t1")
    assert result.status == "failed"
    assert "content policy" in (result.error or "")


# ---------- fetch_video_once：veo ----------

async def test_fetch_veo_success(kie, monkeypatch) -> None:
    payload = {
        "code": 0,
        "data": {
            "successFlag": 1,
            "creditsConsumed": 5,
            "response": {"resultUrls": ["https://cdn.example.com/veo.mp4"]},
        },
    }
    _install_fake_http(monkeypatch, lambda: _FakeResponse(200, payload=payload))
    result = await kie.fetch_video_once("t1", api_kind="veo")
    assert result.status == "succeeded"
    assert result.url == "https://cdn.example.com/veo.mp4"


async def test_fetch_veo_success_without_urls_keeps_running(kie, monkeypatch) -> None:
    payload = {"code": 0, "data": {"successFlag": 1, "response": {"resultUrls": []}}}
    _install_fake_http(monkeypatch, lambda: _FakeResponse(200, payload=payload))
    result = await kie.fetch_video_once("t1", api_kind="veo")
    assert result.status == "running"


async def test_fetch_veo_flag_failed(kie, monkeypatch) -> None:
    payload = {"code": 0, "data": {"successFlag": 3, "errorMessage": "blocked", "errorCode": "X"}}
    _install_fake_http(monkeypatch, lambda: _FakeResponse(200, payload=payload))
    result = await kie.fetch_video_once("t1", api_kind="veo")
    assert result.status == "failed"
    assert "blocked" in (result.error or "")


async def test_fetch_veo_transient_is_running(kie, monkeypatch) -> None:
    _install_fake_http(monkeypatch, lambda: _FakeResponse(500, payload={"msg": "upstream"}))
    result = await kie.fetch_video_once("t1", api_kind="veo")
    assert result.status == "running"


# ---------- wait_* 长轮询容错 ----------

async def test_wait_job_survives_transient_then_succeeds(kie, monkeypatch, no_sleep) -> None:
    success = _FakeResponse(
        200,
        payload={"code": 0, "data": {"state": "success", "resultJson": '{"resultUrls": ["https://x/v.mp4"]}'}},
    )
    script = iter([_FakeResponse(503, payload={"msg": "busy"}), success])
    _install_fake_http(monkeypatch, lambda: next(script))
    info = await kie.wait_job_success("t1", poll_interval=0.01, timeout=30)
    assert info["state"] == "success"


async def test_wait_job_persistent_failure_times_out(kie, monkeypatch, no_sleep) -> None:
    _install_fake_http(monkeypatch, lambda: _FakeResponse(503, payload={"msg": "busy"}))
    with pytest.raises(RuntimeError, match="Kie poll timeout"):
        await kie.wait_job_success("t1", poll_interval=0.01, timeout=0.02)


async def test_wait_veo_survives_transient_then_succeeds(kie, monkeypatch, no_sleep) -> None:
    success = _FakeResponse(200, payload={"code": 0, "data": {"successFlag": 1, "response": {"resultUrls": ["https://x/v.mp4"]}}})
    script = iter([_FakeResponse(429, payload={"msg": "rate"}), success])
    _install_fake_http(monkeypatch, lambda: next(script))
    info = await kie.wait_veo_success("t1", poll_interval=0.01, timeout=30)
    assert info["successFlag"] == 1


async def test_get_record_raises_transient_type(kie, monkeypatch) -> None:
    _install_fake_http(monkeypatch, lambda: _FakeResponse(500, payload={"msg": "x"}))
    with pytest.raises(KiePollTransientError):
        await kie.get_job("t1")
