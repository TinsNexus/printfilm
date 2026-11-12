"""漫剧生成语言：项目配置解析、上下文作用域与提示词追加。"""

from types import SimpleNamespace

import pytest

from app.services.drama import llm as drama_llm
from app.services.drama.content_language import (
    content_language_scope,
    current_content_language,
    language_directive,
    normalize_content_language,
    project_content_language,
)


def test_normalize_falls_back_to_zh():
    assert normalize_content_language("vi-VN") == "vi"
    assert normalize_content_language("EN") == "en"
    assert normalize_content_language("zh_CN") == "zh"
    assert normalize_content_language("fr") == "zh"
    assert normalize_content_language(None) == "zh"


def test_project_language_reads_params():
    assert project_content_language(SimpleNamespace(params={"contentLanguage": "vi"})) == "vi"
    assert project_content_language(SimpleNamespace(params=None)) == "zh"


def test_scope_sets_and_restores():
    assert current_content_language() == "zh"
    with content_language_scope("en"):
        assert current_content_language() == "en"
        with content_language_scope("vi"):
            assert current_content_language() == "vi"
        assert current_content_language() == "en"
    assert current_content_language() == "zh"


def test_directive_empty_for_zh_and_keeps_markers():
    assert language_directive("zh") == ""
    text = language_directive("vi")
    assert "Tiếng Việt" in text
    for marker in ("### 场", "出场人物：", "△", "【空镜"):
        assert marker in text


@pytest.mark.asyncio
async def test_drama_chat_appends_directive(monkeypatch):
    seen: list[str] = []

    async def fake_chat(system, user, **kwargs):
        seen.append(system)
        return '{"ok": true}'

    monkeypatch.setattr(drama_llm, "chat_completions", fake_chat)
    await drama_llm.drama_chat_json("系统提示 json", "用户")
    with content_language_scope("en"):
        await drama_llm.drama_chat_json("系统提示 json", "用户")
        await drama_llm.drama_chat_text("系统提示", "用户")
    assert "English" not in seen[0]
    assert "English" in seen[1] and "English" in seen[2]
