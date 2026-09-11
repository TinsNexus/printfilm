# -*- coding: utf-8 -*-
"""科普媒体模型目录归一化。"""
from app.services.kie_catalog import (
    LEGACY_IMAGE_MODEL_ID,
    LEGACY_VIDEO_MODEL_ID,
    get_media_model,
    resolve_image_model_id,
    resolve_video_model_id,
)


def test_resolve_empty_falls_back_to_ark() -> None:
    assert resolve_image_model_id("") == LEGACY_IMAGE_MODEL_ID
    assert resolve_video_model_id(None) == LEGACY_VIDEO_MODEL_ID


def test_resolve_known_kie_ids() -> None:
    assert resolve_image_model_id("kie-nano-banana-2") == "kie-nano-banana-2"
    assert resolve_video_model_id("kie-veo3-fast") == "kie-veo3-fast"
    assert get_media_model("kie-seedance-2.5") is not None
    assert get_media_model("kie-seedance-2.5").provider == "kie"


def test_catalog_payload_uses_tokenfree_routing() -> None:
    from app.services.media_catalog import build_media_catalog
    from app.schemas_routing import DefaultModels, LogicalModel, SystemModelChannel

    payload = build_media_catalog(
        logical_models=[
            LogicalModel(id="seedream-5.0", name="Seedream 5.0", capability="image", enabled=True),
            LogicalModel(id="seedance-2.5", name="Seedance 2.5", capability="video", enabled=True),
        ],
        channels=[
            SystemModelChannel(
                id="tokenfree",
                name="TokenFree",
                base_url="https://www.tokenfree.com/v1",
                models=["doubao-seedance-2-5-260628"],
                enabled=True,
            )
        ],
        defaults=DefaultModels(image_model="seedream-5.0", video_model="seedance-2.5"),
    )
    assert payload["defaults"]["video_model"] == "seedance-2.5"
    assert any(m["id"] == "seedance-2.5" for m in payload["video_models"])
    assert all(m["provider"] == "tokenfree" for m in payload["video_models"])
    assert not any("kie" in m["id"] for m in payload["video_models"])
    assert not any("方舟" in m["label"] for m in payload["video_models"])


def test_kie_upstream_catalog_for_admin() -> None:
    from app.services.kie_catalog import kie_upstream_catalog
    from app.services.model_routing_config import infer_model_capability

    rows = kie_upstream_catalog()
    assert len(rows) >= 5
    assert all(r["id"].startswith("kie-") for r in rows)
    assert infer_model_capability("kie-veo3-fast") == "video"
    assert infer_model_capability("kie-seedream-5") == "image"
    assert infer_model_capability("nano-banana-2") == "image"
