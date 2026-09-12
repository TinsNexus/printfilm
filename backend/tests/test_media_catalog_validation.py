"""项目 image_model / video_model 校验与前台目录一致。"""

from app.services.media_catalog import is_valid_project_media_model


def test_kie_catalog_image_id_valid():
    assert is_valid_project_media_model("kie-seedream-5", "image") is True
    assert is_valid_project_media_model("ark-seedream", "image") is True


def test_empty_model_allowed():
    assert is_valid_project_media_model("", "image") is True
    assert is_valid_project_media_model("  ", "video") is True


def test_garbage_model_rejected():
    assert is_valid_project_media_model("not-a-real-model-xyz", "image") is False


def test_tokenfree_style_ids_infer_capability():
    from app.services.model_routing_config import infer_model_capability

    assert infer_model_capability("gpt-image-2-5") == "image"
    assert infer_model_capability("seedance-2-0-mini") == "video"
