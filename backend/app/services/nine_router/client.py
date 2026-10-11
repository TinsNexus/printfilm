"""Asynchronous HTTP Client for communication with 9Router."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.nine_router.config import (
    resolve_9router_api_key,
    resolve_9router_base_url,
    site_origin_9router,
)
from app.services.nine_router.models import (
    NineRouterAudioSpeechRequest,
    NineRouterHealthStatus,
    NineRouterImageGenerationRequest,
    NineRouterImageResponse,
    NineRouterModelItem,
    NineRouterVideoTaskRequest,
    NineRouterVideoTaskResponse,
)

logger = logging.getLogger(__name__)


class NineRouterClientError(RuntimeError):
    """Base error for 9Router API failures."""


class NineRouterClient:
    """Async HTTP Client dedicated to 9Router OpenAI-compatible endpoints."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.base_url = (base_url or resolve_9router_base_url()).rstrip("/")
        self.api_key = api_key or resolve_9router_api_key()
        self.timeout = timeout

    @property
    def headers(self) -> dict[str, str]:
        h: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    async def check_health(self) -> NineRouterHealthStatus:
        """Ping 9Router gateway health endpoint or /models to verify connectivity."""
        url = f"{self.base_url}/models"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url, headers=self.headers)
                if resp.status_code == 200:
                    data = resp.json()
                    models_count = len(data.get("data", [])) if isinstance(data, dict) else 0
                    return NineRouterHealthStatus(
                        ok=True,
                        base_url=self.base_url,
                        providers_count=models_count,
                    )
                return NineRouterHealthStatus(
                    ok=False,
                    base_url=self.base_url,
                    error=f"HTTP {resp.status_code}: {resp.text[:200]}",
                )
        except Exception as exc:  # noqa: BLE001
            return NineRouterHealthStatus(
                ok=False,
                base_url=self.base_url,
                error=f"Connection failed: {str(exc)}",
            )

    async def list_models(self) -> list[NineRouterModelItem]:
        """Fetch list of all models exposed by 9Router (/v1/models)."""
        url = f"{self.base_url}/models"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self.headers)
            if resp.status_code >= 400:
                raise NineRouterClientError(
                    f"Failed to fetch models from 9Router: HTTP {resp.status_code} - {resp.text[:300]}"
                )
            payload = resp.json()
            items: list[NineRouterModelItem] = []
            for item in payload.get("data", []):
                if isinstance(item, dict) and item.get("id"):
                    items.append(
                        NineRouterModelItem(
                            id=item["id"],
                            object=item.get("object", "model"),
                            created=item.get("created", 0),
                            owned_by=item.get("owned_by", ""),
                            display_name=item.get("display_name") or item.get("id"),
                        )
                    )
            return items

    async def chat_completion(
        self,
        messages: list[dict[str, Any]],
        model: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        extra_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Send chat completion to 9Router (/v1/chat/completions)."""
        url = f"{self.base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        if extra_body:
            payload.update(extra_body)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload, headers=self.headers)
            if resp.status_code >= 400:
                raise NineRouterClientError(
                    f"9Router Chat completion failed HTTP {resp.status_code}: {resp.text[:300]}"
                )
            return resp.json()

    async def generate_images(
        self,
        req: NineRouterImageGenerationRequest,
    ) -> NineRouterImageResponse:
        """Call standard OpenAI Image API (/v1/images/generations) via 9Router."""
        url = f"{self.base_url}/images/generations"
        payload = req.model_dump(exclude_none=True, exclude={"extra_params"})
        if req.extra_params:
            payload.update(req.extra_params)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload, headers=self.headers)
            if resp.status_code >= 400:
                raise NineRouterClientError(
                    f"9Router Image generation failed HTTP {resp.status_code}: {resp.text[:300]}"
                )
            data = resp.json()
            return NineRouterImageResponse.model_validate(data)

    async def generate_speech(
        self,
        req: NineRouterAudioSpeechRequest,
    ) -> bytes:
        """Call standard OpenAI TTS endpoint (/v1/audio/speech) via 9Router."""
        url = f"{self.base_url}/audio/speech"
        headers = dict(self.headers)
        headers["Accept"] = f"audio/{req.response_format}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=req.model_dump(), headers=headers)
            if resp.status_code >= 400:
                raise NineRouterClientError(
                    f"9Router TTS generation failed HTTP {resp.status_code}: {resp.text[:300]}"
                )
            return resp.content
