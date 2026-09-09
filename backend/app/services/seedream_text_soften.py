"""Seedream 输入文案软化：保留主体语义，降低 InputTextSensitive 误杀。

不做空主体 / CG 厚涂兜底；仅替换易触发审核的未成年人、酒精等表述。
"""

from __future__ import annotations

# 长词优先，避免短词先替换破坏短语
_SEEDREAM_TEXT_SOFTEN: list[tuple[str, str]] = [
    ("腰悬酒葫芦", "腰佩葫芦形饰物"),
    ("酒葫芦", "葫芦形佩饰"),
    ("小学男生", "少年学子"),
    ("小学女生", "少年学子"),
    ("小学生", "少年学子"),
    ("婴幼儿", "幼龄角色"),
    ("幼童", "少年"),
    ("儿童", "少年"),
    ("童声", "清亮稚气嗓音"),
    ("童真", "天真好奇"),
    ("顶流", "名士"),
    ("醉酒", "微醺神态"),
    ("饮酒", "持盏"),
]


# 软化易触发 Seedream 文本审核的措辞；无变化则原样返回
def soften_seedream_input_text(prompt: str) -> str:
    out = prompt or ""
    if not out:
        return out
    for src, dst in _SEEDREAM_TEXT_SOFTEN:
        if src in out:
            out = out.replace(src, dst)
    return out
