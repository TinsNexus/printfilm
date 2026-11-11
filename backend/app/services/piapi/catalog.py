"""PiAPI 可选模型目录：统一任务接口没有 /models，直接取站点预设里标了 piapi 的模型。"""

from __future__ import annotations


def list_piapi_catalog_models(capability: str = "all") -> list[dict[str, str]]:
    """按能力筛选 PiAPI 预设模型，返回与上游模型目录一致的 `{id, label, capability}`。"""
    from app.services.media_model_presets import PRESET_MODELS

    cap_filter = (capability or "all").strip().lower()
    return [
        {"id": row["id"], "label": row.get("label") or row["id"], "capability": cap}
        for cap, rows in PRESET_MODELS.items()
        if cap_filter in {"", "all"} or cap == cap_filter
        for row in rows
        if "piapi" in str(row.get("gateways") or "")
    ]
