"""9Router package: Open-source local/self-hosted AI routing proxy integration.

Provides complete abstraction for 9Router:
- Client: Async HTTP client for /v1 endpoints
- Image: OpenAI-standard /v1/images/generations
- Video: Asynchronous video job submission and polling
- Audio: Native /v1/audio/speech synthesis
- Catalog: Model listing and capability detection
- Adapter: Seamless bridge to Printfilm's SystemModelChannel and runtime overlays
"""

from __future__ import annotations

from app.services.nine_router.adapter import (
    apply_9router_flat_overlay,
    create_9router_channel,
    is_9router_channel,
)
from app.services.nine_router.audio import (
    DEFAULT_9ROUTER_TTS_MODEL,
    resolve_9router_tts_model,
    synthesize_speech_via_9router,
)
from app.services.nine_router.catalog import (
    infer_9router_capability,
    list_9router_catalog_models,
)
from app.services.nine_router.client import (
    NineRouterClient,
    NineRouterClientError,
)
from app.services.nine_router.config import (
    GATEWAY_TYPE_9ROUTER,
    GATEWAY_TYPE_TOKENFREE,
    NINEROUTER_CHANNEL_ID,
    NINEROUTER_CHANNEL_NAME,
    NINEROUTER_DEFAULT_BASE_URL,
    NINEROUTER_DEFAULT_CONSOLE_URL,
    get_upstream_gateway_type,
    is_9router_active,
    resolve_9router_api_key,
    resolve_9router_base_url,
    site_origin_9router,
)
from app.services.nine_router.image import (
    build_9router_image_request,
    generate_image_via_9router,
    normalize_image_size,
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
from app.services.nine_router.usage import (
    estimate_image_cost_fen,
    estimate_video_cost_fen,
    extract_usage_from_response,
    tokens_to_cost_fen,
)
from app.services.nine_router.video import (
    build_9router_video_payload,
    poll_video_task_from_9router,
    submit_video_task_to_9router,
)

__all__ = [
    "DEFAULT_9ROUTER_TTS_MODEL",
    "GATEWAY_TYPE_9ROUTER",
    "GATEWAY_TYPE_TOKENFREE",
    "NINEROUTER_CHANNEL_ID",
    "NINEROUTER_CHANNEL_NAME",
    "NINEROUTER_DEFAULT_BASE_URL",
    "NINEROUTER_DEFAULT_CONSOLE_URL",
    "NineRouterAudioSpeechRequest",
    "NineRouterClient",
    "NineRouterClientError",
    "NineRouterHealthStatus",
    "NineRouterImageGenerationRequest",
    "NineRouterImageResponse",
    "NineRouterModelItem",
    "NineRouterVideoTaskRequest",
    "NineRouterVideoTaskResponse",
    "apply_9router_flat_overlay",
    "build_9router_image_request",
    "build_9router_video_payload",
    "create_9router_channel",
    "estimate_image_cost_fen",
    "estimate_video_cost_fen",
    "extract_usage_from_response",
    "generate_image_via_9router",
    "get_upstream_gateway_type",
    "infer_9router_capability",
    "is_9router_active",
    "is_9router_channel",
    "list_9router_catalog_models",
    "normalize_image_size",
    "poll_video_task_from_9router",
    "resolve_9router_api_key",
    "resolve_9router_base_url",
    "site_origin_9router",
    "submit_video_task_to_9router",
    "synthesize_speech_via_9router",
    "tokens_to_cost_fen",
]
