"""漫剧资产生图提示词拼接（角色/场景前缀 + 内置风格）。

与 manju generationPrompt.ts 对齐：character/scene 加强制前缀。
ai_movie 扩展：prop/material 增加静物/空镜前缀（manju 无此前缀）。
"""

from __future__ import annotations

from app.services.drama.image_styles import resolve_image_style_prompt

# CHARACTER_PROMPT_PREFIX 角色白底全身照强制前缀
CHARACTER_PROMPT_PREFIX = (
    "【强制任务：生成白底人物角色全身照】本次必须生成纯白背景、以人物为主体的全身角色形象，"
    "人物从头到脚完整入镜，必须是画面绝对主角并占据主要视觉面积，"
    "背景保持干净简洁的纯白色且无多余元素。"
    "严禁生成半身照、特写、大头照、肖像、纯风景、空镜、道具特写、文字海报、抽象图案、"
    "复杂背景或无人物主体的画面。"
    "即使用户描述偏向场景、物品或动作片段，也必须转化为可辨识的白底全身人物角色来呈现，"
    "并据此补全外貌、体态、服饰与神态。请严格依据以下用户描述生成白底人物角色全身照："
)

# SCENE_PROMPT_PREFIX 场景画面强制前缀
SCENE_PROMPT_PREFIX = (
    "【强制任务：生成场景画面】本次必须生成以环境空间为主体的场景画面，"
    "建筑、地貌、室内外空间或氛围环境必须是画面绝对主角。"
    "严禁生成人物特写、角色立绘、肖像、以人物为视觉中心或人物占据画面主体的构图。"
    "即使用户描述涉及人物、角色或动作，也必须剥离人物主体，仅保留并扩展为可独立成立的环境场景。"
    "请严格依据以下用户描述生成场景画面："
)


# PROP_PROMPT_PREFIX 道具特写强制前缀
PROP_PROMPT_PREFIX = (
    "【强制任务：生成道具特写】本次必须生成以物件为主体的道具静物图，"
    "材质、形制、磨损与戏剧感清晰可辨，背景简洁。"
    "严禁生成人物立绘、半身肖像或以人物为视觉中心的构图。"
    "请严格依据以下用户描述生成道具画面："
)

# MATERIAL_PROMPT_PREFIX 气氛素材强制前缀
MATERIAL_PROMPT_PREFIX = (
    "【强制任务：生成气氛空镜素材】本次必须生成环境/气氛静帧，"
    "强调构图、光影与氛围，可作为短剧空镜参考。"
    "严禁生成可识别人脸特写或角色立绘。"
    "请严格依据以下用户描述生成素材画面："
)


# 将内置风格提示词追加到正文后
def append_style_prompt(prompt: str, style_id: str | None = None) -> str:
    style_prompt = resolve_image_style_prompt(style_id)
    if not style_prompt:
        return prompt
    return f"{prompt}。画面风格要求：{style_prompt}"


# 按资产类型与风格 ID 组装完整 Seedream 提示词
def build_generation_prompt(
    user_prompt: str,
    asset_type: str | None = None,
    style_id: str | None = None,
) -> str:
    trimmed = (user_prompt or "").strip()
    prompt = trimmed
    kind = (asset_type or "").strip().lower()
    if kind == "character":
        prompt = f"{CHARACTER_PROMPT_PREFIX}{trimmed}"
    elif kind == "scene":
        prompt = f"{SCENE_PROMPT_PREFIX}{trimmed}"
    elif kind == "prop":
        prompt = f"{PROP_PROMPT_PREFIX}{trimmed}"
    elif kind in {"material", "none"}:
        prompt = f"{MATERIAL_PROMPT_PREFIX}{trimmed}"
    return append_style_prompt(prompt, style_id)
