"""Video generation and asynchronous task handling for 9Router."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.nine_router.client import NineRouterClient, NineRouterClientError
from app.services.nine_router.models import (
    NineRouterVideoTaskRequest,
    NineRouterVideoTaskResponse,
)

logger = logging.getLogger(__name__)

# Video task paths
NINEROUTER_VIDEO_TASK_PATH = "/videos"
NINEROUTER_VIDEO_GENERATIONS_PATH = "/videos/generations"


def build_9router_video_payload(
    *,
    model: str,
    prompt: str,
    duration: float = 5.0,
    aspect_ratio: str = "16:9",
    image_url: str | None = None,
    reference_image_urls: list[str] | None = None,
    audio_url: str | None = None,
) -> dict[str, Any]:
    """Format video task request for 9Router."""
    body: dict[str, Any] = {
        "model": model,
        "prompt": prompt.strip(),
        "duration": duration,
        "aspect_ratio": aspect_ratio,
    }
    if image_url:
        body["image_url"] = image_url
        body["first_frame_url"] = image_url
    if reference_image_urls:
        body["reference_image_urls"] = reference_image_urls
    if audio_url:
        body["audio_url"] = audio_url
    return body


async def submit_video_task_to_9router(
    client: NineRouterClient,
    payload: dict[str, Any],
) -> str:
    """Submit a video generation job and return the task ID."""
    url = f"{client.base_url}{NINEROUTER_VIDEO_TASK_PATH}"
    async with httpx.AsyncClient(timeout=client.timeout) as http_client:
        resp = await http_client.post(url, json=payload, headers=client.headers)
        if resp.status_code == 404:
            # Fallback to alternate video generations path
            alt_url = f"{client.base_url}{NINEROUTER_VIDEO_GENERATIONS_PATH}"
            resp = await http_client.post(alt_url, json=payload, headers=client.headers)
        if resp.status_code >= 400:
            raise NineRouterClientError(
                f"9Router video task submission failed HTTP {resp.status_code}: {resp.text[:300]}"
            )
        data = resp.json()
        task_id = data.get("id") or data.get("task_id") or data.get("request_id")
        if not task_id:
            raise NineRouterClientError(f"No task ID returned in 9Router response: {data}")
        return str(task_id)


async def poll_video_task_from_9router(
    client: NineRouterClient,
    task_id: str,
) -> NineRouterVideoTaskResponse:
    """Poll video task state from 9Router."""
    url = f"{client.base_url}{NINEROUTER_VIDEO_TASK_PATH}/{task_id}"
    async with httpx.AsyncClient(timeout=15.0) as http_client:
        resp = await http_client.get(url, headers=client.headers)
        if resp.status_code == 404:
            alt_url = f"{client.base_url}{NINEROUTER_VIDEO_GENERATIONS_PATH}/{task_id}"
            resp = await http_client.get(alt_url, headers=client.headers)
        if resp.status_code >= 400:
            return NineRouterVideoTaskResponse(
                task_id=task_id,
                status="failed",
                error=f"HTTP {resp.status_code}: {resp.text[:200]}",
            )
        data = resp.json()
        raw_status = str(data.get("status") or "").lower()
        if raw_status in {"succeeded", "success", "completed", "done"}:
            video_url = data.get("video_url") or data.get("url") or data.get("content_url")
            return NineRouterVideoTaskResponse(
                task_id=task_id,
                status="succeeded",
                video_url=video_url,
                progress=100,
            )
        if raw_status in {"failed", "error", "cancelled"}:
            return NineRouterVideoTaskResponse(
                task_id=task_id,
                status="failed",
                error=data.get("error") or data.get("message") or "Unknown error",
            )
        return NineRouterVideoTaskResponse(
            task_id=task_id,
            status="processing",
            progress=int(data.get("progress") or 50),
        )
