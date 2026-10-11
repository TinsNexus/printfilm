"""Data schemas and Pydantic models for 9Router API requests and responses."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class NineRouterModelItem(BaseModel):
    """Model descriptor returned from 9Router GET /v1/models."""

    id: str
    object: str = "model"
    created: int = 0
    owned_by: str = ""
    display_name: str | None = None
    capability: str | None = None


class NineRouterModelListResponse(BaseModel):
    """List response from GET /v1/models."""

    object: str = "list"
    data: list[NineRouterModelItem] = Field(default_factory=list)


class NineRouterImageGenerationRequest(BaseModel):
    """Payload for POST /v1/images/generations."""

    prompt: str
    model: str = "dall-e-3"
    n: int = 1
    size: str = "1024x1024"
    quality: str = "standard"
    response_format: Literal["url", "b64_json"] = "url"
    style: str | None = None
    extra_params: dict[str, Any] = Field(default_factory=dict)


class NineRouterImageItem(BaseModel):
    url: str | None = None
    b64_json: str | None = None
    revised_prompt: str | None = None


class NineRouterImageResponse(BaseModel):
    created: int = 0
    data: list[NineRouterImageItem] = Field(default_factory=list)


class NineRouterAudioSpeechRequest(BaseModel):
    """Payload for POST /v1/audio/speech."""

    model: str = "tts-1"
    input: str
    voice: str = "alloy"
    response_format: Literal["mp3", "opus", "aac", "flac", "wav", "pcm"] = "mp3"
    speed: float = 1.0


class NineRouterVideoTaskRequest(BaseModel):
    """Payload for initiating a video generation task."""

    model: str
    prompt: str
    duration: float = 5.0
    aspect_ratio: str = "16:9"
    image_url: str | None = None
    reference_image_urls: list[str] = Field(default_factory=list)
    audio_url: str | None = None


class NineRouterVideoTaskResponse(BaseModel):
    """Response containing video job tracking ID."""

    task_id: str
    status: Literal["queued", "processing", "succeeded", "failed", "cancelled"] = "queued"
    video_url: str | None = None
    error: str | None = None
    progress: int = 0


class NineRouterHealthStatus(BaseModel):
    """Health status representation of 9Router."""

    ok: bool
    version: str | None = None
    base_url: str
    error: str | None = None
    providers_count: int | None = None
