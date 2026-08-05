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

import httpx

from app.config import Settings, get_settings
from app.services import storage
from app.services.ffmpeg_compose import is_near_silent_audio

logger = logging.getLogger(__name__)

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


@dataclass
class StoryboardResult:
    shots: list[ShotPlan]
    character_bible: str = ""


@dataclass
class TaskResult:
    status: str  # pending | running | succeeded | failed
    url: str | None = None
    error: str | None = None


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
        if pipeline_mode == "image_text":
            system = (
                "你是竖屏图文短视频编剧。所有字段必须使用简体中文。"
                f"{consistency}{llm_system_addon}"
                f"每镜 duration 在 {duration_min}-{min(duration_max, max_shot_duration)} 秒。"
                "这是「静图+叠字+配音」模式：不生成 AI 视频，但需要旁白配音；"
                "画面禁止出现任何文字/水印/字幕。"
                "shots 字段说明："
                "shot(序号)、duration(秒)、title(画面顶部大标题，2-8字，有力)、"
                "subtitle(画面顶部副标题叠字，8-22字，可诗意)、"
                "text(旁白台词，口语化，约匹配该镜时长，可供 TTS 朗读，一般 20-60 字)、"
                "img_prompt(竖屏构图画面提示词，留出顶部约1/4给文字叠层，主体偏中下，"
                "含统一画风与人物锁定，禁止要求画面内写字；"
                "禁止出现真实商标/公司名/人名，用泛称)、"
                "video_prompt(可留空或写轻微推拉)、camera(如：缓慢推近/轻拉远)、bgm(情绪)。"
                "拆成 5-10 个分镜，每镜一个独立视觉场景，但画风与人物必须一致。"
            )
        else:
            system = (
                "你是短视频分镜编剧。所有字段必须使用简体中文"
                "（包括 text、img_prompt、video_prompt、camera、bgm）。"
                f"{consistency}{llm_system_addon}"
                f"每镜 duration 在 {duration_min}-{min(duration_max, max_shot_duration)} 秒。"
                "shots 字段说明："
                "shot(序号)、duration(秒)、text(旁白台词)、"
                "img_prompt(画面生成中文提示词，含统一画风与人物锁定与具体景物；"
                "禁止真实商标/公司名/人名，改用泛称)、"
                "video_prompt(镜头运动与动态的中文提示词)、"
                "camera(运镜，如：缓慢上摇/轻推/横移)、bgm(情绪，如：紧张平缓)。"
                "img_prompt 与 video_prompt 禁止英文句子，专有名词可保留原文。"
            )
        user = f"输入类型：{source_type}。内容如下，请拆成 4-10 个分镜：\n{source_text}"
        payload = {
            "model": self.settings.model_llm,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                self._url("/chat/completions"),
                headers=self._headers(),
                json=payload,
            )
            if resp.status_code >= 400:
                raise RuntimeError(f"LLM error {resp.status_code}: {resp.text[:800]}")
            data = resp.json()
        content = data["choices"][0]["message"]["content"] or "{}"
        return self._parse_storyboard(content, style_prefix, duration_min, duration_max, max_shot_duration)

    async def gen_image(
        self,
        prompt: str,
        negative: str = "",
        ref_urls: list[str] | None = None,
        *,
        project_id: int | None = None,
        shot_no: int | None = None,
        size: str | None = None,
    ) -> ImageResult:
        if self.mock:
            local = await asyncio.to_thread(self._write_mock_image, prompt, size)
            return ImageResult(local_url=local, remote_url=None)

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
    ) -> ImageResult:
        body: dict[str, Any] = {
            "model": self.settings.model_image,
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
        return ImageResult(local_url=storage.rel_static_url(dest), remote_url=remote)

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

    async def gen_video_i2v(
        self,
        image_url: str,
        prompt: str,
        duration: int,
        *,
        character_consistency: bool = True,
        resolution: str = "480p",
        ratio: str | None = None,
    ) -> str:
        if self.mock:
            digest = hashlib.md5(f"{image_url}:{prompt}".encode()).hexdigest()[:10]
            return f"mock-task-{digest}"

        # Seedance needs reachable image: prefer http(s), else data URI from local file
        image_ref = await self._resolve_image_ref(image_url)
        content: list[dict[str, Any]] = [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image_ref}},
        ]
        body: dict[str, Any] = {
            "model": self.settings.model_video,
            "content": content,
            "duration": int(max(2, min(duration, self.settings.max_shot_duration))),
            "ratio": ratio or self.settings.ark_video_ratio,
            "resolution": resolution,
            "watermark": False,
            "generate_audio": False,
        }
        # Optional consistency flag — ignored if API rejects unknown fields
        if character_consistency:
            body["character_consistency"] = True

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                self._url("/contents/generations/tasks"),
                headers=self._headers(),
                json=body,
            )
            if resp.status_code >= 400:
                # Retry without character_consistency if rejected
                body.pop("character_consistency", None)
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

    async def poll_task(self, task_id: str) -> TaskResult:
        if self.mock or task_id.startswith("mock-task-"):
            return TaskResult(status="succeeded", url=f"/static/mock/video_{task_id[-8:]}.mp4")

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
                    return TaskResult(status="succeeded", url=url)
                if status in {"failed", "cancelled", "canceled", "expired"}:
                    err = data.get("error") or data.get("message") or status
                    return TaskResult(status="failed", error=str(err))
                await asyncio.sleep(self.settings.ark_video_poll_interval)
        return TaskResult(status="failed", error="poll timeout")

    async def wait_video(
        self,
        task_id: str,
        *,
        project_id: int,
        shot_no: int,
    ) -> str:
        result = await self.poll_task(task_id)
        if result.status != "succeeded" or not result.url:
            raise RuntimeError(result.error or "video generation failed")
        if result.url.startswith("/static/"):
            return result.url
        dest = storage.project_dir(project_id) / f"shot_{shot_no:03d}.mp4"
        await storage.download_to(result.url, dest)
        return storage.rel_static_url(dest)

    async def tts(
        self,
        text: str,
        voice: str,
        *,
        project_id: int | None = None,
        shot_no: int | None = None,
        duration_hint: float = 4.0,
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
            return storage.rel_static_url(dest)

        # 1) 豆包 openspeech（需 APP ID + Access Key）
        if self.settings.volc_tts_app_id and self.settings.volc_tts_access_key:
            try:
                ok = await self._tts_openspeech(clean, speaker, dest)
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
        return storage.rel_static_url(dest)

    def _tts_resource_id(self, speaker: str) -> str:
        if speaker.startswith("S_"):
            return "seed-icl-2.0"
        if "_uranus_" in speaker or speaker.startswith("saturn_"):
            return self.settings.volc_tts_resource_id or "seed-tts-2.0"
        return "seed-tts-1.0"

    async def _tts_openspeech(self, text: str, speaker: str, dest: Path) -> bool:
        resource = self._tts_resource_id(speaker)
        headers = {
            "Content-Type": "application/json",
            "X-Api-App-Id": self.settings.volc_tts_app_id,
            "X-Api-Access-Key": self.settings.volc_tts_access_key,
            "X-Api-Resource-Id": resource,
        }
        body: dict[str, Any] = {
            "user": {"uid": "framecut"},
            "req_params": {
                "text": text,
                "speaker": speaker,
                "audio_params": {"format": "mp3", "sample_rate": 24000},
            },
        }
        if speaker.startswith("S_"):
            body["req_params"]["additions"] = json.dumps({"model_type": 4}, ensure_ascii=False)

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

    async def _resolve_image_ref(self, image_url: str) -> str:
        if image_url.startswith("http://") or image_url.startswith("https://") or image_url.startswith("data:"):
            return image_url
        local = storage.local_path_from_url(image_url)
        if local and local.exists():
            # Prefer data URI so Seedance can read without public CDN
            return storage.file_to_data_uri(local)
        # Last resort: absolute local public URL (only works if Ark can reach your machine)
        return storage.to_public_url(image_url)

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
        chunks = chunks[:10]
        mid = (duration_min + duration_max) // 2
        if pipeline_mode == "image_text":
            mid = min(mid, max(duration_min, 3))
        bible = (
            f"统一角色：与「{source_text.strip()[:24]}」相关的核心人物，"
            "中等身材，简洁服饰配色固定，五官清晰可辨，全片外形不变"
        )
        plans: list[ShotPlan] = []
        for i, text in enumerate(chunks, start=1):
            title = text[:6].replace("：", "").replace(":", "")
            subtitle = text[:22]
            if pipeline_mode == "image_text":
                title = re.sub(r"^(引入主题|核心概念解释|一个关键例子说明)", "", text)[:8] or f"场景{i}"
                subtitle = text[:22]
            plans.append(
                ShotPlan(
                    shot=i,
                    duration=float(mid),
                    text=text[:120],
                    overlay_title=title[:16],
                    overlay_subtitle=subtitle[:48],
                    img_prompt=f"{style_prefix}，{bible}，画面表现：{text[:80]}，竖屏构图，顶部留白，画面无文字",
                    video_prompt=f"轻微动态，{style_prefix}，场景：{text[:60]}",
                    camera="缓慢推近" if i % 2 else "轻拉远",
                    bgm="好奇引入" if i == 1 else "平稳推进",
                )
            )
        return StoryboardResult(shots=plans, character_bible=bible)

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
        items = data
        if isinstance(data, dict):
            character_bible = str(
                data.get("character_bible") or data.get("characters") or data.get("cast") or ""
            ).strip()
            items = data.get("shots") or data.get("storyboard") or data.get("scenes") or []
        if not isinstance(items, list):
            raise RuntimeError("LLM storyboard JSON 格式无效：需要 shots 数组")
        plans: list[ShotPlan] = []
        for i, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            dur = float(item.get("duration", (duration_min + duration_max) / 2))
            dur = max(duration_min, min(dur, duration_max, max_shot_duration))
            text = str(item.get("text") or item.get("audio_text") or f"镜头{i}")
            title = str(item.get("title") or item.get("overlay_title") or "").strip()
            subtitle = str(item.get("subtitle") or item.get("overlay_subtitle") or "").strip()
            if not title:
                title = text[:8]
            if not subtitle:
                subtitle = text[:22]
            img = str(item.get("img_prompt") or f"{text}")
            # Keep raw scene text; style/character applied later at image gen
            video = str(item.get("video_prompt") or f"轻微动态，{text}")
            plans.append(
                ShotPlan(
                    shot=int(item.get("shot", i)),
                    duration=dur,
                    text=text,
                    overlay_title=title[:32],
                    overlay_subtitle=subtitle[:64],
                    img_prompt=img,
                    video_prompt=video,
                    camera=str(item.get("camera", "缓慢横移")),
                    bgm=str(item.get("bgm") or item.get("bgm_mood") or "平稳"),
                )
            )
        return StoryboardResult(shots=plans, character_bible=character_bible)


_gateway: ArkGateway | None = None


def get_ark() -> ArkGateway:
    global _gateway
    if _gateway is None:
        _gateway = ArkGateway()
    return _gateway


def reset_ark() -> None:
    global _gateway
    _gateway = None
