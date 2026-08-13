"""Manju-style segment planning for Seedance 2.5 multi-shot pipeline.

Each shot stores a ``segment_script`` with production cues and ``@duration`` beats.
Before calling Seedance, durations are expanded to time ranges (00:00-00:04, …).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

SEGMENT_DURATION_MIN = 3
SEGMENT_DURATION_MAX = 12
SHOT_DURATION_MIN = 4
SHOT_DURATION_MAX = 30

DURATION_TOKEN_RE = re.compile(r"@duration:(\d+)")
NARRATION_PREFIX = "【旁白·慢速清晰·同步字幕】"
DIALOGUE_PREFIX = "【对白·慢速清晰·同步字幕】"
VISUAL_PREFIX = "【画面·无配音仅环境音】"
EMPTY_SHOT_PREFIX = "【空镜·可仅环境音与 BGM】"
SUBTITLE_CUE = "【字幕：全程简体中文字幕，旁白逐句同步烧录】"
DRAMA_SUBTITLE_CUE = "【字幕：底部居中·简体中文·逐句轮换·与口播同步】"
# 历史 cue，提交前统一替换为现行文案
LEGACY_DRAMA_SUBTITLE_CUES = (
    "【字幕：底部居中·简体中文·仅标记段落同步】",
    "【字幕：底部居中·简体中文】",
)
DEFAULT_BGM_MOOD = "贴合内容的轻量配乐，情绪平稳，不抢旁白"
SEEDANCE_PRODUCTION_SECTION_HEADER = "【强制约束：音频、字幕与配乐】"

# 空镜/景别冒号标签：正文若以此开头则不得配音、不得烧字幕
VISUAL_SHOT_LABEL_RE = re.compile(
    r"^(?:"
    r"空镜|画面|远景|近景|中景|全景|特写|大特写|"
    r"跟拍|俯拍|仰拍|航拍|推镜|拉镜|摇镜|环境|镜头|动作|转场|闪回|"
    r"建立镜头|气氛镜头"
    r")\s*[：:]"
)
VOICE_CUE_PREFIX_RE = re.compile(
    r"^【(?:对白|旁白|内心独白)[^】]*】\s*"
)

PRODUCTION_META_PREFIXES = (
    "【字幕",
    "【BGM",
    "【人物介绍",
    "【片头",
    "【背景介绍",
    "【强制约束",
)


def is_production_meta_line(line: str) -> bool:
    stripped = (line or "").strip()
    return any(stripped.startswith(prefix) for prefix in PRODUCTION_META_PREFIXES)


def _strip_voice_cue_prefix(line: str) -> str:
    # 去掉对白/旁白/内心独白前缀
    return VOICE_CUE_PREFIX_RE.sub("", (line or "").strip()).strip()


def is_visual_description_body(text: str) -> bool:
    # 判断正文是否为纯画面/空镜描写（不含配音意图）
    body = _strip_voice_cue_prefix(text or "").strip()
    body = re.sub(r"^【(?:画面|空镜)[^】]*】\s*", "", body).strip()
    if not body:
        return False
    if VISUAL_SHOT_LABEL_RE.match(body):
        return True
    if body.startswith("空镜") or body.startswith("△") or body.startswith("Δ"):
        return True
    return False


def normalize_drama_subtitle_cue(content: str) -> str:
    """将历史字幕 cue 统一为现行「逐句轮换」文案。"""
    text = content or ""
    for old in LEGACY_DRAMA_SUBTITLE_CUES:
        if old in text:
            text = text.replace(old, DRAMA_SUBTITLE_CUE)
    return text


def normalize_character_intro_cue(content: str) -> str:
    """将历史人物介绍 cue 统一为「角色身旁」定位。"""
    # 负向前瞻：已是「·角色身旁」的不二次替换
    return re.sub(
        r"【人物介绍·画面叠字】(?!·角色身旁)",
        "【人物介绍·画面叠字·角色身旁】",
        content or "",
    )


def rewrite_misclassified_visual_voice_lines(content: str) -> str:
    """
    纠正「空镜：…」等被误打成对白/旁白前缀的行。
    供 Seedance 提交前兜底，使旧分镜也能按画面-only 约束生成。
    """
    text = normalize_character_intro_cue(normalize_drama_subtitle_cue(content))
    out: list[str] = []
    for raw in text.replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line:
            out.append(raw)
            continue
        if line.startswith("@duration:") or is_production_meta_line(line):
            out.append(raw)
            continue
        if VOICE_CUE_PREFIX_RE.match(line) and is_visual_description_body(line):
            body = _strip_voice_cue_prefix(line)
            out.append(f"{VISUAL_PREFIX}{body}")
            continue
        out.append(raw)
    return "\n".join(out)


def script_has_narration_cue(content: str) -> bool:
    """检测脚本是否含旁白 cue（忽略字幕/BGM 等元数据行）。"""
    for raw in (content or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line or line.startswith("@duration:") or is_production_meta_line(line):
            continue
        if is_visual_description_body(line):
            continue
        if NARRATION_PREFIX in line or line.startswith("【旁白"):
            return True
    return False


def script_has_dialogue_cue(content: str) -> bool:
    """检测脚本是否含对白 cue。"""
    for raw in (content or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line or line.startswith("@duration:") or is_production_meta_line(line):
            continue
        if is_visual_description_body(line):
            continue
        if DIALOGUE_PREFIX in line or line.startswith("【对白"):
            return True
    return False


def script_is_drama_mixed(segment_script: str) -> bool:
    """漫剧混排：画面描述 + 对白/旁白分段，而非整镜旁白。"""
    content = segment_script or ""
    if script_has_visual_only_cue(content):
        return True
    if script_has_dialogue_cue(content):
        return True
    if DRAMA_SUBTITLE_CUE in content:
        return True
    if "仅标记段落同步" in content:
        return True
    if "逐句轮换" in content:
        return True
    if "对白旁白同步" in content:
        return True
    return False


def script_has_visual_only_cue(content: str) -> bool:
    """检测脚本是否含画面描述 cue（漫剧混排）。"""
    for raw in (content or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if (
            line.startswith(VISUAL_PREFIX)
            or line.startswith("【画面·")
            or line.startswith("【空镜")
            or EMPTY_SHOT_PREFIX in line
            or is_visual_description_body(line)
        ):
            return True
    return False

BGM_MOOD_KEYWORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"紧张|危机|压迫|悬疑"), "低沉紧张、鼓点渐强，烘托压迫感，音量低于人声"),
    (re.compile(r"温暖|人文|故事|情感"), "温暖人文、钢琴弦乐铺底，音量低于人声"),
    (re.compile(r"赛博|科技|未来|霓虹"), "轻电子氛围，克制不抢戏，音量低于人声"),
    (re.compile(r"开源|产品|工作|工位|配置|部署"), "轻快专业、干净电子铺底，音量低于人声"),
    (re.compile(r"史诗|奇幻|宏大"), "史诗弦乐铺底，气势克制，音量低于人声"),
]


@dataclass
class SegmentBeat:
    duration: int
    kind: str  # visual | narration | action
    text: str


def clamp_segment_duration(seconds: float | int) -> int:
    return int(max(SEGMENT_DURATION_MIN, min(int(round(float(seconds))), SEGMENT_DURATION_MAX)))


def clamp_shot_total(
    seconds: float | int, *, lo: int = SHOT_DURATION_MIN, hi: int = SHOT_DURATION_MAX
) -> int:
    return int(max(lo, min(int(round(float(seconds))), hi)))


def estimate_narration_duration(text: str) -> int:
    """~3 Chinese chars per second for slow clear VO; clamp to segment range."""
    clean = re.sub(r"\s+", "", (text or "").strip())
    clean = re.sub(r"^【[^】]*】", "", clean).strip()
    if not clean:
        return SEGMENT_DURATION_MIN
    secs = max(SEGMENT_DURATION_MIN, int((len(clean) + 2) // 3) + 1)
    return clamp_segment_duration(secs)


def estimate_visual_duration(text: str) -> int:
    clean = (text or "").strip()
    if not clean:
        return SEGMENT_DURATION_MIN
    if len(clean) < 20:
        return SEGMENT_DURATION_MIN
    if len(clean) < 50:
        return 4
    return clamp_segment_duration(6)


def infer_bgm_mood(*hints: str) -> str:
    blob = "\n".join(h for h in hints if h).strip()
    if not blob:
        return DEFAULT_BGM_MOOD
    for pattern, mood in BGM_MOOD_KEYWORDS:
        if pattern.search(blob):
            return mood
    return DEFAULT_BGM_MOOD


def build_production_cues(bgm_mood: str) -> list[str]:
    mood = (bgm_mood or "").strip() or DEFAULT_BGM_MOOD
    if "音量低于人声" not in mood:
        mood = f"{mood}，音量低于人声"
    return [SUBTITLE_CUE, f"【BGM：{mood}】"]


def build_seedance_production_section(segment_script: str) -> str:
    """组装 Seedance 音频/字幕/BGM 强制约束（科普旁白 / 漫剧画面+对白混排）。"""
    has_vo = script_has_narration_cue(segment_script)
    has_dialogue = script_has_dialogue_cue(segment_script)
    drama_mixed = script_is_drama_mixed(segment_script)
    # bgm_mood 从脚本 BGM cue 或正文推断
    bgm_mood = DEFAULT_BGM_MOOD
    for raw in (segment_script or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if line.startswith("【BGM："):
            mood = line.removeprefix("【BGM：").removesuffix("】").strip()
            if mood:
                bgm_mood = mood
            break
    else:
        bgm_mood = infer_bgm_mood(segment_script)

    if "音量低于人声" not in bgm_mood:
        bgm_mood = f"{bgm_mood}，音量低于人声"

    if drama_mixed:
        lines = [
            "1. 配音范围：仅【旁白·…】【对白·…】标记的段落需要口播；"
            "【画面·…】标记或未带配音前缀的段落为画面/动作描述，只呈现视觉与环境音，"
            "禁止为其生成配音、禁止烧字幕、禁止把画面描述念出来。",
            "2. 语速：旁白/对白语速自然偏慢，吐字清晰，留有呼吸与停顿；严禁加速赶词。",
            "3. 字幕：仅【旁白·…】【对白·…】口播内容烧录简体中文字幕，底部居中；"
            "同一时刻只显示一行（一句），随口播进度逐句轮换，禁止把整段对白一次性叠满屏幕；"
            "禁止重复字、叠字、口吃式重复；字幕必须与当前正在说的那一句逐字一致；"
            "画面描述段不出现字幕。",
        ]
        if has_vo:
            lines.append(
                "4. 旁白：【旁白·…】段落以第三人称旁白慢速清晰配音；"
                "字幕逐句轮换，与当前口播句同步。"
            )
        elif has_dialogue:
            lines.append(
                "4. 对白：【对白·…】段落按角色对白配音；"
                "字幕逐句轮换，与当前口播句同步；无对白标记时保持环境音即可。"
            )
        else:
            lines.append(
                "4. 人声：本镜若无旁白/对白标记，则全程无口播，仅环境音与 BGM。"
            )
        lines.append(
            f"5. 背景音乐：{bgm_mood}；BGM 音量低于人声约 30%。"
        )
        lines.append(
            "6. 音效：环境音与动作音效与画面同步，层次低于人声。"
        )
        if "【人物介绍" in (segment_script or ""):
            lines.append(
                "7. 人物介绍叠字：【人物介绍·画面叠字·角色身旁】须贴在对应角色身旁"
                "（肩侧/身旁小字），随该角色首次入画短暂出现；"
                "禁止居中大标题、禁止底部与口播字幕抢位；"
                "禁止口播念出介绍全文。"
            )
        return f"{SEEDANCE_PRODUCTION_SECTION_HEADER}\n" + "\n".join(lines)

    # 科普旁白模式：整镜以旁白段为主
    lines = [
        "1. 语速：旁白语速自然偏慢，吐字清晰，留有呼吸与停顿；严禁加速赶词、压缩台词或提高播放倍速。",
        "2. 字幕：全程烧录简体中文字幕，位置底部居中，字号清晰可读；旁白须逐句同步显示，字幕与口播一致。",
    ]
    if has_vo:
        lines.append(
            "3. 旁白：脚本含旁白段落时以第三人称旁白配音，沉稳清晰、语速偏慢；"
            "视频内不要自行添加嘈杂对白；旁白出现时字幕同步显示全文。"
        )
    else:
        lines.append(
            "3. 旁白：若脚本含旁白标记，按第三人称旁白慢速清晰配音，并同步烧录字幕；"
            "视频内不要自行添加嘈杂对白。"
        )
    lines.append(
        f"4. 背景音乐：{bgm_mood}；BGM 音量低于人声约 30%，不得盖过旁白与关键音效。"
    )
    lines.append(
        "5. 音效：环境音与动作音效与画面同步，层次低于人声。"
    )
    return f"{SEEDANCE_PRODUCTION_SECTION_HEADER}\n" + "\n".join(lines)


def format_segment_line(kind: str, text: str) -> str:
    clean = (text or "").strip()
    if not clean:
        return ""
    if clean.startswith("【"):
        return clean
    k = (kind or "visual").strip().lower()
    if k in {"narration", "vo", "旁白"}:
        return f"{NARRATION_PREFIX}{clean}"
    return clean


def extract_durations(content: str) -> list[int]:
    out: list[int] = []
    for match in DURATION_TOKEN_RE.finditer(content or ""):
        secs = int(match.group(1))
        if secs > 0:
            out.append(secs)
    return out


def sum_duration(content: str) -> int:
    return sum(extract_durations(content))


def replace_duration_with_time_ranges(content: str) -> str:
    elapsed = 0

    def _repl(match: re.Match[str]) -> str:
        nonlocal elapsed
        secs = int(match.group(1))
        if secs <= 0:
            return " "
        start = elapsed
        end = elapsed + secs
        elapsed = end
        return f"{_fmt_ts(start)}-{_fmt_ts(end)}"

    return DURATION_TOKEN_RE.sub(_repl, content or "")


def _fmt_ts(seconds: int) -> str:
    minutes = seconds // 60
    secs = seconds % 60
    return f"{minutes:02d}:{secs:02d}"


def narration_from_script(content: str) -> str:
    lines: list[str] = []
    for raw in (content or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if (
            not line
            or line.startswith("@duration:")
            or line.startswith("【字幕")
            or line.startswith("【BGM")
        ):
            continue
        if NARRATION_PREFIX in line or "旁白" in line[:20]:
            text = re.sub(r"^【[^】]*】", "", line).strip()
            if text:
                lines.append(text)
    return "".join(lines) if lines else ""


def first_visual_prompt(content: str) -> str:
    for raw in (content or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if (
            not line
            or line.startswith("@duration:")
            or line.startswith("【字幕")
            or line.startswith("【BGM")
        ):
            continue
        if NARRATION_PREFIX in line or line.startswith("【旁白"):
            continue
        cleaned = re.sub(r"^【[^】]*】", "", line).strip()
        if cleaned:
            return cleaned
    for raw in (content or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if line and not line.startswith("@") and not line.startswith("【字幕") and not line.startswith("【BGM"):
            return re.sub(r"^【[^】]*】", "", line).strip()
    return ""


def build_segment_script(
    beats: list[SegmentBeat],
    *,
    bgm_mood: str,
    max_total: int = SHOT_DURATION_MAX,
) -> str:
    lines = build_production_cues(bgm_mood)
    used = 0
    for beat in beats:
        text = format_segment_line(beat.kind, beat.text)
        if not text:
            continue
        if beat.kind in {"narration", "vo", "旁白"}:
            dur = clamp_segment_duration(beat.duration or estimate_narration_duration(beat.text))
        else:
            dur = clamp_segment_duration(beat.duration or estimate_visual_duration(beat.text))
        if used + dur > max_total:
            dur = max_total - used
            if dur < SEGMENT_DURATION_MIN:
                break
        lines.append(f"@duration:{dur}")
        lines.append(text)
        used += dur
        if used >= max_total:
            break
    if used == 0:
        lines.append(f"@duration:{SEGMENT_DURATION_MIN}")
        lines.append("画面轻微动态，保持主体稳定")
    return "\n".join(lines).strip()


def parse_beats_from_llm_shot(item: dict[str, Any], narration_fallback: str = "") -> list[SegmentBeat]:
    """Accept either segments[] or legacy flat text/img_prompt/video_prompt."""
    beats: list[SegmentBeat] = []
    segs = item.get("segments")
    if isinstance(segs, list) and segs:
        for seg in segs:
            if not isinstance(seg, dict):
                continue
            kind = str(seg.get("kind") or seg.get("type") or "visual").strip().lower()
            text = str(seg.get("text") or seg.get("content") or "").strip()
            if not text:
                continue
            raw_dur = seg.get("duration")
            if kind in {"narration", "vo", "旁白"}:
                dur = int(raw_dur) if raw_dur else estimate_narration_duration(text)
                if raw_dur:
                    # 旁白时长再按字数下限钳制，避免 LLM 给过短 duration
                    dur = max(dur, estimate_narration_duration(text))
            else:
                dur = int(raw_dur) if raw_dur else estimate_visual_duration(text)
            beats.append(
                SegmentBeat(duration=clamp_segment_duration(dur), kind=kind, text=text)
            )
        return beats

    img = str(item.get("img_prompt") or item.get("visual") or "").strip()
    video = str(item.get("video_prompt") or "").strip()
    text = str(item.get("text") or item.get("audio_text") or narration_fallback or "").strip()
    camera = str(item.get("camera") or "").strip()

    if img:
        beats.append(SegmentBeat(duration=estimate_visual_duration(img), kind="visual", text=img))
    elif video:
        visual = video if not camera else f"{video}，运镜：{camera}"
        beats.append(SegmentBeat(duration=estimate_visual_duration(visual), kind="visual", text=visual))
    if text:
        beats.append(
            SegmentBeat(duration=estimate_narration_duration(text), kind="narration", text=text)
        )
    if not beats and video:
        beats.append(SegmentBeat(duration=4, kind="action", text=video))
    return beats


def build_seedance_prompt(
    segment_script: str,
    *,
    style_prefix: str = "",
    motion_bias: str = "",
    camera: str = "",
) -> str:
    """Assemble final Seedance text: style lock + production constraints + timed body."""
    parts: list[str] = []
    style = (style_prefix or "").strip()
    if style:
        parts.append(
            "【强制约束：视频画面风格】全片画面必须严格遵循以下风格描述，"
            f"严禁偏离或混用其他画风：{style}"
        )
    parts.append(build_seedance_production_section(segment_script))
    parts.append(
        "【强制约束：节奏与画面】严格按时间轴段落演绎画面；"
        "保持主体外形与首帧一致，动作自然。"
    )
    if motion_bias or camera:
        bits = [b for b in (motion_bias.strip(), camera.strip()) if b]
        parts.append("【运镜】" + "；".join(bits))
    body = replace_duration_with_time_ranges(segment_script or "")
    parts.append(body.strip())
    return "\n".join(p for p in parts if p).strip()


def resolve_api_duration(
    segment_script: str,
    *,
    fallback: float | int = 8,
    lo: int = SHOT_DURATION_MIN,
    hi: int = SHOT_DURATION_MAX,
) -> int:
    total = sum_duration(segment_script)
    if total <= 0:
        total = int(round(float(fallback)))
    return clamp_shot_total(total, lo=lo, hi=hi)


def apply_segment_script_edit(script: str, *, bgm_mood: str | None = None) -> dict[str, Any]:
    """Normalize an edited script: ensure cues, recompute duration/narration/img."""
    content = (script or "").strip()
    if not content:
        content = build_segment_script(
            [SegmentBeat(duration=4, kind="visual", text="画面轻微动态，保持主体稳定")],
            bgm_mood=bgm_mood or DEFAULT_BGM_MOOD,
        )
    else:
        has_sub = any(line.strip().startswith("【字幕") for line in content.splitlines())
        has_bgm = any(line.strip().startswith("【BGM") for line in content.splitlines())
        if not has_sub or not has_bgm:
            cues = build_production_cues(bgm_mood or infer_bgm_mood(content))
            body_lines = [
                ln
                for ln in content.splitlines()
                if not ln.strip().startswith("【字幕") and not ln.strip().startswith("【BGM")
            ]
            content = "\n".join(cues + body_lines).strip()
        if not extract_durations(content):
            body = "\n".join(
                ln
                for ln in content.splitlines()
                if not ln.strip().startswith("【字幕") and not ln.strip().startswith("【BGM")
            ).strip()
            content = build_segment_script(
                [
                    SegmentBeat(
                        duration=estimate_narration_duration(body),
                        kind="narration",
                        text=body or "平稳推进",
                    )
                ],
                bgm_mood=bgm_mood or infer_bgm_mood(content),
            )
    return {
        "segment_script": content,
        "duration": float(resolve_api_duration(content)),
        "narration": narration_from_script(content),
        "img_prompt": first_visual_prompt(content),
        "video_prompt": content,
    }
