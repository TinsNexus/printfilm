"""seedream_text_soften 单元测试。"""
from __future__ import annotations

from app.services.seedream_text_soften import (
    compact_seedream_prompt_for_retry,
    soften_seedream_input_text,
    style_only_seedream_prompt_for_retry,
)


def test_soften_xiaoxuesheng_and_child_terms() -> None:
    raw = (
        "毛毡教室剪影，课桌后坐着齐刷刷毛毡小人，穿着现代校服，"
        "身份：现代课堂学生。标签：传承+童声+童真"
    )
    out = soften_seedream_input_text(raw)
    assert "小学生" not in out
    assert "童声" not in out
    assert "童真" not in out
    assert "校服" not in out
    assert "课堂" not in out
    assert "学生" not in out
    assert "毛毡小人" not in out
    assert "少年学子" in out or "学堂" in out


def test_soften_libai_removes_historical_identity() -> None:
    raw = (
        "盛唐顶流，白衣佩剑，腰悬酒葫芦，月白大袖，潇洒飘逸，羊毛毡手作风格，"
        "暖阳柔光，眼神狂放不羁，气质超凡脱俗。。身份：诗仙。"
        "细节精致，电影质感。"
    )
    out = soften_seedream_input_text(raw)
    for bad in ("酒葫芦", "顶流", "佩剑", "诗仙", "葫芦", "狂放不羁", "电影质感", "盛唐", "名士", "文人", "诗人"):
        assert bad not in out, bad
    assert "古风洒脱书生" in out or "书生" in out
    assert "白衣" in out


def test_compact_retry_strips_structure_prefix() -> None:
    full = (
        "【强制任务：角色设定板构图】很长前缀。"
        "请严格依据以下用户描述生成上述结构的角色设定图："
        "盛唐顶流，白衣佩剑，腰悬酒葫芦，身份：诗仙。电影质感。"
    )
    compact = compact_seedream_prompt_for_retry(full)
    assert "设定板构图" not in compact
    assert "三视图" not in compact
    assert "酒葫芦" not in compact
    assert "诗仙" not in compact
    assert "盛唐" not in compact
    assert "电影质感" not in compact
    assert "纯白背景" in compact


def test_style_only_keeps_felt_and_robe() -> None:
    raw = "盛唐顶流，白衣佩剑，腰悬酒葫芦，身份：诗仙。羊毛毡 / 毛毡定格，粘土软萌。"
    out = style_only_seedream_prompt_for_retry(raw)
    assert "诗仙" not in out
    assert "盛唐" not in out
    assert "酒" not in out
    assert "白衣" in out
    assert "羊毛毡" in out or "毛毡" in out
    assert "纯白背景" in out


def test_soften_noop_when_clean() -> None:
    raw = "白衣书生，月白大袖，羊毛毡手作风格"
    assert soften_seedream_input_text(raw) == raw
