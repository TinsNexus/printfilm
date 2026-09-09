"""确认分集：正文校验与保护分镜不重切。"""

from types import SimpleNamespace

from app.services.drama.agents import MIN_EPISODE_CONTENT_CHARS
from app.services.drama.seed import (
    _episode_should_replace_fragments,
    require_confirmable_episode_body,
)


def test_require_confirmable_episode_body_ok():
    item = require_confirmable_episode_body(
        {
            "episodes": [
                {"episodeNumber": 1, "title": "开篇", "body": "甲" * MIN_EPISODE_CONTENT_CHARS},
                {"episodeNumber": 2, "title": "第 2 集", "body": "", "origin": "manual"},
            ]
        },
        1,
    )
    assert item["title"] == "开篇"


def test_require_confirmable_episode_body_missing():
    try:
        require_confirmable_episode_body({"episodes": [{"episodeNumber": 1, "body": "甲" * 600}]}, 2)
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "找不到" in str(exc)


def test_require_confirmable_episode_body_too_short():
    try:
        require_confirmable_episode_body(
            {"episodes": [{"episodeNumber": 2, "title": "待输入", "body": "太短了"}]},
            2,
        )
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "过短" in str(exc)


def test_protected_video_fragments_are_not_replaced():
    frag = SimpleNamespace(
        video="https://cdn.example/a.mp4",
        content="角色对视。\n【字幕：你好】\n@duration:5",
        params={},
    )
    episode = SimpleNamespace(fragments=[frag], params={})
    assert _episode_should_replace_fragments(episode, "甲" * MIN_EPISODE_CONTENT_CHARS) is False
