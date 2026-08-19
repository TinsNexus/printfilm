"""Volcengine Ark gateway via HTTP (chat / Seedream / Seedance / TTS)."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import Settings, get_settings
from app.services import storage
from app.services.ffmpeg_compose import is_near_silent_audio
from app.services.llm_client import chat_completions
from app.services import seedance_segments as segplan

logger = logging.getLogger(__name__)


def _fallback_overlay_title(text: str, shot_no: int) -> str:
    """Last resort when LLM omits title — never blind-slice mid-word (e.g. ERP→ER)."""
    raw = re.sub(r"\s+", "", (text or "").strip())
    if not raw:
        return f"场景{shot_no}"
    clause = re.split(r"[，。；！？、,:;]", raw, maxsplit=1)[0].strip()
    if 2 <= len(clause) <= 10 and not _looks_truncated_token(clause, raw):
        return clause
    return f"场景{shot_no}"


def _fallback_overlay_subtitle(text: str) -> str:
    raw = (text or "").strip()
    if not raw:
        return ""
    cleaned = re.sub(r"\s+", "", raw)
    clause = re.split(r"[，。；！？、,:;]", cleaned, maxsplit=1)[0].strip()
    if 4 <= len(clause) <= 22:
        return clause
    if len(clause) > 22:
        # Prefer a trailing noun-ish chunk over a head that cuts mid-phrase
        for n in range(18, 7, -1):
            tail = clause[-n:].lstrip("的与和及")
            if 6 <= len(tail) <= 18 and not re.match(r"[A-Za-z0-9]", tail[:1] or ""):
                if not _looks_truncated_token(tail, clause):
                    return tail
        head = clause[:18]
        if re.search(r"[A-Za-z0-9]$", head) and re.match(r"[A-Za-z0-9]", clause[18:19] or ""):
            m = re.search(r"[A-Za-z0-9]+$", head)
            if m and m.start() > 6:
                head = head[: m.start()]
        return head
    return cleaned[:22] if len(cleaned) > 22 else cleaned


def _looks_truncated_token(title: str, full_text: str) -> bool:
    """True if title is a prefix of narration that cuts a Latin/数字专有词 mid-way."""
    t = re.sub(r"\s+", "", (title or "").strip())
    full = re.sub(r"\s+", "", (full_text or "").strip())
    if not t or not full.startswith(t):
        return False
    if len(full) <= len(t):
        return False
    # Truncated mid-ASCII token: title ends with alnum and next char is alnum
    if re.search(r"[A-Za-z0-9]$", t) and re.match(r"[A-Za-z0-9]", full[len(t)]):
        return True
    # Obvious raw prefix grab of long narration
    if len(t) <= 12 and len(full) > len(t) + 8 and full.startswith(t):
        return True
    return False


def _normalize_overlay_title(title: str, text: str, shot_no: int) -> str:
    t = (title or "").strip()
    if not t or _looks_truncated_token(t, text):
        return _fallback_overlay_title(text, shot_no)
    return t[:32]


def _normalize_overlay_subtitle(subtitle: str, text: str) -> str:
    s = (subtitle or "").strip()
    if not s or _looks_truncated_token(s, text):
        return _fallback_overlay_subtitle(text)[:64]
    return s[:64]


# Soften brand / IP names that Seedream often rejects as copyright
_SEEDREAM_SANITIZE: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?i)\bspacex\b"), "民营商业航天公司"),
    (re.compile(r"(?i)\bspace\s*x\b"), "民营商业航天公司"),
    (re.compile(r"(?i)\bfalcon\s*heavy\b"), "重型运载火箭"),
    (re.compile(r"(?i)\bfalcon\s*1\b"), "首枚试验运载火箭"),
    (re.compile(r"(?i)\bfalcon\s*9\b"), "可回收运载火箭"),
    (re.compile(r"(?i)\bfalcon\b"), "试验运载火箭"),
    (re.compile(r"(?i)\bstarship\b"), "巨型运载飞船"),
    (re.compile(r"(?i)\belon\s*musk\b"), "航天企业家"),
    (re.compile(r"(?i)\btesla\b"), "电动车企业"),
    (re.compile(r"猎鹰一号"), "首枚试验运载火箭"),
    (re.compile(r"猎鹰\s*9"), "可回收运载火箭"),
    (re.compile(r"猎鹰重型"), "重型运载火箭"),
    (re.compile(r"猎鹰"), "试验运载火箭"),
    (re.compile(r"马斯克"), "航天企业家"),
    (re.compile(r"埃隆"), "航天企业家"),
    (re.compile(r"Space\s*X"), "民营商业航天公司"),
]

_SEEDREAM_STRIP_PROPER: re.Pattern[str] = re.compile(
    r"(SpaceX|Space\s*X|Falcon\s*\d*|Starship|Elon\s*Musk|Tesla|"
    r"猎鹰一号|猎鹰\s*9|猎鹰重型|猎鹰|马斯克|埃隆|特斯拉)"
)


@dataclass
class ShotPlan:
    shot: int
    duration: float
    text: str
    img_prompt: str
    video_prompt: str
    camera: str
    bgm: str
    overlay_title: str = ""
    overlay_subtitle: str = ""
    segment_script: str = ""


@dataclass
class StoryboardResult:
    shots: list[ShotPlan]
    character_bible: str = ""
    bgm_lock: str = ""


@dataclass
class TaskResult:
    status: str  # pending | running | succeeded | failed
    url: str | None = None
    last_frame_url: str | None = None
    error: str | None = None


# 从 Seedance 任务成功响应中提取尾帧 URL
def _extract_seedance_last_frame_url(data: dict[str, Any]) -> str | None:
    content = data.get("content")
    if isinstance(content, dict):
        for key in ("last_frame_url", "last_frame_image_url", "lastFrameUrl"):
            value = content.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        nested = content.get("last_frame")
        if isinstance(nested, dict):
            nested_url = nested.get("url")
            if isinstance(nested_url, str) and nested_url.strip():
                return nested_url.strip()
        if isinstance(nested, str) and nested.strip():
            return nested.strip()
    for key in ("last_frame_url", "last_frame_image_url", "lastFrameUrl"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


@dataclass
class ImageResult:
    local_url: str
    remote_url: str | None = None


class ArkGateway:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings_override = settings

    @property
    def settings(self) -> Settings:
        return self._settings_override or get_settings()

    @property
    def mock(self) -> bool:
        return self.settings.ark_mock or not self.settings.ark_api_key

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.ark_api_key}",
            "Content-Type": "application/json",
        }

    def _url(self, path: str) -> str:
        base = self.settings.ark_base_url.rstrip("/")
        if not path.startswith("/"):
            path = "/" + path
        return f"{base}{path}"

    async def chat_storyboard(
        self,
        source_text: str,
        source_type: str,
        style_prefix: str,
        llm_system_addon: str,
        duration_min: int,
        duration_max: int,
        max_shot_duration: int,
        *,
        pipeline_mode: str = "full",
        character_hint: str = "",
        extra_requirements: str = "",
        consistency_mode: str = "character",
        output_ratio: str = "16:9",
    ) -> StoryboardResult:
        if self.mock:
            return await asyncio.to_thread(
                self._mock_storyboard,
                source_text,
                source_type,
                style_prefix,
                duration_min,
                duration_max,
                pipeline_mode,
            )

        user_constraints = ""
        if (character_hint or "").strip():
            user_constraints += (
                f"用户指定人物设定（必须严格遵守，写入 character_bible）：{(character_hint or '').strip()}。"
            )
        if (extra_requirements or "").strip():
            user_constraints += f"用户其他画面要求：{(extra_requirements or '').strip()}。"

        mode = (consistency_mode or "character").strip().lower()
        if mode not in {"character", "style", "diverse"}:
            mode = "character"

        if mode == "diverse":
            if (character_hint or "").strip():
                person_rule = (
                    "character_bible：概括用户人物设定（可换具体个人，但须同类）。"
                    "【人物硬性】每镜必须出现符合用户人物设定的真人，面容清晰可见"
                    "（三分之四侧脸或浅景深半身），禁止只拍手部、后脑勺、过肩无脸或空界面无人。"
                    "img_prompt 须写清该镜人物族裔/发型/服装与可见面容角度，以及面前界面类型；各镜可换人。"
                )
            else:
                person_rule = (
                    "character_bible：填「无固定人物，各镜为独立系统/场景界面」。"
                    "每镜 img_prompt 必须写清该镜独特的界面类型、布局分区、主色与信息层级，不要粘贴人物锁定。"
                )
            consistency = (
                "必须输出严格 JSON 对象（不要数组、不要 markdown、不要代码围栏）："
                '{"character_bible":"...","shots":[...]}。'
                f"{person_rule}"
                f"视觉气质仅作底线参考（不要被其颜色绑架）：{style_prefix}。"
                f"{user_constraints}"
                "【动态规划】先分析用户内容的领域、产品形态与使用场景，再决定色板与界面类型，"
                "再拆镜；每镜对应不同操作或能力（总览、接入、工作台、流程、结果、部署、生态等）。"
                "配色与材质必须贴合内容（浅色SaaS、文档站、深色IDE、终端、架构图、白板均可），"
                "禁止默认霓虹蓝/赛博大屏/蓝紫渐变HUD，禁止各镜画面雷同，禁止待办任务清单，"
                "禁止同一仪表盘复制粘贴换字。"
            )
        elif mode == "style":
            consistency = (
                "必须输出严格 JSON 对象（不要数组、不要 markdown、不要代码围栏）："
                '{"character_bible":"...","shots":[...]}。'
                "character_bible：可简写「无固定主角」或留空说明；不要强行统一人物外形。"
                f"画风气质统一：{style_prefix}。"
                f"{user_constraints}"
                "各镜场景与构图应随内容变化，只需保持同类画风，禁止镜头间画面几乎一样。"
                "每镜 img_prompt 只写本镜场景与构图。"
            )
        else:
            consistency = (
                "必须输出严格 JSON 对象（不要数组、不要 markdown、不要代码围栏）："
                '{"character_bible":"...","shots":[...]}。'
                "character_bible：80-160字，固定描述本片反复出现的人物/主体外形"
                "（年龄感、发型发色、五官气质、体型、服装配色与辨识物），全片唯一设定，禁止每镜改人设。"
                f"画风要求（全片强制统一）：{style_prefix}。"
                f"{user_constraints}"
                "禁止镜头间混用写实摄影/真人脸与插画或动漫；禁止换脸换装换发型。"
                "每镜 img_prompt 只写本镜场景与构图（景物、动作、光影），不要重复粘贴大段画风/人物锁定原文；"
                "出现人物时用短句点出与 character_bible 一致的关键特征即可。"
            )
        # shot_cap 单镜 duration 上限（秒）；shot_lo/shot_hi 按文案字数动态拆镜数
        shot_cap = min(duration_max, max_shot_duration)
        shot_lo, shot_hi = segplan.suggested_kepu_shot_range(source_text, pipeline_mode=pipeline_mode)
        shot_range = f"{shot_lo}-{shot_hi}"
        # segment_rules 科普逐段脚本生产约束（对齐漫剧 cue，无 @asset）
        segment_rules = (
            "【segments 生产规范】"
            "segments 必填；系统会落成 @duration +【字幕】/【BGM】/【旁白·自然语速·同步字幕】生产脚本，"
            "因此 kind/text/duration 必须可直接消费。"
            "段序优先「画面→旁白」交替，首段尽量 kind=visual（保证首帧有料）；"
            "visual/action 的 text 必须含景别+主体动作+场景/界面类型，禁止空镜与模糊氛围词堆砌；"
            "narration 的 text 为一句一事、可朗读口播，按约 5 字/秒估 duration（语速自然偏快）；"
            "旁白 duration 严格跟字数，最多多 1 秒呼吸，禁止把短句拉满到镜长上限或拖腔注水；"
            "单段 duration 3-12 秒，镜内各段之和约等于本镜 duration，且不超过 "
            f"{shot_cap} 秒。"
            "禁止真实商标/公司名/人名（改用泛称）。"
            "character_bible 与 bgm_lock 全片唯一，各镜不得改人设或漂移 BGM 氛围。"
        )
        if pipeline_mode == "image_text":
            diversity_note = (
                f"拆成 {shot_range} 个分镜，每镜一个独立视觉场景；"
                + (
                    "画风气质可统一，但界面/场景构图必须明显不同。"
                    if mode != "character"
                    else "但画风与人物必须一致。"
                )
            )
            ratio = (output_ratio or "16:9").strip() or "16:9"
            orient = "竖屏" if ratio == "9:16" else ("方形" if ratio == "1:1" else "横屏")
            system = (
                f"你是{orient}图文短视频编剧。所有字段必须使用简体中文。"
                f"{consistency}{llm_system_addon}"
                f"每镜 duration 在 {duration_min}-{shot_cap} 秒。"
                "这是「静图+叠字+配音」模式：不生成 AI 视频，但需要旁白配音；"
                "画面禁止出现任何文字/水印/字幕。"
                "shots 字段说明："
                "shot(序号)、duration(秒)、"
                "title(对本镜内容的概括短标题，2-8字，语义完整有力；"
                "必须是总结提炼，禁止从 text 截取前几个字，禁止截断专有名词如 ERP→ER)、"
                "subtitle(对本镜卖点/要点的一句概括，8-22字，同样禁止原文截取前缀)、"
                "text(旁白台词，口语化，约匹配该镜时长，可供 TTS 朗读，一般 20-60 字)、"
                "segments(数组，精确到每一段：每项含 duration 秒、kind=visual|narration、text；"
                "visual 写景别与画面动作，narration 写口播)、"
                f"img_prompt({orient} {ratio} 构图画面提示词，留出边缘给文字叠层，主体居中，"
                "禁止要求画面内写字；禁止出现真实商标/公司名/人名，用泛称)、"
                "video_prompt(可留空或写轻微推拉)、camera(如：缓慢推近/轻拉远)、bgm(情绪，全片尽量同一氛围)。"
                "另输出顶层 bgm_lock(全片统一 BGM 氛围一句)。"
                f"{segment_rules}"
                f"{diversity_note}"
            )
        else:
            diversity_note = (
                f"拆成 {shot_range} 个分镜，短镜快切，各镜场景随内容变化，禁止雷同空镜。"
                if mode != "character"
                else f"画风与人物必须全片一致；拆成 {shot_range} 镜，短镜快切。"
            )
            system = (
                "你是短视频分镜编剧。所有字段必须使用简体中文"
                "（包括 title、text、img_prompt、video_prompt、camera、bgm、segments）。"
                f"{consistency}{llm_system_addon}"
                f"每镜 duration 在 {duration_min}-{shot_cap} 秒，不要为凑满上限而注水。"
                "shots 字段说明："
                "shot(序号)、duration(秒)、"
                "title(对本镜旁白的概括短标题，2-8字，语义完整；"
                "必须是总结提炼，禁止从 text 截取前缀，禁止截断专有名词如 ERP→ER)、"
                "subtitle(可选，一句要点概括 8-22字)、"
                "text(旁白台词，与 segments 中 narration 文案一致或为其摘要)、"
                "segments(必填数组，精确到每一段：每项 duration、kind=visual|narration|action、text)、"
                "img_prompt(与首段 visual 一致的中文首帧提示词，含具体景物与构图)、"
                "video_prompt(可与 segments 画面摘要一致)、"
                "camera(运镜，如：缓慢上摇/轻推/横移)、bgm(情绪，全片同一氛围)。"
                "顶层另输出 bgm_lock(全片统一 BGM 氛围一句，与各镜 bgm 一致)。"
                "img_prompt 与 video_prompt 禁止英文句子，专有名词可保留原文。"
                f"{segment_rules}"
                f"{diversity_note}"
            )
        user = (
            f"输入类型：{source_type}。请先理解内容与应用场景，再拆成精确到每一段的分镜"
            f"（{shot_range} 镜，短镜快切，禁止拖腔注水）：\n{source_text}"
        )
        content = await chat_completions(system, user, temperature=0.6, timeout=120.0)
        return self._parse_storyboard(
            content or "{}",
            style_prefix,
            duration_min,
            duration_max,
            max_shot_duration,
        )

    async def gen_image(
        self,
        prompt: str,
        negative: str = "",
        ref_urls: list[str] | None = None,
        *,
        project_id: int | None = None,
        shot_no: int | None = None,
        size: str | None = None,
        model: str | None = None,
    ) -> ImageResult:
        if self.mock:
            local = await asyncio.to_thread(self._write_mock_image, prompt, size)
            # _write_mock_image returns /static/...; publish to OSS when enabled
            path = storage.local_path_from_url(local)
            url = storage.publish_local(path) if path and path.exists() else local
            return ImageResult(local_url=url, remote_url=None)

        candidates = [
            self._sanitize_seedream_prompt(prompt),
            self._aggressive_sanitize_seedream(prompt),
            self._generic_scene_prompt(prompt),
        ]
        # de-dupe while preserving order
        seen: set[str] = set()
        prompts: list[str] = []
        for p in candidates:
            p = (p or "").strip()
            if p and p not in seen:
                seen.add(p)
                prompts.append(p)

        last_err: Exception | None = None
        for idx, base in enumerate(prompts):
            full_prompt = f"{base}。避免：{negative}" if negative else base
            try:
                return await self._seedream_once(
                    full_prompt,
                    ref_urls,
                    project_id=project_id,
                    shot_no=shot_no,
                    size=size,
                    model=model,
                    prompt_hash_src=prompt,
                )
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                msg = str(exc)
                if "PolicyViolation" in msg or "SensitiveContent" in msg:
                    logger.warning(
                        "Seedream policy hit shot=%s attempt=%s; retrying softened prompt",
                        shot_no,
                        idx + 1,
                    )
                    continue
                raise
        raise RuntimeError(str(last_err) if last_err else "Seedream failed")

    async def _seedream_once(
        self,
        full_prompt: str,
        ref_urls: list[str] | None,
        *,
        project_id: int | None,
        shot_no: int | None,
        size: str | None,
        prompt_hash_src: str,
        model: str | None = None,
    ) -> ImageResult:
        body: dict[str, Any] = {
            "model": (model or "").strip() or self.settings.model_image,
            "prompt": full_prompt,
            "size": size or self.settings.ark_image_size,
            "response_format": "url",
            "watermark": False,
        }
        from app.services.style_lock import seedream_ref_urls

        refs = seedream_ref_urls(*(ref_urls or []))
        if refs:
            body["image"] = refs if len(refs) > 1 else refs[0]

        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                self._url("/images/generations"),
                headers=self._headers(),
                json=body,
            )
            if resp.status_code >= 400:
                raise RuntimeError(f"Seedream error {resp.status_code}: {resp.text[:800]}")
            data = resp.json()

        remote = self._extract_image_url(data)
        if not remote:
            raise RuntimeError(f"Seedream missing url: {json.dumps(data)[:500]}")

        dest_dir = storage.project_dir(project_id or 0)
        name = f"shot_{(shot_no or 0):03d}_{hashlib.md5(prompt_hash_src.encode()).hexdigest()[:8]}.png"
        dest = dest_dir / name
        await storage.download_to(remote, dest)
        return ImageResult(local_url=storage.publish_local(dest), remote_url=remote)

    @staticmethod
    def _sanitize_seedream_prompt(prompt: str) -> str:
        out = prompt or ""
        for pat, repl in _SEEDREAM_SANITIZE:
            out = pat.sub(repl, out)
        return out

    @classmethod
    def _aggressive_sanitize_seedream(cls, prompt: str) -> str:
        out = cls._sanitize_seedream_prompt(prompt)
        out = _SEEDREAM_STRIP_PROPER.sub("主体", out)
        # Drop Latin brand leftovers
        out = re.sub(r"[A-Za-z]{3,}", "场景", out)
        return out

    @classmethod
    def _generic_scene_prompt(cls, prompt: str) -> str:
        """Last-resort prompt: keep style cues, drop concrete names."""
        style_bits: list[str] = []
        for key in (
            "水墨",
            "插画",
            "扁平",
            "像素",
            "剪纸",
            "粉笔",
            "拼贴",
            "竖屏",
            "电影感",
            "绘本",
            "写意",
            "概念插画",
        ):
            if key in (prompt or ""):
                style_bits.append(key)
        style = "，".join(style_bits) + "，" if style_bits else "统一插画风格，"
        return (
            f"{style}高质量画面，竖屏构图，主体偏中下，顶部留白，"
            "同一画风贯穿，禁止写实摄影与真人脸，无文字水印"
        )

    def _extract_image_url(self, data: dict[str, Any]) -> str | None:
        if "data" in data and data["data"]:
            item = data["data"][0]
            return item.get("url") or item.get("b64_json")
        if "url" in data:
            return data["url"]
        return None

    @staticmethod
    def _seedance_prompt_text(prompt: str) -> str:
        """Seedance 2.0 may require JSON text with summary_caption (BodyFormat)."""
        clean = (prompt or "").strip() or "画面轻微动态，保持主体外形稳定"
        clean = re.sub(r"\s+", " ", clean).strip()
        if clean.startswith("{"):
            try:
                obj = json.loads(clean)
                if isinstance(obj, dict):
                    if not str(obj.get("summary_caption") or "").strip():
                        obj["summary_caption"] = str(
                            obj.get("prompt") or obj.get("text") or clean
                        )[:500]
                    return json.dumps(obj, ensure_ascii=False)
            except json.JSONDecodeError:
                pass
        return json.dumps({"summary_caption": clean[:500]}, ensure_ascii=False)

    @staticmethod
    def _seedance_duration(duration: int | float) -> int:
        s = get_settings()
        lo = int(getattr(s, "seedance_duration_min", 4) or 4)
        hi = int(getattr(s, "seedance_duration_max", 30) or 30)
        return int(max(lo, min(int(round(float(duration))), hi)))

    async def gen_video_i2v(
        self,
        image_url: str,
        prompt: str,
        duration: int,
        *,
        character_consistency: bool = True,
        resolution: str = "480p",
        ratio: str | None = None,
        prompt_as_json: bool = True,
        return_last_frame: bool = True,
        generate_audio: bool = False,
    ) -> str:
        if self.mock:
            digest = hashlib.md5(f"{image_url}:{prompt}".encode()).hexdigest()[:10]
            return f"mock-task-{digest}"

        # Seedance needs a publicly reachable https image (data URI often rejected / odd errors)
        image_ref = await self._resolve_image_ref(image_url, prefer_https=True)
        # Prefer plain timed script for Seedance 2.5; JSON caption kept as fallback
        plain = (prompt or "").strip() or "画面轻微动态，保持主体外形稳定"
        text = plain if not prompt_as_json else self._seedance_prompt_text(prompt)
        # If prompt looks like manju-style script, always send plain text
        if "@duration:" in plain or "00:" in plain or plain.startswith("【"):
            text = plain
            prompt_as_json = False
        content: list[dict[str, Any]] = [
            {"type": "text", "text": text},
            {
                "type": "image_url",
                "image_url": {"url": image_ref},
                "role": "first_frame",
            },
        ]
        # 首帧/首尾帧生视频：ratio 必须省略，输出比例跟随首帧图
        # （传 ratio 会报 InvalidParameter.TaskTypeConstraint）
        body: dict[str, Any] = {
            "model": self.settings.model_video,
            "content": content,
            "duration": self._seedance_duration(duration),
            "resolution": resolution,
            "watermark": False,
            "generate_audio": bool(generate_audio),
            "return_last_frame": bool(return_last_frame),
        }
        # Do not send character_consistency — unknown fields have caused BodyFormat failures
        logger.info(
            "Seedance i2v create model=%s duration=%s resolution=%s generate_audio=%s "
            "(ratio omitted for first_frame)",
            body["model"],
            body["duration"],
            resolution,
            body["generate_audio"],
        )

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                self._url("/contents/generations/tasks"),
                headers=self._headers(),
                json=body,
            )
            if resp.status_code >= 400 and prompt_as_json:
                # Fallback: plain text prompt
                body["content"][0]["text"] = plain
                resp = await client.post(
                    self._url("/contents/generations/tasks"),
                    headers=self._headers(),
                    json=body,
                )
            if resp.status_code >= 400:
                err_text = resp.text or ""
                # 若仍因 ratio 报错（兼容旧调用残留），显式去掉再试
                if "ratio" in err_text.lower() and "ratio" in body:
                    body.pop("ratio", None)
                    resp = await client.post(
                        self._url("/contents/generations/tasks"),
                        headers=self._headers(),
                        json=body,
                    )
            if resp.status_code >= 400:
                # Last try: drop role（参考图模式，可按需带 adaptive）
                body["content"][1].pop("role", None)
                body["ratio"] = "adaptive"
                resp = await client.post(
                    self._url("/contents/generations/tasks"),
                    headers=self._headers(),
                    json=body,
                )
            if resp.status_code >= 400:
                raise RuntimeError(f"Seedance create error {resp.status_code}: {resp.text[:800]}")
            data = resp.json()

        task_id = data.get("id") or data.get("task_id")
        if not task_id:
            raise RuntimeError(f"Seedance missing task id: {data}")
        return str(task_id)

    async def _resolve_media_ref(self, media_url: str, *, prefer_https: bool = False) -> str:
        """解析图片/音频 URL 供 Seedance 拉取。"""
        return await self._resolve_image_ref(media_url, prefer_https=prefer_https)

    async def _resolve_seedance_content_items(
        self,
        items: list[dict[str, Any]],
        *,
        project_id: int = 0,
    ) -> list[dict[str, Any]]:
        resolved: list[dict[str, Any]] = []
        for item in items:
            copy = dict(item)
            if item.get("type") == "image_url":
                raw_url = (item.get("image_url") or {}).get("url") or ""
                copy["image_url"] = {
                    "url": await self._resolve_media_ref(str(raw_url), prefer_https=True)
                }
            elif item.get("type") == "audio_url":
                raw_url = (item.get("audio_url") or {}).get("url") or ""
                copy["audio_url"] = {
                    "url": await self._resolve_media_ref(str(raw_url), prefer_https=True)
                }
            resolved.append(copy)
        return resolved

    async def gen_video_seedance_body(
        self,
        body: dict[str, Any],
        *,
        project_id: int = 0,
    ) -> str:
        """提交 Seedance 多模态请求体（参考图 + reference_audio）。"""
        if self.mock:
            digest = hashlib.md5(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()[
                :10
            ]
            return f"mock-task-{digest}"

        payload = dict(body)
        content = payload.get("content")
        if isinstance(content, list):
            payload["content"] = await self._resolve_seedance_content_items(
                content,
                project_id=project_id,
            )
        payload["duration"] = self._seedance_duration(payload.get("duration", 8))

        logger.info(
            "Seedance multimodal create model=%s duration=%s items=%s",
            payload.get("model"),
            payload.get("duration"),
            len(payload.get("content") or []),
        )

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                self._url("/contents/generations/tasks"),
                headers=self._headers(),
                json=payload,
            )
            if resp.status_code >= 400:
                raise RuntimeError(f"Seedance create error {resp.status_code}: {resp.text[:800]}")
            data = resp.json()

        task_id = data.get("id") or data.get("task_id")
        if not task_id:
            raise RuntimeError(f"Seedance missing task id: {data}")
        return str(task_id)

    async def gen_and_wait_seedance_body(
        self,
        body: dict[str, Any],
        *,
        project_id: int,
        shot_no: int,
        max_attempts: int = 2,
    ) -> tuple[str, str | None]:
        """创建 Seedance 多模态任务并等待完成；返回 (本地视频 URL, 可选本地尾帧 URL)。"""
        def _is_audio_download_error(err: Exception) -> bool:
            msg = str(err)
            return "audio_url" in msg and "resource download failed" in msg

        def _strip_reference_audio(src: dict[str, Any]) -> dict[str, Any] | None:
            content = src.get("content")
            if not isinstance(content, list):
                return None
            filtered: list[dict[str, Any]] = []
            removed = False
            for item in content:
                if not isinstance(item, dict):
                    filtered.append(item)
                    continue
                if item.get("type") == "audio_url" and item.get("role") == "reference_audio":
                    removed = True
                    continue
                if item.get("type") == "text":
                    text = str(item.get("text") or "")
                    cleaned_lines = [
                        line
                        for line in text.splitlines()
                        if "参考音频" not in line
                        and "角色音色" not in line
                        and "旁白音色" not in line
                    ]
                    filtered.append({**item, "text": "\n".join(cleaned_lines).strip()})
                    continue
                filtered.append(item)
            if not removed:
                return None
            return {**src, "content": filtered}

        last_err: Exception | None = None
        fallback_body = body
        audio_fallback_used = False
        for _attempt in range(max_attempts):
            try:
                task_id = await self.gen_video_seedance_body(fallback_body, project_id=project_id)
                return await self.wait_video_assets(
                    task_id, project_id=project_id, shot_no=shot_no
                )
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                if not audio_fallback_used and _is_audio_download_error(exc):
                    stripped = _strip_reference_audio(fallback_body)
                    if stripped:
                        logger.warning(
                            "Seedance reference_audio download failed; retry without audio refs project=%s shot=%s",
                            project_id,
                            shot_no,
                        )
                        fallback_body = stripped
                        audio_fallback_used = True
        raise RuntimeError(str(last_err) if last_err else "Seedance multimodal failed")

    async def poll_task(self, task_id: str) -> TaskResult:
        if self.mock or task_id.startswith("mock-task-"):
            return TaskResult(
                status="succeeded",
                url=f"/static/mock/video_{task_id[-8:]}.mp4",
                last_frame_url=f"/static/mock/last_{task_id[-8:]}.jpg",
            )

        deadline = time.monotonic() + self.settings.ark_video_poll_timeout
        async with httpx.AsyncClient(timeout=60.0) as client:
            while time.monotonic() < deadline:
                resp = await client.get(
                    self._url(f"/contents/generations/tasks/{task_id}"),
                    headers=self._headers(),
                )
                if resp.status_code >= 400:
                    return TaskResult(status="failed", error=resp.text[:500])
                data = resp.json()
                status = str(data.get("status", "")).lower()
                if status in {"succeeded", "success"}:
                    url = None
                    content = data.get("content")
                    if isinstance(content, dict):
                        url = content.get("video_url")
                    if not url:
                        url = data.get("video_url")
                    return TaskResult(
                        status="succeeded",
                        url=url,
                        last_frame_url=_extract_seedance_last_frame_url(data),
                    )
                if status in {"failed", "cancelled", "canceled", "expired"}:
                    err = data.get("error") or data.get("message") or status
                    return TaskResult(status="failed", error=str(err))
                await asyncio.sleep(self.settings.ark_video_poll_interval)
        return TaskResult(status="failed", error="poll timeout")

    async def fetch_task_once(self, task_id: str) -> TaskResult:
        """单次查询 Seedance 任务，不阻塞等待。"""
        if self.mock or task_id.startswith("mock-task-"):
            return TaskResult(
                status="succeeded",
                url=f"/static/mock/video_{task_id[-8:]}.mp4",
                last_frame_url=f"/static/mock/last_{task_id[-8:]}.jpg",
            )
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                self._url(f"/contents/generations/tasks/{task_id}"),
                headers=self._headers(),
            )
        if resp.status_code >= 400:
            return TaskResult(status="failed", error=resp.text[:500])
        data = resp.json()
        status = str(data.get("status", "")).lower() or "running"
        if status in {"succeeded", "success"}:
            url = None
            content = data.get("content")
            if isinstance(content, dict):
                url = content.get("video_url")
            if not url:
                url = data.get("video_url")
            return TaskResult(
                status="succeeded",
                url=url,
                last_frame_url=_extract_seedance_last_frame_url(data),
            )
        if status in {"failed", "cancelled", "canceled", "expired"}:
            err = data.get("error") or data.get("message") or status
            return TaskResult(status="failed", error=str(err))
        return TaskResult(status="running")

    async def wait_video_assets(
        self,
        task_id: str,
        *,
        project_id: int,
        shot_no: int,
    ) -> tuple[str, str | None]:
        """等待任务完成并落盘视频；若有尾帧则一并落盘。"""
        result = await self.poll_task(task_id)
        if result.status != "succeeded" or not result.url:
            raise RuntimeError(result.error or "video generation failed")

        if result.url.startswith("/static/"):
            video_local = result.url
        else:
            dest = storage.project_dir(project_id) / f"shot_{shot_no:03d}.mp4"
            await storage.download_to(result.url, dest)
            video_local = storage.publish_local(dest)

        last_local: str | None = None
        if result.last_frame_url:
            try:
                if result.last_frame_url.startswith("/static/"):
                    last_local = result.last_frame_url
                else:
                    frame_dest = storage.project_dir(project_id) / f"shot_{shot_no:03d}_last.jpg"
                    await storage.download_to(result.last_frame_url, frame_dest)
                    last_local = storage.publish_local(frame_dest)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Seedance last frame download failed shot_no=%s err=%s",
                    shot_no,
                    exc,
                )
                last_local = None
        return video_local, last_local

    async def wait_video(
        self,
        task_id: str,
        *,
        project_id: int,
        shot_no: int,
    ) -> str:
        video_local, _last = await self.wait_video_assets(
            task_id, project_id=project_id, shot_no=shot_no
        )
        return video_local

    async def gen_and_wait_video(
        self,
        image_url: str,
        prompt: str,
        duration: int,
        *,
        project_id: int,
        shot_no: int,
        character_consistency: bool = True,
        resolution: str = "480p",
        ratio: str | None = None,
        max_attempts: int = 3,
        generate_audio: bool = False,
    ) -> str:
        """Create Seedance i2v task and wait; retry on summary_caption / transient BodyFormat."""
        last_err: Exception | None = None
        for attempt in range(max_attempts):
            use_json = attempt != 1  # attempt0 json, attempt1 plain, attempt2 json again
            try:
                task_id = await self.gen_video_i2v(
                    image_url,
                    prompt,
                    duration,
                    character_consistency=character_consistency,
                    resolution=resolution,
                    ratio=ratio,
                    prompt_as_json=use_json,
                    generate_audio=generate_audio,
                )
                return await self.wait_video(task_id, project_id=project_id, shot_no=shot_no)
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                msg = str(exc)
                retryable = any(
                    k in msg
                    for k in (
                        "summary_caption",
                        "BodyFormat",
                        "InvalidParameter",
                        "poll timeout",
                    )
                )
                logger.warning(
                    "Seedance attempt %s/%s shot=%s failed: %s",
                    attempt + 1,
                    max_attempts,
                    shot_no,
                    msg[:300],
                )
                if not retryable or attempt >= max_attempts - 1:
                    break
                await asyncio.sleep(1.5 * (attempt + 1))
        raise RuntimeError(str(last_err) if last_err else "video generation failed")

    def _openspeech_configured(self) -> bool:
        """豆包 openspeech 是否已配置（新版 API Key 或旧版 AppId + AccessKey）。"""
        if (self.settings.volc_tts_api_key or "").strip():
            return True
        return bool(self.settings.volc_tts_app_id and self.settings.volc_tts_access_key)

    @staticmethod
    def _build_tts_additions(speaker: str, emotion_hint: str | None) -> str | None:
        """组装 openspeech additions（S_ 克隆 + 语气 context_texts）。"""
        additions: dict[str, Any] = {}
        if speaker.startswith("S_"):
            additions["model_type"] = 4
        hint = (emotion_hint or "").strip()
        if hint:
            additions["context_texts"] = [f"用「{hint}」的语气朗读"]
        if not additions:
            return None
        return json.dumps(additions, ensure_ascii=False)

    async def tts(
        self,
        text: str,
        voice: str,
        *,
        project_id: int | None = None,
        shot_no: int | None = None,
        duration_hint: float = 4.0,
        emotion_hint: str | None = None,
    ) -> str:
        voice_map = {
            "narrator_calm": "zh_female_cancan_uranus_bigtts",
            "warm_storyteller": "zh_female_tianmeixiaoyuan_uranus_bigtts",
            "teacher_clear": "zh_male_shaonianzixin_uranus_bigtts",
            "urban_editorial": "zh_female_shuangkuaisisi_uranus_bigtts",
            "retro_host": "zh_male_shaonianzixin_uranus_bigtts",
            "guqin_narrator": "zh_female_vv_uranus_bigtts",
        }
        speaker = (
            voice_map.get(voice, voice)
            or self.settings.volc_tts_speaker
            or "zh_female_cancan_uranus_bigtts"
        )
        clean = (text or "").strip() or "这一幕。"

        if self.mock:
            digest = hashlib.md5(f"{speaker}:{clean}".encode()).hexdigest()[:8]
            dest = Path(__file__).resolve().parents[2] / "static" / "mock" / f"audio_{digest}.mp3"
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists() or dest.stat().st_size < 1000:
                await self._tts_edge(clean, dest)
            return f"/static/mock/audio_{digest}.mp3"

        dest_dir = storage.project_dir(project_id or 0)
        dest = dest_dir / f"shot_{(shot_no or 0):03d}_tts.mp3"

        async def _accept_if_audible(label: str) -> str | None:
            if not dest.exists() or dest.stat().st_size < 2000:
                return None
            if await asyncio.to_thread(is_near_silent_audio, dest):
                logger.warning("%s produced near-silence shot=%s", label, shot_no)
                return None
            return storage.publish_local(dest)

        # 1) 豆包 openspeech（X-Api-Key 或 AppId + AccessKey）
        if self._openspeech_configured():
            try:
                ok = await self._tts_openspeech(clean, speaker, dest, emotion_hint=emotion_hint)
                if ok:
                    url = await _accept_if_audible("openspeech")
                    if url:
                        return url
            except Exception as exc:  # noqa: BLE001
                logger.warning("openspeech TTS failed: %s", exc)

        # 2) edge-tts（无 openspeech 凭证时的主路径；有凭证时作兜底）
        try:
            await self._tts_edge(clean, dest, voice_hint=speaker)
            url = await _accept_if_audible("edge-tts")
            if url:
                logger.info("TTS edge-tts ok shot=%s bytes=%s", shot_no, dest.stat().st_size)
                return url
        except Exception as exc:  # noqa: BLE001
            logger.warning("edge-tts failed: %s", exc)

        # 3) 旧 Ark /audio/speech（多数账号 404，保留兼容）
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    self._url("/audio/speech"),
                    headers=self._headers(),
                    json={
                        "model": self.settings.model_audio,
                        "input": clean,
                        "voice": speaker,
                        "response_format": "mp3",
                    },
                )
                if resp.status_code < 400 and resp.content and len(resp.content) > 1000:
                    dest.write_bytes(resp.content)
                    url = await _accept_if_audible("ark-speech")
                    if url:
                        return url
                logger.warning("Ark TTS HTTP %s: %s", resp.status_code, (resp.text or "")[:300])
        except Exception as exc:  # noqa: BLE001
            logger.warning("Ark TTS failed: %s", exc)

        # 最后才静音（保证合成不中断）
        logger.error("TTS all providers failed; writing silence shot=%s", shot_no)
        await asyncio.to_thread(self._write_silence_mp3, dest, duration_hint)
        return storage.publish_local(dest)

    def _tts_resource_id(self, speaker: str) -> str:
        if speaker.startswith("S_"):
            return "seed-icl-2.0"
        if "_uranus_" in speaker or speaker.startswith("saturn_"):
            return self.settings.volc_tts_resource_id or "seed-tts-2.0"
        return "seed-tts-1.0"

    async def _tts_openspeech(
        self,
        text: str,
        speaker: str,
        dest: Path,
        *,
        emotion_hint: str | None = None,
    ) -> bool:
        resource = self._tts_resource_id(speaker)
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "X-Api-Resource-Id": resource,
        }
        api_key = (self.settings.volc_tts_api_key or "").strip()
        if api_key:
            headers["X-Api-Key"] = api_key
        else:
            headers["X-Api-App-Id"] = self.settings.volc_tts_app_id
            headers["X-Api-Access-Key"] = self.settings.volc_tts_access_key
        body: dict[str, Any] = {
            "user": {"uid": "framecut"},
            "req_params": {
                "text": text,
                "speaker": speaker,
                "audio_params": {"format": "mp3", "sample_rate": 24000},
            },
        }
        additions = self._build_tts_additions(speaker, emotion_hint)
        if additions:
            body["req_params"]["additions"] = additions

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(self.settings.volc_tts_url, headers=headers, json=body)
            if resp.status_code >= 400:
                logger.warning("openspeech HTTP %s: %s", resp.status_code, resp.text[:400])
                return False
            audio = self._parse_openspeech_ndjson(resp.content)
            if not audio:
                logger.warning("openspeech empty audio body")
                return False
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(audio)
            return True

    @staticmethod
    def _parse_openspeech_ndjson(raw: bytes) -> bytes:
        chunks: list[bytes] = []
        text = raw.decode("utf-8", errors="ignore")
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            code = obj.get("code")
            if code == 0 and obj.get("data"):
                chunks.append(base64.b64decode(obj["data"]))
            elif code in {20000000, 20000001}:
                break
            elif code not in (None, 0):
                logger.warning("openspeech line error: %s", line[:300])
        return b"".join(chunks)

    async def _tts_edge(self, text: str, dest: Path, voice_hint: str = "") -> None:
        import edge_tts

        # Map rough gender from hint → Edge neural voice
        female = "zh-CN-XiaoxiaoNeural"
        male = "zh-CN-YunxiNeural"
        voice = male if "male" in (voice_hint or "").lower() or "男" in voice_hint else female
        dest.parent.mkdir(parents=True, exist_ok=True)
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(dest))

    def _write_silence_mp3(self, dest: Path, duration: float) -> None:
        import shutil
        import subprocess

        ffmpeg = shutil.which(self.settings.ffmpeg_path) or shutil.which("ffmpeg")
        if not ffmpeg:
            dest.write_bytes(b"")
            return
        dest.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=44100:cl=mono",
                "-t",
                f"{max(duration, 0.5):.3f}",
                "-q:a",
                "9",
                "-acodec",
                "libmp3lame",
                str(dest),
            ],
            capture_output=True,
            check=False,
        )

    async def _resolve_image_ref(self, image_url: str, *, prefer_https: bool = False) -> str:
        raw = (image_url or "").strip()
        if raw.startswith("https://"):
            return raw
        if raw.startswith("http://"):
            # Ark cloud cannot fetch LAN/localhost; keep only if public host
            host = (urlparse(raw).hostname or "").lower()
            if host and host not in {"localhost", "127.0.0.1", "::1"} and not host.startswith(
                ("192.168.", "10.")
            ):
                return raw
        if prefer_https:
            # Seedance 2.0: 需要公网 https；本地 /static 先同步上 OSS
            local = storage.local_path_from_url(raw)
            if local and local.exists():
                public = storage.republish_url(raw, sync=True)
                if public and str(public).startswith("https://"):
                    return str(public)
                raise RuntimeError(
                    "Seedance 需要公网可访问的图片 URL（请启用 OSS 并确保参考图已上传），"
                    "本地 /static 图无法被方舟拉取"
                )
            if raw.startswith("data:"):
                raise RuntimeError("Seedance 不支持 data URI 图片，请使用 Ark CDN https 链接")
        if raw.startswith("http://") or raw.startswith("https://") or raw.startswith("data:"):
            return raw
        local = storage.local_path_from_url(raw)
        if local and local.exists():
            # Prefer data URI so Seedance can read without public CDN
            return storage.file_to_data_uri(local)
        # Last resort: absolute local public URL (only works if Ark can reach your machine)
        return storage.to_public_url(raw)

    def _write_mock_image(self, prompt: str, size: str | None = None) -> str:
        digest = hashlib.md5(prompt.encode()).hexdigest()[:8]
        root = Path(__file__).resolve().parents[2] / "static" / "mock"
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"image_{digest}.svg"
        hue = int(digest[:2], 16)
        label = (prompt[:42] + "…") if len(prompt) > 42 else prompt
        safe = (
            label.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )
        # Portrait mock for image_text / 9:16
        portrait = bool(size and ("x" in size.lower()) and self._is_portrait_size(size))
        w, h = (720, 1280) if portrait else (960, 540)
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl({hue},28%,22%)"/>
      <stop offset="100%" stop-color="hsl({(hue + 40) % 360},22%,38%)"/>
    </linearGradient>
  </defs>
  <rect width="{w}" height="{h}" fill="url(#g)"/>
  <rect x="{int(w*0.08)}" y="{int(h*0.28)}" width="{int(w*0.4)}" height="{int(h*0.28)}" rx="10" fill="hsl({(hue + 20) % 360},35%,72%)" opacity="0.9"/>
  <circle cx="{int(w*0.72)}" cy="{int(h*0.38)}" r="{int(w*0.14)}" fill="hsl({(hue + 80) % 360},30%,65%)" opacity="0.55"/>
  <text x="{int(w*0.08)}" y="{int(h*0.78)}" fill="#f2ebe0" font-family="Georgia, serif" font-size="28">Mock Storyboard</text>
  <text x="{int(w*0.08)}" y="{int(h*0.84)}" fill="#d7cfc3" font-family="sans-serif" font-size="18">{safe}</text>
</svg>"""
        path.write_text(svg, encoding="utf-8")
        return f"/static/mock/image_{digest}.svg"

    @staticmethod
    def _is_portrait_size(size: str) -> bool:
        m = re.match(r"^(\d+)x(\d+)$", size.strip().lower())
        if not m:
            return False
        return int(m.group(2)) > int(m.group(1))

    def _mock_storyboard(
        self,
        source_text: str,
        source_type: str,
        style_prefix: str,
        duration_min: int,
        duration_max: int,
        pipeline_mode: str = "full",
    ) -> StoryboardResult:
        chunks = [c.strip() for c in re.split(r"[。！？\n\.\!\?]+", source_text) if c.strip()]
        if source_type == "theme" and len(chunks) <= 1:
            topic = source_text.strip()
            chunks = [
                f"引入主题：{topic}",
                f"核心概念解释：{topic}",
                f"一个关键例子说明{topic}",
                f"常见误解与澄清",
                f"总结与启发",
            ]
        if len(chunks) < 3:
            chunks = chunks + ["补充画面过渡", "收尾总结"]
        # shot_lo/shot_hi 与正式拆镜区间一致，避免 mock 仍只出 5 镜
        shot_lo, shot_hi = segplan.suggested_kepu_shot_range(source_text, pipeline_mode=pipeline_mode)
        chunks = chunks[:shot_hi]
        while len(chunks) < shot_lo:
            chunks.append("补充画面过渡")
        mid = (duration_min + duration_max) // 2
        if pipeline_mode == "image_text":
            mid = min(mid, max(duration_min, 3))
        bible = (
            f"统一角色：与「{source_text.strip()[:24]}」相关的核心人物，"
            "中等身材，简洁服饰配色固定，五官清晰可辨，全片外形不变"
        )
        bgm_lock = segplan.infer_bgm_mood(source_text, style_prefix)
        plans: list[ShotPlan] = []
        for i, text in enumerate(chunks, start=1):
            # Mock: invent short summary titles, do not slice narration mid-token
            topic_bit = re.sub(r"^(引入主题|核心概念解释|一个关键例子说明)[：:]?", "", text).strip()
            title = f"要点{i}" if len(topic_bit) > 10 else (topic_bit[:8] or f"场景{i}")
            if "：" in text or ":" in text:
                title = text.split("：", 1)[0].split(":", 1)[0][-6:] or title
            subtitle = _fallback_overlay_subtitle(text)
            img = f"{style_prefix}，{bible}，画面表现：{text[:80]}，竖屏构图，顶部留白，画面无文字"
            beats = [
                segplan.SegmentBeat(duration=segplan.estimate_visual_duration(img), kind="visual", text=img),
                segplan.SegmentBeat(
                    duration=segplan.estimate_narration_duration(text),
                    kind="narration",
                    text=text[:120],
                ),
            ]
            script = segplan.build_segment_script(beats, bgm_mood=bgm_lock, max_total=min(duration_max, 30))
            dur = float(segplan.resolve_api_duration(script, fallback=mid, lo=duration_min, hi=duration_max))
            plans.append(
                ShotPlan(
                    shot=i,
                    duration=dur,
                    text=text[:120],
                    overlay_title=_normalize_overlay_title(title, text, i),
                    overlay_subtitle=_normalize_overlay_subtitle(subtitle, text),
                    img_prompt=img,
                    video_prompt=script,
                    segment_script=script,
                    camera="缓慢推近" if i % 2 else "轻拉远",
                    bgm=bgm_lock,
                )
            )
        return StoryboardResult(shots=plans, character_bible=bible, bgm_lock=bgm_lock)

    def _parse_storyboard(
        self,
        content: str,
        style_prefix: str,
        duration_min: int,
        duration_max: int,
        max_shot_duration: int,
    ) -> StoryboardResult:
        raw = content.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        data = json.loads(raw)
        character_bible = ""
        bgm_lock = ""
        items = data
        if isinstance(data, dict):
            character_bible = str(
                data.get("character_bible") or data.get("characters") or data.get("cast") or ""
            ).strip()
            bgm_lock = str(data.get("bgm_lock") or data.get("bgm") or "").strip()
            items = data.get("shots") or data.get("storyboard") or data.get("scenes") or []
        if not isinstance(items, list):
            raise RuntimeError("LLM storyboard JSON 格式无效：需要 shots 数组")
        hi = min(duration_max, max_shot_duration)
        plans: list[ShotPlan] = []
        for i, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or item.get("audio_text") or f"镜头{i}")
            title = str(item.get("title") or item.get("overlay_title") or "").strip()
            subtitle = str(item.get("subtitle") or item.get("overlay_subtitle") or "").strip()
            title = _normalize_overlay_title(title, text, i)
            subtitle = _normalize_overlay_subtitle(subtitle, text)
            img = str(item.get("img_prompt") or f"{text}")
            camera = str(item.get("camera", "缓慢横移"))
            bgm = str(item.get("bgm") or item.get("bgm_mood") or bgm_lock or "平稳")
            if not bgm_lock:
                bgm_lock = bgm
            beats = segplan.parse_beats_from_llm_shot(item, narration_fallback=text)
            script = segplan.build_segment_script(beats, bgm_mood=bgm_lock or bgm, max_total=hi)
            narr = segplan.narration_from_script(script) or text
            visual = segplan.first_visual_prompt(script) or img
            dur = float(
                segplan.resolve_api_duration(
                    script,
                    fallback=float(item.get("duration", (duration_min + duration_max) / 2)),
                    lo=duration_min,
                    hi=hi,
                )
            )
            plans.append(
                ShotPlan(
                    shot=int(item.get("shot", i)),
                    duration=dur,
                    text=narr,
                    overlay_title=title,
                    overlay_subtitle=subtitle,
                    img_prompt=visual,
                    video_prompt=script,
                    segment_script=script,
                    camera=camera,
                    bgm=bgm_lock or bgm,
                )
            )
        if not bgm_lock and plans:
            bgm_lock = plans[0].bgm
        return StoryboardResult(
            shots=plans,
            character_bible=character_bible,
            bgm_lock=bgm_lock or segplan.infer_bgm_mood(style_prefix),
        )

    async def expand_content(self, topic: str, mode: str = "theme") -> dict[str, str]:
        """Expand a short topic into title + theme brief or full narration script."""
        topic = (topic or "").strip() or "人工智能如何改变日常生活"
        mode = "script" if mode == "script" else "theme"
        if self.mock:
            return self._mock_expand_content(topic, mode)

        if mode == "script":
            system = (
                "你是科普短视频文案作者。根据用户主题写一篇可直接用于旁白的完整口播文案。"
                "只输出严格 JSON：{\"title\":\"作品名\",\"content\":\"完整文案\"}。"
                "title：8-18 字，吸引人、无标点堆砌。"
                "content：300-700 字，口语化，分 4-8 个自然段，有开场钩子、知识点、收尾；"
                "不要 markdown、不要分镜编号、不要标题行。"
            )
        else:
            system = (
                "你是科普短视频选题策划。把用户输入扩写成一句清晰具体的创作主题。"
                "只输出严格 JSON：{\"title\":\"作品名\",\"content\":\"主题句\"}。"
                "title：8-18 字。"
                "content：一句话主题，40-90 字，写清受众与要讲清的核心知识点；不要换行。"
            )
        content = await chat_completions(
            system,
            f"主题/素材：{topic}",
            temperature=0.6,
            max_tokens=4096,
            timeout=90.0,
        )
        return self._parse_expand_content(content or "{}", topic, mode)

    def _mock_expand_content(self, topic: str, mode: str) -> dict[str, str]:
        short = topic[:18].rstrip("？?。.!！") or "科普短片"
        title = short if len(short) >= 4 else f"{short}的科普"
        if mode == "script":
            content = (
                f"你有没有想过：{topic.rstrip('？?')}？\n\n"
                f"今天我们用三分钟，把这件事讲清楚。"
                f"先从生活里最常见的现象说起，再拆开背后的原理，最后给你一个好记的结论。\n\n"
                f"很多人第一反应会想当然，但真正关键在于因果链条，而不是表象。"
                f"弄懂这一点，你就能解释身边更多类似的问题。\n\n"
                f"记住：观察现象、追问机制、再用例子验证。"
                f"下一次再遇到{short}相关话题，你也能自信地讲给别人听。"
            )
        else:
            content = (
                f"{topic.rstrip('？?')}：面向普通观众，用生活例子讲清核心原理与常见误区。"
            )[:100]
        return {"title": title[:24], "content": content}

    def _parse_expand_content(self, raw: str, topic: str, mode: str) -> dict[str, str]:
        text = (raw or "").strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            m = re.search(r"\{[\s\S]*\}", text)
            if not m:
                return self._mock_expand_content(topic, mode)
            try:
                data = json.loads(m.group(0))
            except json.JSONDecodeError:
                return self._mock_expand_content(topic, mode)
        title = str(data.get("title") or "").strip() or topic[:18]
        content = str(data.get("content") or "").strip()
        if not content:
            return self._mock_expand_content(topic, mode)
        if mode == "theme":
            content = content.replace("\n", " ").strip()[:100]
        else:
            content = content[:8000]
        return {"title": title[:24], "content": content}


_gateway: ArkGateway | None = None


def get_ark() -> ArkGateway:
    global _gateway
    if _gateway is None:
        _gateway = ArkGateway()
    return _gateway


def reset_ark() -> None:
    global _gateway
    _gateway = None
