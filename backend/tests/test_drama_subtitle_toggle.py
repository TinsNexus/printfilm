"""分镜字幕开关：关闭时不再注入字幕 cue。"""

from app.services.drama.build_fragments import DRAMA_SUBTITLE_CUE, plan_fragments_from_scene
from app.services.drama.fragment_plan_prompt import build_fragment_plan_user_prompt


def test_plan_fragments_from_scene_omits_subtitle_cue_when_disabled():
    chunks = plan_fragments_from_scene(
        "旁白：河岸边风声渐起。",
        meta={},
        scene_asset_id=None,
        character_bindings=[],
        include_subtitles=False,
    )
    content, _duration = chunks[0]
    assert DRAMA_SUBTITLE_CUE not in content
    assert "同步字幕" not in content
    assert "旁白" in content


def test_plan_fragments_from_scene_omits_dialogue_subtitle_when_disabled():
    chunks = plan_fragments_from_scene(
        "阿禹：大家先后退。",
        meta={},
        scene_asset_id=None,
        character_bindings=[],
        include_subtitles=False,
    )
    content, _duration = chunks[0]
    assert "【对白·慢速清晰】" in content
    assert "同步字幕" not in content


def test_fragment_plan_user_prompt_marks_no_subtitles():
    prompt = build_fragment_plan_user_prompt(
        episode_name="大禹治水",
        episode_body="禹来到河边。",
        asset_catalog=[],
        include_subtitles=False,
    )
    assert "字幕需求：不要字幕" in prompt
    assert "不要写任何“字幕 / 叠字 / 同步字幕 / 字卡”等提示" in prompt
