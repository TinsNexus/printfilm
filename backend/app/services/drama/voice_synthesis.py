"""漫剧音色资产：根据提示词合成参考音频（供 Seedance reference_audio 使用）。"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import User
from app.models_drama import DramaAsset, DramaProject
from app.services.ark import get_ark
from app.services.billing import record_usage

logger = logging.getLogger(__name__)

DEFAULT_SAMPLE_TEXT = "你好，我是这个角色。请仔细听我的音色与语气。"


# 根据音色描述推断 TTS speaker
def infer_speaker_from_voice_prompt(voice_prompt: str) -> str:
    prompt = voice_prompt or ""
    male_kw = ("男", "少年", "大叔", "青年男", "老年男", "公子", "王爷", "少年音")
    female_kw = ("女", "少女", "女声", "温柔", "御姐", "小姐", "娘娘", "萝莉")
    if any(k in prompt for k in male_kw):
        return "zh_male_shaonianzixin_uranus_bigtts"
    if any(k in prompt for k in female_kw):
        return "zh_female_vv_uranus_bigtts"
    return "zh_female_tianmeixiaoyuan_uranus_bigtts"


# 生成试听文案
def build_voice_sample_text(voice_prompt: str, character_name: str | None = None) -> str:
    name = (character_name or "我").strip() or "我"
    hint = (voice_prompt or "").strip()[:120]
    if hint:
        return f"{name}：{DEFAULT_SAMPLE_TEXT}（音色：{hint}）"
    return f"{name}：{DEFAULT_SAMPLE_TEXT}"


async def synthesize_voice_asset(
    db: AsyncSession,
    user: User,
    project: DramaProject,
    asset: DramaAsset,
    *,
    voice_prompt: str,
    sample_text: str | None = None,
    speaker: str | None = None,
) -> DramaAsset:
    """按提示词合成音色参考音频并写回 voice 资产。"""
    settings = get_settings()
    ark = get_ark()
    prompt = (voice_prompt or "").strip()
    if not prompt:
        raise ValueError("缺少音色描述 prompt")

    resolved_speaker = (speaker or "").strip() or infer_speaker_from_voice_prompt(prompt)
    text = (sample_text or "").strip() or build_voice_sample_text(prompt, asset.name)

    logger.info(
        "合成音色资产 project_id=%s asset_id=%s speaker=%s text_len=%s",
        project.id,
        asset.id,
        resolved_speaker,
        len(text),
    )
    audio_url = await ark.tts(
        text,
        resolved_speaker,
        project_id=project.id,
        shot_no=asset.id,
    )

    asset.url = audio_url
    asset.cover = asset.cover or audio_url
    params: dict[str, Any] = dict(asset.params or {})
    params["voicePrompt"] = prompt
    params["sampleText"] = text
    params["speaker"] = resolved_speaker
    gen = params.get("generation") if isinstance(params.get("generation"), dict) else {}
    params["generation"] = {**gen, "status": "done", "url": audio_url}
    asset.params = params

    await record_usage(
        db,
        user_id=user.id,
        project_id=None,
        drama_project_id=project.id,
        billing_key="tts",
        model=settings.model_audio,
        estimated=True,
    )
    await db.commit()
    await db.refresh(asset)
    return asset
