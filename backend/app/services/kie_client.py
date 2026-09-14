# -*- coding: utf-8 -*-
"""Kie.ai 异步任务客户端：Market jobs + Veo 生成。"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any

import httpx

from app.config import get_settings
from app.services import storage
from app.services.ark import ImageResult, TaskResult
from app.services.billing.pricing import kie_credits_to_cost_fen
from app.services.kie_catalog import MediaModelSpec

logger = logging.getLogger(__name__)

KIE_DEFAULT_BASE = "https://api.kie.ai"
KIE_CHANNEL_ID = "kie-default"


class KiePollTransientError(RuntimeError):
    """recordInfo 单次查询瞬时故障（429/5xx/网络异常/坏响应/业务错误码），轮询应退避重试。"""


def resolve_kie_credentials() -> tuple[str, str]:
    """优先后台 Kie 渠道 Key，env 仅作兜底。返回 (api_key, base_url)。"""
    try:
        from app.services.model_settings import get_routing_snapshot

        channels = get_routing_snapshot().channels
    except Exception:  # noqa: BLE001
        channels = []
    kie_channels = [
        ch
        for ch in channels
        if ch.enabled
        and (ch.protocol or "").lower() == "kie"
        and (ch.api_key or "").strip()
    ]
    if kie_channels:
        preferred = next((ch for ch in kie_channels if ch.id == KIE_CHANNEL_ID), kie_channels[0])
        base = (preferred.base_url or "").strip().rstrip("/") or KIE_DEFAULT_BASE
        return (preferred.api_key or "").strip(), base
    s = get_settings()
    return (
        (getattr(s, "kie_api_key", "") or "").strip(),
        (getattr(s, "kie_base_url", "") or KIE_DEFAULT_BASE).rstrip("/") or KIE_DEFAULT_BASE,
    )


class KieClient:
    """调用 Kie createTask / recordInfo / veo.generate。"""

    def __init__(self, api_key: str | None = None, base_url: str | None = None) -> None:
        env_key, env_base = resolve_kie_credentials()
        self.api_key = (api_key or env_key or "").strip()
        self.base_url = (base_url or env_base or KIE_DEFAULT_BASE).rstrip("/")

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise RuntimeError("未配置 Kie API Key（后台「Kie.ai」渠道或环境变量 KIE_API_KEY）")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    # 组装计费用 raw_usage，并把 credits 换算为上游成本（分）
    def _billing_from_credits(self, task_id: str, credits: Any) -> tuple[dict[str, Any], int | None]:
        cost_fen = kie_credits_to_cost_fen(credits)
        raw: dict[str, Any] = {
            "kie_task_id": task_id,
            "creditsConsumed": credits,
            "provider": "kie",
        }
        if cost_fen is not None:
            raw["cost_fen"] = cost_fen
            raw["usage"] = {
                "creditsConsumed": credits,
                "cost_fen": cost_fen,
            }
        return raw, cost_fen

    async def create_job(self, model: str, input_payload: dict[str, Any]) -> str:
        """POST /api/v1/jobs/createTask，返回 taskId。"""
        body = {"model": model, "input": input_payload}
        # 打日志便于核对 Seedance 画幅等关键字段
        try:
            aspect = input_payload.get("aspect_ratio")
            logger.info(
                "Kie createTask model=%s aspect_ratio=%s keys=%s",
                model,
                aspect,
                sorted(str(k) for k in input_payload.keys()),
            )
        except Exception:  # noqa: BLE001
            pass
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/api/v1/jobs/createTask",
                headers=self._headers(),
                json=body,
            )
            data = resp.json() if resp.content else {}
            if resp.status_code >= 400 or int(data.get("code") or 0) not in (0, 200):
                raise RuntimeError(
                    f"Kie createTask error {resp.status_code}: "
                    f"{(data.get('msg') or resp.text or '')[:500]}"
                )
            task_id = ((data.get("data") or {}) if isinstance(data.get("data"), dict) else {}).get(
                "taskId"
            ) or data.get("taskId")
            if not task_id:
                raise RuntimeError(f"Kie createTask missing taskId: {json.dumps(data)[:400]}")
            return str(task_id)

    async def create_veo(
        self,
        *,
        model: str,
        prompt: str,
        image_urls: list[str] | None = None,
        aspect_ratio: str = "16:9",
    ) -> str:
        """POST /api/v1/veo/generate，返回 taskId。"""
        body: dict[str, Any] = {
            "prompt": prompt,
            "model": model,
            "aspect_ratio": aspect_ratio or "16:9",
        }
        if image_urls:
            body["imageUrls"] = image_urls[:2]
            body["generationType"] = "FIRST_AND_LAST_FRAMES_2_VIDEO"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/api/v1/veo/generate",
                headers=self._headers(),
                json=body,
            )
            data = resp.json() if resp.content else {}
            if resp.status_code >= 400 or int(data.get("code") or 0) not in (0, 200):
                raise RuntimeError(
                    f"Kie veo.generate error {resp.status_code}: "
                    f"{(data.get('msg') or resp.text or '')[:500]}"
                )
            task_id = ((data.get("data") or {}) if isinstance(data.get("data"), dict) else {}).get(
                "taskId"
            ) or data.get("taskId")
            if not task_id:
                raise RuntimeError(f"Kie veo missing taskId: {json.dumps(data)[:400]}")
            return str(task_id)

    async def _get_record(self, path: str, task_id: str, label: str) -> dict[str, Any]:
        """recordInfo 类轮询端点的统一处理。

        - 429/5xx、网络异常、非 JSON、HTTP 200 但业务 code 非 0/200：KiePollTransientError（退避重试）；
        - 其余 4xx（鉴权失败/任务不存在）：RuntimeError 终态；
        - 空载荷返回 {}，由调用方按 running 处理。
        """
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.get(
                    f"{self.base_url}{path}",
                    headers=self._headers(),
                    params={"taskId": task_id},
                )
        except httpx.HTTPError as exc:
            raise KiePollTransientError(f"{label} network error: {exc}") from exc
        try:
            data = resp.json() if resp.content else {}
        except ValueError as exc:
            raise KiePollTransientError(
                f"{label} non-JSON HTTP {resp.status_code}: {resp.text[:200]}"
            ) from exc
        msg = str(data.get("msg") or "") if isinstance(data, dict) else ""
        if resp.status_code == 429 or resp.status_code >= 500:
            raise KiePollTransientError(
                f"{label} HTTP {resp.status_code}: {(msg or resp.text or '')[:300]}"
            )
        if resp.status_code >= 400:
            raise RuntimeError(f"{label} error {resp.status_code}: {(msg or resp.text or '')[:500]}")
        # 网关可能以 HTTP 200 + code 报错（限流/内部错误）；无 code 字段时不误伤
        if isinstance(data, dict) and data.get("code") is not None:
            try:
                code_int = int(data.get("code"))
            except (TypeError, ValueError):
                code_int = -1
            if code_int not in (0, 200):
                raise KiePollTransientError(f"{label} biz code={code_int}: {msg[:300]}")
        payload = data.get("data") if isinstance(data, dict) and isinstance(data.get("data"), dict) else data
        return payload if isinstance(payload, dict) else {}

    async def get_job(self, task_id: str) -> dict[str, Any]:
        """GET /api/v1/jobs/recordInfo?taskId=…"""
        return await self._get_record("/api/v1/jobs/recordInfo", task_id, "Kie recordInfo")

    async def get_veo(self, task_id: str) -> dict[str, Any]:
        """GET /api/v1/veo/record-info?taskId=…"""
        return await self._get_record("/api/v1/veo/record-info", task_id, "Kie veo.record-info")

    async def wait_job_success(
        self,
        task_id: str,
        *,
        poll_interval: float | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        """轮询 Market jobs 直到 success/fail。"""
        s = get_settings()
        interval = float(poll_interval or getattr(s, "ark_video_poll_interval", 8) or 8)
        deadline = time.monotonic() + float(timeout or getattr(s, "ark_video_poll_timeout", 900) or 900)
        while time.monotonic() < deadline:
            try:
                info = await self.get_job(task_id)
            except Exception as exc:  # 单次查询失败（429/5xx/4xx/网络）不杀任务，退避后由 deadline 收敛
                logger.warning("Kie wait_job poll error task=%s: %s", task_id, exc)
                await asyncio.sleep(max(2.0, interval))
                continue
            state = str(info.get("state") or "").lower()
            if state == "success":
                return info
            if state == "fail":
                raise RuntimeError(
                    f"Kie task failed: {info.get('failMsg') or info.get('failCode') or state}"
                )
            await asyncio.sleep(max(2.0, interval))
        raise RuntimeError("Kie poll timeout")

    async def wait_veo_success(
        self,
        task_id: str,
        *,
        poll_interval: float | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        """轮询 Veo successFlag：0 生成中 / 1 成功 / 2|3 失败。"""
        s = get_settings()
        interval = float(poll_interval or getattr(s, "ark_video_poll_interval", 8) or 8)
        deadline = time.monotonic() + float(timeout or getattr(s, "ark_video_poll_timeout", 900) or 900)
        while time.monotonic() < deadline:
            try:
                info = await self.get_veo(task_id)
            except Exception as exc:  # 单次查询失败不杀任务，退避后由 deadline 收敛
                logger.warning("Kie wait_veo poll error task=%s: %s", task_id, exc)
                await asyncio.sleep(max(2.0, interval))
                continue
            flag = info.get("successFlag")
            if flag in (1, "1", True):
                return info
            if flag in (2, 3, "2", "3"):
                raise RuntimeError(
                    f"Kie veo failed: {info.get('errorMessage') or info.get('errorCode') or flag}"
                )
            await asyncio.sleep(max(2.0, interval))
        raise RuntimeError("Kie veo poll timeout")

    @staticmethod
    def _job_result_urls(info: dict[str, Any]) -> list[str]:
        """从 jobs resultJson 解析媒体 URL。"""
        raw = info.get("resultJson")
        obj: Any = raw
        if isinstance(raw, str) and raw.strip():
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                return []
        if not isinstance(obj, dict):
            return []
        urls = obj.get("resultUrls") or obj.get("result_urls") or []
        if isinstance(urls, list):
            return [str(u).strip() for u in urls if str(u).strip()]
        return []

    @staticmethod
    def _veo_result_urls(info: dict[str, Any]) -> list[str]:
        """从 Veo record-info 解析视频 URL。"""
        response = info.get("response")
        if isinstance(response, dict):
            urls = response.get("resultUrls") or []
            if isinstance(urls, list) and urls:
                return [str(u).strip() for u in urls if str(u).strip()]
        raw = info.get("resultUrls")
        if isinstance(raw, str) and raw.strip():
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(u).strip() for u in parsed if str(u).strip()]
            except json.JSONDecodeError:
                return [raw.strip()]
        if isinstance(raw, list):
            return [str(u).strip() for u in raw if str(u).strip()]
        return []

    async def gen_image(
        self,
        prompt: str,
        *,
        spec: MediaModelSpec,
        project_id: int | None = None,
        shot_no: int | None = None,
        aspect_ratio: str | None = None,
        size: str | None = None,
        ref_urls: list[str] | None = None,
    ) -> ImageResult:
        """文生图，下载到项目目录。"""
        ratio = (aspect_ratio or "16:9").strip() or "16:9"
        input_payload: dict[str, Any] = {"prompt": (prompt or "")[:5000]}
        upstream = spec.upstream_model
        if upstream == "seedream/5-pro-text-to-image":
            input_payload["aspect_ratio"] = (
                ratio
                if ratio in {"1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"}
                else "16:9"
            )
            input_payload["quality"] = (
                "high" if (size or "").lower() in {"2k", "3k", "4k", "high"} else "basic"
            )
            input_payload["output_format"] = "png"
        elif upstream in {"google/nano-banana", "nano-banana-2"}:
            input_payload["aspect_ratio"] = ratio if ratio != "auto" else "auto"
            if ref_urls and upstream == "nano-banana-2":
                input_payload["image_input"] = list(ref_urls)[:8]

        logger.info("Kie image create model=%s shot=%s", upstream, shot_no)
        try:
            task_id = await self.create_job(upstream, input_payload)
            info = await self.wait_job_success(task_id)
        except Exception as exc:  # noqa: BLE001
            from app.services.exc_format import format_exception_message

            raise RuntimeError(
                format_exception_message(exc, fallback="Kie 生图失败", limit=500)
            ) from exc
        urls = self._job_result_urls(info)
        if not urls:
            raise RuntimeError(f"Kie image missing resultUrls: {json.dumps(info)[:400]}")
        remote = urls[0]
        dest_dir = storage.project_dir(project_id or 0)
        # 唯一文件名：同 prompt 重新生成也能换 URL，便于前端实时替换
        name = (
            f"shot_{(shot_no or 0):03d}_"
            f"{hashlib.md5((prompt or '').encode()).hexdigest()[:8]}_"
            f"{int(time.time() * 1000) % 10_000_000:07d}.png"
        )
        dest = dest_dir / name
        await storage.download_to(remote, dest)
        credits = info.get("creditsConsumed")
        raw_usage, cost_fen = self._billing_from_credits(task_id, credits)
        return ImageResult(
            local_url=storage.publish_local(dest, sync=True),
            remote_url=remote,
            total_tokens=0,
            upstream_cost_fen=cost_fen,
            raw_usage=raw_usage,
        )

    async def create_video_task(
        self,
        image_url: str,
        prompt: str,
        duration: int,
        *,
        spec: MediaModelSpec,
        resolution: str = "480p",
        ratio: str | None = None,
        generate_audio: bool = False,
        reference_image_urls: list[str] | None = None,
        reference_audio_urls: list[str] | None = None,
    ) -> str:
        """仅创建图生视频 / 多参考视频任务，返回 taskId（供 NIO 轮询）。"""
        from app.services.ark import get_ark

        aspect = (ratio or "16:9").strip() or "16:9"
        res = (resolution or "480p").strip() or "480p"
        ref_images = [u.strip() for u in (reference_image_urls or []) if str(u).strip()]
        ref_audios = [u.strip() for u in (reference_audio_urls or []) if str(u).strip()]

        if spec.api_kind == "veo":
            image_ref = await get_ark()._resolve_image_ref(image_url, prefer_https=True) if image_url else None
            return await self.create_veo(
                model=spec.upstream_model,
                prompt=prompt,
                image_urls=[image_ref] if image_ref else None,
                aspect_ratio=aspect if aspect in {"16:9", "9:16", "1:1"} else "16:9",
            )

        input_payload: dict[str, Any] = {
            "prompt": (prompt or "")[:8000],
            "duration": int(max(4, min(int(duration or 8), 30))),
            "resolution": res if res in {"480p", "720p", "1080p"} else "720p",
            "generate_audio": bool(generate_audio),
            "return_last_frame": True,
        }

        if ref_images:
            # 多参考模式：不可与 first_frame 混用；可用固定画幅
            input_payload["reference_image_urls"] = ref_images[:30]
            if ref_audios:
                input_payload["reference_audio_urls"] = ref_audios[:10]
            input_payload["aspect_ratio"] = (
                aspect
                if aspect in {"1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"}
                else "16:9"
            )
        else:
            # 纯首帧模式：只允许 adaptive
            image_ref = await get_ark()._resolve_image_ref(image_url, prefer_https=True)
            input_payload["first_frame_url"] = image_ref
            input_payload["aspect_ratio"] = "adaptive"

        logger.info(
            "Kie video create model=%s duration=%s aspect_ratio=%s refs=%s audios=%s first_frame=%s",
            spec.upstream_model,
            input_payload["duration"],
            input_payload["aspect_ratio"],
            len(ref_images),
            len(ref_audios),
            bool(input_payload.get("first_frame_url")),
        )
        return await self.create_job(spec.upstream_model, input_payload)

    async def fetch_video_once(self, task_id: str, *, api_kind: str = "jobs") -> TaskResult:
        """单次查询视频任务状态（不下载）。

        瞬时查询故障返回 running（由轮询方写退避，总超时兜底）；
        终态 4xx（鉴权/任务不存在）返回 failed；
        上游报成功但结果 URL 尚未落地时继续 running，避免下载方必炸空转。
        """
        try:
            if api_kind == "veo":
                info = await self.get_veo(task_id)
            else:
                info = await self.get_job(task_id)
        except KiePollTransientError as exc:
            logger.warning("Kie fetch transient task=%s: %s", task_id, exc)
            return TaskResult(status="running", provider_task_id=task_id)
        except RuntimeError as exc:
            return TaskResult(status="failed", error=str(exc), provider_task_id=task_id)

        if api_kind == "veo":
            flag = info.get("successFlag")
            if flag in (1, "1", True):
                urls = self._veo_result_urls(info)
                if not urls:
                    logger.warning("Kie veo success without resultUrls task=%s; keep polling", task_id)
                    return TaskResult(status="running", provider_task_id=task_id)
                raw_usage, cost_fen = self._billing_from_credits(task_id, info.get("creditsConsumed"))
                return TaskResult(
                    status="succeeded",
                    url=urls[0],
                    provider_task_id=task_id,
                    raw_usage=raw_usage,
                    upstream_cost_fen=cost_fen,
                )
            if flag in (2, 3, "2", "3"):
                return TaskResult(
                    status="failed",
                    error=str(info.get("errorMessage") or info.get("errorCode") or flag),
                    provider_task_id=task_id,
                )
            return TaskResult(status="running", provider_task_id=task_id)

        state = str(info.get("state") or "").lower()
        if state == "success":
            urls = self._job_result_urls(info)
            if not urls:
                logger.warning("Kie task success without resultUrls task=%s; keep polling", task_id)
                return TaskResult(status="running", provider_task_id=task_id)
            raw_usage, cost_fen = self._billing_from_credits(task_id, info.get("creditsConsumed"))
            return TaskResult(
                status="succeeded",
                url=urls[0],
                provider_task_id=task_id,
                raw_usage=raw_usage,
                upstream_cost_fen=cost_fen,
            )
        if state == "fail":
            return TaskResult(
                status="failed",
                error=str(info.get("failMsg") or info.get("failCode") or state),
                provider_task_id=task_id,
            )
        return TaskResult(status="running", provider_task_id=task_id)

    async def gen_and_wait_video(
        self,
        image_url: str,
        prompt: str,
        duration: int,
        *,
        spec: MediaModelSpec,
        project_id: int,
        shot_no: int,
        resolution: str = "480p",
        ratio: str | None = None,
        generate_audio: bool = False,
        reference_image_urls: list[str] | None = None,
        reference_audio_urls: list[str] | None = None,
    ) -> tuple[str, TaskResult]:
        """图生视频 / 多参考视频并落盘。"""
        task_id = await self.create_video_task(
            image_url,
            prompt,
            duration,
            spec=spec,
            resolution=resolution,
            ratio=ratio,
            generate_audio=generate_audio,
            reference_image_urls=reference_image_urls,
            reference_audio_urls=reference_audio_urls,
        )
        if spec.api_kind == "veo":
            info = await self.wait_veo_success(task_id)
            urls = self._veo_result_urls(info)
        else:
            info = await self.wait_job_success(task_id)
            urls = self._job_result_urls(info)

        if not urls:
            raise RuntimeError(f"Kie video missing resultUrls: {json.dumps(info)[:400]}")
        remote = urls[0]
        dest_dir = storage.project_dir(project_id)
        dest = dest_dir / f"shot_{shot_no:03d}_{task_id[-8:]}.mp4"
        await storage.download_to(remote, dest)
        local = storage.publish_local(dest)
        credits = info.get("creditsConsumed")
        raw_usage, cost_fen = self._billing_from_credits(task_id, credits)
        return local, TaskResult(
            status="succeeded",
            url=local,
            provider_task_id=task_id,
            raw_usage=raw_usage,
            upstream_cost_fen=cost_fen,
        )


def get_kie() -> KieClient:
    """无状态工厂。"""
    return KieClient()
