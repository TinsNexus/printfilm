"""Unit tests for the 9Router package and updated gateway integration."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from app.config import Settings
from app.schemas_routing import SystemModelChannel
from app.services.nine_router import (
    DEFAULT_9ROUTER_TTS_MODEL,
    GATEWAY_TYPE_9ROUTER,
    GATEWAY_TYPE_TOKENFREE,
    NINEROUTER_CHANNEL_ID,
    NINEROUTER_CHANNEL_NAME,
    NINEROUTER_DEFAULT_BASE_URL,
    NineRouterClient,
    build_9router_image_request,
    build_9router_video_payload,
    create_9router_channel,
    estimate_image_cost_fen,
    estimate_video_cost_fen,
    extract_usage_from_response,
    get_upstream_gateway_type,
    infer_9router_capability,
    is_9router_active,
    is_9router_channel,
    normalize_image_size,
    resolve_9router_api_key,
    resolve_9router_base_url,
    resolve_9router_tts_model,
    tokens_to_cost_fen,
)
from app.services.tokenfree_gateway import (
    PRIMARY_GATEWAY_CHANNEL_IDS,
    TOKENFREE_BASE_URL,
    TOKENFREE_CHANNEL_ID,
    TOKENFREE_CHANNEL_NAME,
    apply_tokenfree_flat_overlay,
    get_active_base_url,
    get_active_channel_id,
    get_active_channel_name,
    get_active_gateway_type,
    is_gateway_channel,
    locked_tokenfree_channel,
    pick_migratable_api_key,
    resolve_tokenfree_api_key,
    tokenfree_site_origin,
)


class TestNineRouterPackage(unittest.TestCase):
    def test_gateway_type_resolution(self):
        s_default = Settings()
        self.assertEqual(get_upstream_gateway_type(s_default), GATEWAY_TYPE_TOKENFREE)
        self.assertFalse(is_9router_active(s_default))

        s_9router = Settings(upstream_gateway_type="9router")
        self.assertEqual(get_upstream_gateway_type(s_9router), GATEWAY_TYPE_9ROUTER)
        self.assertTrue(is_9router_active(s_9router))

    def test_base_url_resolution(self):
        s_default = Settings()
        self.assertEqual(resolve_9router_base_url(s_default), NINEROUTER_DEFAULT_BASE_URL)

        s_custom = Settings(ninerouter_base_url="https://api.my-9router.org")
        self.assertEqual(resolve_9router_base_url(s_custom), "https://api.my-9router.org/v1")

    def test_channel_creation_and_check(self):
        ch = create_9router_channel(
            api_key="sk-test-9router",
            base_url="http://localhost:20128/v1",
            models=["gpt-4o", "dall-e-3"],
        )
        self.assertEqual(ch.id, NINEROUTER_CHANNEL_ID)
        self.assertEqual(ch.name, NINEROUTER_CHANNEL_NAME)
        self.assertEqual(ch.api_key, "sk-test-9router")
        self.assertTrue(ch.has_api_key)
        self.assertEqual(ch.protocol, "openai")
        self.assertIn("gpt-4o", ch.models)

        self.assertTrue(is_9router_channel(NINEROUTER_CHANNEL_ID))
        self.assertTrue(is_9router_channel("custom", base_url="http://localhost:20128/v1"))
        self.assertFalse(is_9router_channel("other", base_url="https://other.com/v1"))

    def test_image_request_builder(self):
        req = build_9router_image_request(
            model="dall-e-3",
            prompt="A cyberpunk city street",
            size="2k",
            ref_urls=["https://img.example/ref1.png"],
            style_ref_urls=["https://img.example/style1.png"],
        )
        self.assertEqual(req.model, "dall-e-3")
        self.assertEqual(req.size, "1792x1024")
        self.assertIn("Style reference", req.prompt)
        self.assertIn("Composition reference", req.prompt)
        self.assertEqual(req.extra_params.get("reference_images"), ["https://img.example/ref1.png"])

    def test_normalize_image_size(self):
        self.assertEqual(normalize_image_size("2k"), "1792x1024")
        self.assertEqual(normalize_image_size("16:9"), "1792x1024")
        self.assertEqual(normalize_image_size("9:16"), "1024x1792")
        self.assertEqual(normalize_image_size("1024x1024"), "1024x1024")
        self.assertEqual(normalize_image_size(""), "1024x1024")

    def test_audio_tts_model_resolution(self):
        self.assertEqual(resolve_9router_tts_model(None), DEFAULT_9ROUTER_TTS_MODEL)
        self.assertEqual(resolve_9router_tts_model("qwen-tts-2025"), DEFAULT_9ROUTER_TTS_MODEL)
        self.assertEqual(resolve_9router_tts_model("elevenlabs-multilingual"), "elevenlabs-multilingual")

    def test_video_payload_builder(self):
        payload = build_9router_video_payload(
            model="seedance-2.5",
            prompt="Camera pans left over mountains",
            duration=6.0,
            aspect_ratio="16:9",
            image_url="https://img.example/first_frame.png",
        )
        self.assertEqual(payload["model"], "seedance-2.5")
        self.assertEqual(payload["duration"], 6.0)
        self.assertEqual(payload["first_frame_url"], "https://img.example/first_frame.png")

    def test_usage_cost_conversion(self):
        cost_fen = tokens_to_cost_fen(prompt_tokens=100_000, completion_tokens=200_000)
        self.assertGreater(cost_fen, 0)

        usage = extract_usage_from_response(
            {"usage": {"prompt_tokens": 150, "completion_tokens": 350, "total_tokens": 500}}
        )
        self.assertEqual(usage["prompt_tokens"], 150)
        self.assertEqual(usage["completion_tokens"], 350)
        self.assertEqual(usage["total_tokens"], 500)

        img_fen = estimate_image_cost_fen("dall-e-3")
        self.assertGreater(img_fen, 0)

        vid_fen = estimate_video_cost_fen("sora", duration_sec=5.0)
        self.assertGreater(vid_fen, 0)

    def test_capability_inference(self):
        self.assertEqual(infer_9router_capability("dall-e-3"), "image")
        self.assertEqual(infer_9router_capability("sora-2"), "video")
        self.assertEqual(infer_9router_capability("tts-1-hd"), "audio")
        self.assertEqual(infer_9router_capability("gpt-4o"), "text")


class TestGatewayIntegration(unittest.TestCase):
    def test_tokenfree_mode_gateway(self):
        with patch("app.services.tokenfree_gateway.is_9router_active", return_value=False):
            self.assertEqual(get_active_gateway_type(), GATEWAY_TYPE_TOKENFREE)
            self.assertEqual(get_active_channel_id(), TOKENFREE_CHANNEL_ID)
            self.assertEqual(get_active_channel_name(), TOKENFREE_CHANNEL_NAME)
            self.assertEqual(get_active_base_url(), TOKENFREE_BASE_URL)

            ch = locked_tokenfree_channel(api_key="sk-tokenfree-key", models=["kimi-k2.6"])
            self.assertEqual(ch.id, TOKENFREE_CHANNEL_ID)
            self.assertEqual(ch.name, TOKENFREE_CHANNEL_NAME)
            self.assertEqual(ch.base_url, TOKENFREE_BASE_URL)
            self.assertEqual(ch.protocol, "auto")

    def test_9router_mode_gateway(self):
        with patch("app.services.tokenfree_gateway.is_9router_active", return_value=True):
            self.assertEqual(get_active_gateway_type(), GATEWAY_TYPE_9ROUTER)
            self.assertEqual(get_active_channel_id(), NINEROUTER_CHANNEL_ID)
            self.assertEqual(get_active_channel_name(), NINEROUTER_CHANNEL_NAME)
            self.assertEqual(get_active_base_url(), NINEROUTER_DEFAULT_BASE_URL)

            ch = locked_tokenfree_channel(api_key="sk-9router-key", models=["gpt-4o"])
            self.assertEqual(ch.name, NINEROUTER_CHANNEL_NAME)
            self.assertEqual(ch.base_url, NINEROUTER_DEFAULT_BASE_URL)
            self.assertEqual(ch.protocol, "openai")

    def test_is_gateway_channel_recognition(self):
        self.assertTrue(is_gateway_channel(TOKENFREE_CHANNEL_ID))
        self.assertTrue(is_gateway_channel(NINEROUTER_CHANNEL_ID))
        self.assertTrue(is_gateway_channel("custom", base_url="https://www.tokenfree.com/v1"))
        self.assertTrue(is_gateway_channel("custom", base_url="http://localhost:20128/v1"))
        self.assertFalse(is_gateway_channel("volc_channel", base_url="https://ark.cn-beijing.volces.com/api/v3"))

    def test_apply_flat_overlay_9router_ignores_channel_key(self):
        """9Router 模式（按 flat 判断）：用 NINEROUTER_* 的地址与 Key，不使用 channel 里存的 TokenFree Key。"""
        channels = [SystemModelChannel(id=TOKENFREE_CHANNEL_ID, name="x", base_url="https://www.tokenfree.com/v1", api_key="sk-tokenfree")]
        flat = {"upstream_gateway_type": "9router", "ninerouter_base_url": "http://localhost:20128", "ninerouter_api_key": "sk-9router-test"}
        overlay = apply_tokenfree_flat_overlay(flat, channels)
        self.assertEqual(overlay["openai_base_url"], NINEROUTER_DEFAULT_BASE_URL)
        self.assertEqual(overlay["ark_base_url"], NINEROUTER_DEFAULT_BASE_URL)
        self.assertEqual(overlay["openai_api_key"], "sk-9router-test")
        self.assertEqual(overlay["ark_api_key"], "sk-9router-test")

    def test_apply_gateway_to_channels_runtime_override(self):
        """开关开启时运行时渠道被替换为 9Router；关闭时原样返回。"""
        from app.services.tokenfree_gateway import apply_gateway_to_channels

        channels = [SystemModelChannel(id=TOKENFREE_CHANNEL_ID, name="TF", base_url=TOKENFREE_BASE_URL, api_key="sk-tf")]
        on = apply_gateway_to_channels(channels, {"upstream_gateway_type": "9router", "ninerouter_api_key": "sk-9r"})
        self.assertEqual(on[0].base_url, NINEROUTER_DEFAULT_BASE_URL)
        self.assertEqual(on[0].api_key, "sk-9r")
        self.assertEqual(channels[0].api_key, "sk-tf")
        off = apply_gateway_to_channels(channels, {"upstream_gateway_type": "tokenfree"})
        self.assertEqual(off[0].base_url, TOKENFREE_BASE_URL)

    def test_apply_flat_overlay_tokenfree(self):
        channels = [SystemModelChannel(id=TOKENFREE_CHANNEL_ID, name="x", base_url="https://www.tokenfree.com/v1", api_key="sk-tokenfree")]
        with patch("app.services.tokenfree_gateway.is_9router_active", return_value=False):
            overlay = apply_tokenfree_flat_overlay({}, channels)
        self.assertEqual(overlay["openai_base_url"], TOKENFREE_BASE_URL)
        self.assertEqual(overlay["openai_api_key"], "sk-tokenfree")

    def test_pick_migratable_key(self):
        ch1 = SystemModelChannel(id="unrelated", name="Unrelated", base_url="https://foo.com", api_key="sk-foo")
        ch2 = SystemModelChannel(id=NINEROUTER_CHANNEL_ID, name="9Router", base_url="http://localhost:20128/v1", api_key="sk-9router-key")
        self.assertEqual(pick_migratable_api_key([ch1, ch2]), "sk-9router-key")


if __name__ == "__main__":
    unittest.main()
