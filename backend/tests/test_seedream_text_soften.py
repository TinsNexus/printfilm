"""seedream_text_soften 单元测试。"""
from __future__ import annotations

from app.services.seedream_text_soften import soften_seedream_input_text


def test_soften_xiaoxuesheng_and_child_terms() -> None:
    raw = "毛毡教室，小学生穿着校服，标签：传承+童声+童真"
    out = soften_seedream_input_text(raw)
    assert "小学生" not in out
    assert "童声" not in out
    assert "童真" not in out
    assert "少年学子" in out
    assert "校服" in out


def test_soften_libai_alcohol_and_celeb_slang() -> None:
    raw = "盛唐顶流，白衣佩剑，腰悬酒葫芦，身份：诗仙"
    out = soften_seedream_input_text(raw)
    assert "酒葫芦" not in out
    assert "顶流" not in out
    assert "葫芦形" in out or "葫芦" in out
    assert "佩剑" in out
    assert "诗仙" in out


def test_soften_noop_when_clean() -> None:
    raw = "白衣诗人，月白大袖，羊毛毡手作风格"
    assert soften_seedream_input_text(raw) == raw
