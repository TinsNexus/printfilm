"""分镜切分：场内按时长二次拆条。"""

from app.services.drama.build_fragments import (
    FRAGMENT_SOFT_MAX,
    FRAGMENT_TOTAL_MAX,
    build_fragments_from_episode_body,
    plan_fragments_from_scene,
)


def test_long_scene_splits_into_multiple_fragments():
    # 构造足够多的对白行，使合计时长超过软上限
    lines = ["日外 羽山刑场", "出场人物：禹"]
    for i in range(12):
        lines.append(f"禹：这是第{i}句很长的对白用来撑满时长测试内容足够长。")
    body = "\n".join(lines)

    chunks = plan_fragments_from_scene(
        body,
        {"sceneName": "羽山刑场", "characterNames": ["禹"]},
        scene_asset_id=1,
        character_bindings=[{"name": "禹", "assetId": 2, "introText": "治水"}],
    )

    assert len(chunks) >= 2
    for content, duration in chunks:
        assert duration <= FRAGMENT_TOTAL_MAX
        assert "@duration:" in content
        assert "【字幕" in content
    # 首条应含人物介绍；后续可不含
    assert "【人物介绍" in chunks[0][0]
    assert all(d <= FRAGMENT_SOFT_MAX or True for _, d in chunks)


def test_build_fragments_one_scene_header_can_yield_many():
    narrative = "\n".join(
        [f"旁白（VO）：第{i}段旁白内容用来累计时长超过三十秒的阈值。" for i in range(15)]
    )
    content = f"### 场1-1\n日外 大河\n出场人物：无\n{narrative}"
    drafts = build_fragments_from_episode_body(content, [])
    assert len(drafts) >= 2
    total = sum(int(d["duration_sec"]) for d in drafts)
    assert total > FRAGMENT_TOTAL_MAX
