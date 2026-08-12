"""将分集剧本按场次切成视频向分镜（对齐 manju buildSerieFragmentsFromEpisode）。"""

from __future__ import annotations

import re
from typing import Any

# 场次标题：### 场1-2 / ### 场景1-2
SCENE_HEADER_RE = re.compile(r"^###\s*场(?:景)?\s*\d+\s*[-－—]\s*\d+\s*$")
# 兼容无空格、或标题后带说明
SCENE_HEADER_LOOSE_RE = re.compile(r"^###\s*场(?:景)?\s*\d+\s*[-－—]\s*\d+")
# 时间内外景行
SCENE_LOCATION_RE = re.compile(
    r"^(?:日|夜|晨|黄昏|傍晚|凌晨|清晨|午|晚)?\s*(?:内|外|内外)\s+(.+)$"
)
# 出场人物行
CAST_LINE_RE = re.compile(r"^出场人物[：:]\s*(.+)$")
EMPTY_CAST = {"无", "无出场", "无人物", "-", "—", "无。"}

FRAGMENT_DURATION_MIN = 3
FRAGMENT_DURATION_MAX = 12
# 单分镜软上限：超过后新开一条分镜（仍可继续填到硬上限）
FRAGMENT_SOFT_MAX = 20
# 单分镜总时长硬上限（Seedance 2.5 支持至 30s）
FRAGMENT_TOTAL_MAX = 30


def normalize_scene_location_name(raw: str) -> str:
    # 去掉斜杠说明、压缩空白
    primary = re.split(r"[／/]", raw)[0].strip()
    cleaned = re.sub(r"\s+", " ", primary).strip()
    if len(cleaned) < 2 or len(cleaned) > 40:
        return ""
    return cleaned


def parse_cast_names(raw: str) -> list[str]:
    # 解析「出场人物：A、B」
    trimmed = (raw or "").strip()
    if not trimmed or trimmed.rstrip("。.．") in EMPTY_CAST:
        return []
    names = [
        part.strip()
        for part in re.split(r"[、，,／/|]", trimmed)
        if part.strip() and part.strip() not in EMPTY_CAST
    ]
    # 去重保序
    seen: set[str] = set()
    out: list[str] = []
    for name in names:
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def split_episode_content_into_scenes(content: str) -> list[dict[str, str]]:
    # 按 ### 场X-Y 拆分；无场头时整集一场
    lines = (content or "").replace("\r\n", "\n").split("\n")
    scenes: list[dict[str, str]] = []
    current: dict[str, Any] | None = None

    for line in lines:
        trimmed = line.strip()
        if SCENE_HEADER_RE.match(trimmed) or SCENE_HEADER_LOOSE_RE.match(trimmed):
            if current is not None:
                scenes.append(
                    {
                        "heading": current["heading"],
                        "body": "\n".join(current["lines"]).strip(),
                    }
                )
            current = {"heading": trimmed, "lines": []}
            continue
        if current is not None:
            current["lines"].append(line)

    if current is not None:
        scenes.append(
            {
                "heading": current["heading"],
                "body": "\n".join(current["lines"]).strip(),
            }
        )

    if scenes:
        return scenes

    trimmed_all = (content or "").strip()
    if not trimmed_all:
        return []
    return [{"heading": "", "body": trimmed_all}]


def extract_scene_meta(body: str) -> dict[str, Any]:
    # 抽取地点与出场人物
    scene_name: str | None = None
    character_names: list[str] = []
    for line in (body or "").replace("\r\n", "\n").split("\n"):
        trimmed = line.strip()
        if not trimmed:
            continue
        if scene_name is None:
            loc = SCENE_LOCATION_RE.match(trimmed)
            if loc:
                normalized = normalize_scene_location_name(loc.group(1))
                scene_name = normalized or None
        cast = CAST_LINE_RE.match(trimmed)
        if cast:
            character_names = parse_cast_names(cast.group(1))
    return {"sceneName": scene_name, "characterNames": character_names}


def _find_asset_by_name(candidates: list[Any], name: str) -> Any | None:
    target = (name or "").strip()
    if not target:
        return None
    for item in candidates:
        asset_name = (getattr(item, "name", None) or "").strip()
        if asset_name == target:
            return item
    for item in candidates:
        asset_name = (getattr(item, "name", None) or "").strip()
        if asset_name and (target in asset_name or asset_name in target):
            return item
    return None


def _strip_screenplay_meta(body: str) -> tuple[str | None, list[str]]:
    location_line: str | None = None
    narrative: list[str] = []
    for line in (body or "").replace("\r\n", "\n").split("\n"):
        trimmed = line.strip()
        if not trimmed:
            continue
        if SCENE_HEADER_RE.match(trimmed) or SCENE_HEADER_LOOSE_RE.match(trimmed):
            continue
        if CAST_LINE_RE.match(trimmed):
            continue
        if location_line is None and SCENE_LOCATION_RE.match(trimmed):
            location_line = trimmed
            continue
        narrative.append(trimmed)
    return location_line, narrative


def _format_narrative_line(line: str) -> str:
    trimmed = line.strip()
    if not trimmed:
        return trimmed
    if re.search(r"[（(](?:vo|VO|旁白)[）)]", trimmed):
        return f"【旁白·慢速清晰·同步字幕】{trimmed}"
    if re.search(r"[（(](?:os|OS)[）)]", trimmed):
        return f"【内心独白·同步字幕】{trimmed}"
    if re.match(r"^[^（(:：\n]{1,16}[（(][^）)]*[）)]\s*[：:].+", trimmed) or re.match(
        r"^[^：:\n]{1,16}[：:].+", trimmed
    ):
        return f"【对白·慢速清晰·同步字幕】{trimmed}"
    if trimmed.startswith("△") or trimmed.startswith("Δ"):
        return trimmed.replace("Δ", "△", 1) if trimmed.startswith("Δ") else trimmed
    if trimmed.startswith("【空镜"):
        return f"【空镜·可仅环境音与 BGM】{trimmed}"
    return trimmed


def _estimate_line_duration(line: str) -> int:
    trimmed = line.strip()
    if not trimmed:
        return 0
    if trimmed.startswith("△"):
        return 2
    if trimmed.startswith("【空镜"):
        return 4
    if "旁白" in trimmed:
        return min(8, max(3, len(re.sub(r"\s+", "", trimmed)) // 8))
    if "对白" in trimmed or "内心独白" in trimmed:
        return min(8, max(3, len(re.sub(r"\s+", "", trimmed)) // 10))
    return min(6, max(2, len(re.sub(r"\s+", "", trimmed)) // 12))


def _clamp_duration(seconds: int) -> int:
    if seconds <= 0:
        return 0
    return min(max(seconds, FRAGMENT_DURATION_MIN), FRAGMENT_DURATION_MAX)


def _inject_character_mentions(text: str, bindings: list[dict[str, Any]]) -> str:
    if not bindings:
        return text
    sorted_bindings = sorted(bindings, key=lambda b: len(b["name"]), reverse=True)
    parts = re.split(r"(@asset:\d+)", text)
    out: list[str] = []
    for part in parts:
        if re.fullmatch(r"@asset:\d+", part or ""):
            out.append(part)
            continue
        result = part
        for binding in sorted_bindings:
            result = result.replace(binding["name"], f"@asset:{binding['assetId']}")
        out.append(result)
    return "".join(out)


def _format_location_opener(
    location_line: str | None,
    scene_asset_id: int | None,
    scene_name: str | None,
) -> str:
    if not location_line:
        if scene_asset_id and scene_name:
            return f"@asset:{scene_asset_id} {scene_name}。"
        return ""
    match = SCENE_LOCATION_RE.match(location_line)
    if match and match.group(1) and scene_asset_id:
        prefix = location_line[: len(location_line) - len(match.group(1))].strip()
        location_part = match.group(1).strip()
        compressed = re.sub(r"\s+", "", prefix)
        return f"{compressed} @asset:{scene_asset_id} {location_part}。"
    return location_line if location_line.endswith("。") else f"{location_line}。"


def _infer_bgm_mood(hints: str) -> str:
    text = hints or ""
    rules = [
        (r"刑|斩|战|杀|怒|崩|劫|乱", "低沉紧张、鼓点渐强，烘托压迫与危机感"),
        (r"殿|宫|朝|帝|神|礼", "庄重史诗、弦乐铺底，气势恢宏但不抢戏"),
        (r"夜|暗|悬疑|密", "神秘悬疑、低频铺底，留白感强"),
        (r"水|河|海|雨|洪", "流动感环境音乐，水声与弦乐交织"),
        (r"晨|春|暖|光", "轻柔开阔、希望感，钢琴或弦乐为主"),
    ]
    for pattern, mood in rules:
        if re.search(pattern, text):
            return mood
    return "贴合剧情氛围的轻量配乐，情绪随画面起伏"


def _build_production_cues(
    location_line: str | None,
    narrative_lines: list[str],
    character_intro_lines: list[str],
) -> list[str]:
    # 字幕 / BGM / 人物介绍前置提示
    hint = " ".join(filter(None, [location_line or "", *narrative_lines[:3]]))
    lines = [
        "【字幕：底部居中·简体中文·对白旁白同步】",
        f"【BGM：{_infer_bgm_mood(hint)}；音量低于人声】",
    ]
    lines.extend(character_intro_lines)
    return lines


def _build_character_intro_lines(character_bindings: list[dict[str, Any]]) -> list[str]:
    # 本场人物介绍叠字行
    return [
        (
            f"【人物介绍·画面叠字】{b['name']}｜{b['introText']}"
            if b.get("introText")
            else f"【人物介绍·画面叠字】{b['name']}"
        )
        for b in character_bindings
    ]


def _flush_fragment_chunk(
    cue_lines: list[str],
    body_lines: list[str],
    used: int,
) -> tuple[str, int]:
    # 组装单条分镜草稿；无正文时给最小时长占位
    planned = [*cue_lines, *body_lines]
    duration = used
    if duration <= 0:
        planned.append(f"@duration:{FRAGMENT_DURATION_MIN}")
        duration = FRAGMENT_DURATION_MIN
    return "\n".join(planned).strip(), duration


def plan_fragments_from_scene(
    body: str,
    meta: dict[str, Any],
    scene_asset_id: int | None,
    character_bindings: list[dict[str, Any]],
) -> list[tuple[str, int]]:
    """
    规划单场视频向分镜正文；超软上限时拆成多条，避免截断后半场。
    返回 [(content, duration_sec), ...]
    """
    location_line, narrative_lines = _strip_screenplay_meta(body)
    intro_lines = _build_character_intro_lines(character_bindings)
    first_cues = _build_production_cues(location_line, narrative_lines, intro_lines)
    cont_cues = _build_production_cues(location_line, narrative_lines, [])

    # timed_blocks 待打包的 (时长, 文本行列表)
    timed_blocks: list[tuple[int, list[str]]] = []

    opener = _format_location_opener(location_line, scene_asset_id, meta.get("sceneName"))
    if opener:
        opener_dur = _clamp_duration(3)
        timed_blocks.append(
            (
                opener_dur,
                [
                    f"@duration:{opener_dur}",
                    _inject_character_mentions(opener, character_bindings),
                ],
            )
        )

    for line in narrative_lines:
        raw = _inject_character_mentions(line, character_bindings)
        formatted = _format_narrative_line(raw)
        line_dur = _clamp_duration(_estimate_line_duration(formatted))
        if line_dur <= 0:
            continue
        timed_blocks.append((line_dur, [f"@duration:{line_dur}", formatted]))

    if not timed_blocks:
        return [_flush_fragment_chunk(first_cues, [], 0)]

    fragments: list[tuple[str, int]] = []
    body_lines: list[str] = []
    used = 0
    is_first = True

    for block_dur, block_lines in timed_blocks:
        # 已达软上限且本块放不下 → 先落盘当前镜
        if used > 0 and used >= FRAGMENT_SOFT_MAX and used + block_dur > FRAGMENT_SOFT_MAX:
            cues = first_cues if is_first else cont_cues
            fragments.append(_flush_fragment_chunk(cues, body_lines, used))
            body_lines = []
            used = 0
            is_first = False

        # 硬上限：本块放不下则开新镜；单块超过硬上限则截断到硬上限
        if used > 0 and used + block_dur > FRAGMENT_TOTAL_MAX:
            cues = first_cues if is_first else cont_cues
            fragments.append(_flush_fragment_chunk(cues, body_lines, used))
            body_lines = []
            used = 0
            is_first = False

        take_dur = block_dur
        if take_dur > FRAGMENT_TOTAL_MAX:
            take_dur = FRAGMENT_TOTAL_MAX
        if used + take_dur > FRAGMENT_TOTAL_MAX:
            take_dur = FRAGMENT_TOTAL_MAX - used
        if take_dur <= 0:
            cues = first_cues if is_first else cont_cues
            fragments.append(_flush_fragment_chunk(cues, body_lines, used))
            body_lines = []
            used = 0
            is_first = False
            take_dur = min(block_dur, FRAGMENT_TOTAL_MAX)

        if take_dur != block_dur:
            # 时长被截断时改写 @duration 行
            rewritten = [f"@duration:{take_dur}" if ln.startswith("@duration:") else ln for ln in block_lines]
            body_lines.extend(rewritten)
        else:
            body_lines.extend(block_lines)
        used += take_dur

    if body_lines or not fragments:
        cues = first_cues if is_first else cont_cues
        fragments.append(_flush_fragment_chunk(cues, body_lines, used))

    return fragments


def plan_fragment_content_from_scene(
    body: str,
    meta: dict[str, Any],
    scene_asset_id: int | None,
    character_bindings: list[dict[str, Any]],
) -> tuple[str, int]:
    # 兼容旧调用：返回本场第一条分镜
    chunks = plan_fragments_from_scene(body, meta, scene_asset_id, character_bindings)
    return chunks[0] if chunks else ("", FRAGMENT_DURATION_MIN)


def is_raw_screenplay_fragment(content: str) -> bool:
    # 仍为场记原文、需按新逻辑重切
    trimmed = (content or "").strip()
    if not trimmed:
        return True
    if "### 场" in trimmed or "### 场景" in trimmed:
        return True
    if re.search(r"^出场人物[：:]", trimmed, re.M):
        return True
    if "【字幕：" not in trimmed and "@duration:" not in trimmed:
        return True
    return False


def build_fragments_from_episode_body(
    content: str,
    assets: list[Any],
) -> list[dict[str, Any]]:
    """
    将一集正文拆成多场分镜草稿。
    返回 [{content, duration_sec, asset_ids, scene_name, character_names}, ...]
    """
    character_assets = [a for a in assets if getattr(a, "type", "") == "character"]
    scene_assets = [a for a in assets if getattr(a, "type", "") == "scene"]
    scenes = split_episode_content_into_scenes(content)

    if not scenes:
        return [
            {
                "content": "",
                "duration_sec": 8,
                "asset_ids": [],
                "scene_name": None,
                "character_names": [],
            }
        ]

    fragments: list[dict[str, Any]] = []
    for scene in scenes:
        meta = extract_scene_meta(scene["body"])
        matched_ids: list[int] = []
        scene_asset_id: int | None = None
        character_bindings: list[dict[str, Any]] = []

        if meta.get("sceneName"):
            scene_asset = _find_asset_by_name(scene_assets, str(meta["sceneName"]))
            if scene_asset is not None:
                scene_asset_id = int(scene_asset.id)
                matched_ids.append(scene_asset_id)

        for character_name in meta.get("characterNames") or []:
            character_asset = _find_asset_by_name(character_assets, str(character_name))
            if character_asset is None:
                continue
            intro = None
            params = getattr(character_asset, "params", None) or {}
            if isinstance(params, dict):
                intro = params.get("title") or params.get("roleType") or params.get("coreTags")
            character_bindings.append(
                {
                    "name": str(character_name),
                    "assetId": int(character_asset.id),
                    "introText": str(intro).strip() if intro else None,
                }
            )
            if character_asset.id not in matched_ids:
                matched_ids.append(int(character_asset.id))

        # 一场可拆多条分镜（按时长软/硬上限）
        for planned, duration in plan_fragments_from_scene(
            scene["body"],
            meta,
            scene_asset_id,
            character_bindings,
        ):
            fragments.append(
                {
                    "content": planned,
                    "duration_sec": duration or 8,
                    "asset_ids": list(matched_ids),
                    "scene_name": meta.get("sceneName"),
                    "character_names": meta.get("characterNames") or [],
                }
            )

    return fragments
