"""Unit tests for manju-style segment planning."""

from app.services.seedance_segments import (
    NARRATION_PREFIX,
    SEEDANCE_PRODUCTION_SECTION_HEADER,
    SegmentBeat,
    apply_segment_script_edit,
    build_segment_script,
    build_seedance_production_section,
    build_seedance_prompt,
    narration_from_script,
    parse_beats_from_llm_shot,
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


def test_build_seedance_prompt_includes_style_and_production():
    script = build_segment_script(
        [
            SegmentBeat(duration=5, kind="visual", text="手部点击配置"),
            SegmentBeat(duration=6, kind="narration", text="一键接入即可开始监控"),
        ],
        bgm_mood="轻快专业",
    )
    prompt = build_seedance_prompt(
        script, style_prefix="真人写实工位", motion_bias="轻推", camera="缓慢推近"
    )
    assert "强制约束：视频画面风格" in prompt
    assert "真人写实工位" in prompt
    assert SEEDANCE_PRODUCTION_SECTION_HEADER in prompt
    assert "语速" in prompt
    assert "字幕" in prompt
    assert "背景音乐" in prompt
    assert "00:00-00:05" in prompt
    assert NARRATION_PREFIX in prompt or "旁白" in prompt


def test_build_seedance_production_section_detects_vo():
    script = (
        "【字幕：全程简体中文字幕，旁白逐句同步烧录】\n"
        "【BGM：轻快专业，音量低于人声】\n"
        "@duration:4\n过肩演示\n"
        f"@duration:8\n{NARRATION_PREFIX}口播一句"
    )
    section = build_seedance_production_section(script)
    assert section.startswith(SEEDANCE_PRODUCTION_SECTION_HEADER)
    assert "第三人称旁白配音" in section
    assert "轻快专业" in section


def test_parse_beats_clamps_short_narration_duration():
    beats = parse_beats_from_llm_shot(
        {
            "segments": [
                {"kind": "visual", "duration": 4, "text": "过肩景，程序员点击触控板"},
                {
                    "kind": "narration",
                    "duration": 3,
                    "text": "还在被网站加载慢、用户流失、性能问题反复出现困扰吗？",
                },
            ]
        }
    )
    assert len(beats) == 2
    assert beats[0].duration == 4
    # 旁白按字数估时应大于等于 LLM 给的 3 秒
    assert beats[1].duration >= 3
    assert beats[1].duration <= 12


def test_apply_segment_script_edit_fills_cues():
    out = apply_segment_script_edit(
        "@duration:6\n过肩演示产品\n@duration:6\n【旁白·慢速清晰·同步字幕】一句话介绍能力",
        bgm_mood="冷静纪实",
    )
    assert out["duration"] == 12.0
    assert "【字幕：" in out["segment_script"]
    assert "【BGM：" in out["segment_script"]
    assert out["narration"]
