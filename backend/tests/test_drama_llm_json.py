"""drama LLM JSON 解析单测。"""

import json

import pytest

from app.services.drama.llm import _extract_json


def test_extract_json_plain_object():
    data = _extract_json('{"oneLineStory": "测试"}')
    assert data["oneLineStory"] == "测试"


def test_extract_json_strips_fences():
    raw = '```json\n{"episodeCount": 12}\n```'
    data = _extract_json(raw)
    assert data["episodeCount"] == 12


def test_extract_json_repairs_trailing_comma():
    raw = '{"characters": [{"name": "沈令仪",},], "synopsis": "test",}'
    data = _extract_json(raw)
    assert data["characters"][0]["name"] == "沈令仪"
    assert data["synopsis"] == "test"


def test_extract_json_repairs_smart_quotes():
    raw = '{"oneLineStory": "将门孤女"}'
    data = _extract_json(raw)
    assert "将门孤女" in data["oneLineStory"]


def test_extract_json_raises_on_invalid_payload():
    with pytest.raises(json.JSONDecodeError):
        _extract_json("not json at all")
