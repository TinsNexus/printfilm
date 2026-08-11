"""Unit tests for manju-style segment planning."""

from app.services.seedance_segments import (
    SegmentBeat,
    apply_segment_script_edit,
    build_segment_script,
    build_seedance_prompt,
    narration_from_script,
    replace_duration_with_time_ranges,
    resolve_api_duration,
    sum_duration,
)


def test_build_segment_script_and_time_ranges():
    script = build_segment_script(
        [
            SegmentBeat(duration=4, kind="visual", text="过肩工位打开工作台"),
            SegmentBeat(duration=8, kind="narration", text="很多人找开源工具却卡在接入"),
        ],
        bgm_mood="轻快专业",
    )
    assert "【字幕：" in script
    assert "【BGM：" in script
    assert "@duration:4" in script
    assert "@duration:8" in script
    assert "【旁白·慢速清晰·同步字幕】" in script
    assert sum_duration(script) == 12
    timed = replace_duration_with_time_ranges(script)
    assert "00:00-00:04" in timed
    assert "00:04-00:12" in timed
    assert resolve_api_duration(script) == 12
    assert "很多人找开源工具" in narration_from_script(script)


def test_build_seedance_prompt_includes_style():
    script = build_segment_script(
        [SegmentBeat(duration=5, kind="visual", text="手部点击配置")],
        bgm_mood="轻快专业",
    )
    prompt = build_seedance_prompt(script, style_prefix="真人写实工位", motion_bias="轻推", camera="缓慢推近")
    assert "强制约束：视频画面风格" in prompt
    assert "真人写实工位" in prompt
    assert "00:00-00:05" in prompt


def test_apply_segment_script_edit_fills_cues():
    out = apply_segment_script_edit(
        "@duration:6\n过肩演示产品\n@duration:6\n【旁白·慢速清晰·同步字幕】一句话介绍能力",
        bgm_mood="冷静纪实",
    )
    assert out["duration"] == 12.0
    assert "【字幕：" in out["segment_script"]
    assert "【BGM：" in out["segment_script"]
    assert out["narration"]
