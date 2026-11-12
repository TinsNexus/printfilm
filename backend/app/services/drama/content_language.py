"""漫剧生成语言：剧本、摘要、分镜台词、资产名称与描述用哪种语言写。

项目级配置存在 `project.params.contentLanguage`（zh / en / vi，缺省 zh）。
任务执行时用 `content_language_scope()` 设进上下文，`drama_chat_json/text`
会自动在系统提示词末尾追加语言要求；zh 不追加，保持原有提示词不变。
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator

DEFAULT_CONTENT_LANGUAGE = "zh"
CONTENT_LANGUAGES: dict[str, str] = {
    "zh": "简体中文",
    "en": "English",
    "vi": "Tiếng Việt",
}

_current: ContextVar[str] = ContextVar("drama_content_language", default=DEFAULT_CONTENT_LANGUAGE)


def normalize_content_language(raw: Any) -> str:
    """非法或缺省值一律回落 zh。"""
    value = str(raw or "").strip().lower().replace("_", "-")
    if value.startswith("zh"):
        return "zh"
    if value.startswith("en"):
        return "en"
    if value.startswith("vi"):
        return "vi"
    return DEFAULT_CONTENT_LANGUAGE


def project_content_language(project: Any) -> str:
    """从项目 params 读生成语言。"""
    params = getattr(project, "params", None)
    params = params if isinstance(params, dict) else {}
    return normalize_content_language(params.get("contentLanguage") or params.get("content_language"))


def current_content_language() -> str:
    """当前任务上下文的生成语言。"""
    return _current.get()


@contextmanager
def content_language_scope(language: str | None) -> Iterator[str]:
    """在 with 块内把生成语言设为 language，退出时恢复。"""
    token = _current.set(normalize_content_language(language))
    try:
        yield _current.get()
    finally:
        _current.reset(token)


def language_directive(language: str | None = None) -> str:
    """追加到系统提示词末尾的语言要求；zh 返回空串。

    剧本格式标记（### 场、出场人物：、△、【空镜：】、vo/os、全角冒号括号）
    由下游解析器识别，必须原样保留，只把内容换成目标语言。
    """
    lang = normalize_content_language(language if language is not None else current_content_language())
    if lang == DEFAULT_CONTENT_LANGUAGE:
        return ""
    name = CONTENT_LANGUAGES[lang]
    return f"""

【输出语言（最高优先级，覆盖上文所有「使用简体中文」「汉字」之类的语言要求）】
- 所有面向观众或用户的文字必须使用 {name}（{lang}）：剧名、集名、摘要、梗概、剧本正文、动作描写、台词、旁白、角色/场景/道具名称与介绍、人物小传等
- 篇幅要求中的「字 / 汉字」按 {name} 的同等信息量理解，不要因换语言而写得更短
- 下列剧本格式标记供程序解析，必须原样保留、不要翻译：「### 场1-2」场号、「出场人物：」、行首「△」、「【空镜：…】」、台词格式「角色名（情绪/vo/os）：台词」中的全角括号与全角冒号、vo / os 标记、场头的 日/夜/晨/昏 与 内/外
- 场头里的地点、括号里的情绪、冒号后的台词都用 {name}
- 给图像/视频模型的画面提示词（visualPrompt、prompt、画面描述等字段）一律用英文书写
- JSON 字段名保持不变，只改字段值的语言"""
