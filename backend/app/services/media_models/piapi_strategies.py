"""PiAPI 专属图片 / 视频模型策略（统一任务接口 /api/v1/task）。

每个类只声明能力边界（分辨率档、时长、参考素材上限）；请求体转换在
`app/services/piapi/image_tasks.py`、`app/services/piapi/video_tasks.py`。
GPT Image 走 PiAPI 另一套 /images/generations 接口并返回 base64，暂未接入；
OmniHuman / Kling Avatar（需音频驱动）、Kling Omni 也未接入。
"""

from __future__ import annotations

from .strategies import ImageModelStrategy, Kling30Strategy, Veo31Strategy, VideoModelStrategy


class NanoBananaProStrategy(ImageModelStrategy):
    """Gemini Nano Banana Pro：原生 1K/2K/4K，最多 14 张参考图。"""
    model_id = "nano-banana-pro"
    resolutions = ("1K", "2K", "4K")
    max_reference_images = 14


class NanoBanana2Strategy(NanoBananaProStrategy):
    model_id = "nano-banana-2"


class NanoBanana21Strategy(NanoBananaProStrategy):
    model_id = "nano-banana-2.1"


class GeminiFlashImageStrategy(ImageModelStrategy):
    """Gemini 2.5 Flash Image：上游无分辨率参数，按 1K 计。"""
    model_id = "gemini-2.5-flash-image"
    resolutions = ("1K",)


class SeedreamLiteStrategy(ImageModelStrategy):
    """PiAPI Seedream 5 Lite：只有 2K / 3K 两档。"""
    model_id = "seedream-5.0-lite"
    resolutions = ("2K", "3K")
    default_resolution = "2K"


class QwenImageStrategy(ImageModelStrategy):
    """Qwen Image：文生图约 1MP；带参考图走 image-edit，最多 3 张。"""
    model_id = "qwen-image"
    resolutions = ("1K",)
    max_reference_images = 3


class QwenImage21Strategy(ImageModelStrategy):
    """Qwen Image 2.1：只支持文生图，面积上限约 1.76MP。"""
    model_id = "qwen-image-2.1"
    resolutions = ("1K",)
    max_reference_images = 0


class ZImageStrategy(ImageModelStrategy):
    """Z-Image：只支持文生图，单边不超过 1440。"""
    model_id = "z-image"
    resolutions = ("1K",)
    max_reference_images = 0


class MiniMaxImageStrategy(ImageModelStrategy):
    """MiniMax image-01：只支持文生图，单边 512–2048。"""
    model_id = "minimax-image-01"
    resolutions = ("1K", "2K")
    max_reference_images = 0


PIAPI_IMAGE_STRATEGIES = (
    NanoBananaProStrategy, NanoBanana2Strategy, NanoBanana21Strategy, GeminiFlashImageStrategy,
    SeedreamLiteStrategy, QwenImageStrategy, QwenImage21Strategy, ZImageStrategy, MiniMaxImageStrategy,
)


class _PiapiVideoStrategy(VideoModelStrategy):
    """PiAPI 视频默认：只认首帧（部分模型带尾帧），不收参考音视频，不生成声音。"""
    max_reference_images = 1
    max_reference_audios = 0
    max_reference_videos = 0
    supports_generate_audio = False


class Seedance20MiniStrategy(VideoModelStrategy):
    """Seedance 2.0 Mini（PiAPI）：最高 720p。id 不用 seedance-2.0-mini，那个是 TokenFree 停用别名。"""
    model_id = "seedance-2-mini"


class Kling40FlashStrategy(Kling30Strategy):
    """Kling 4.0 Flash：只有 std(720p)，3–20 秒，不支持尾帧。"""
    model_id = "kling-4.0-flash"
    resolutions = ("720p",)
    duration_max = 20
    max_reference_images = 1


class Kling30TurboStrategy(Kling30Strategy):
    model_id = "kling-3.0-turbo"


class Kling26Strategy(Kling30Strategy):
    """Kling 2.6：只有 5 / 10 秒两档（提交时取近的一档），1080p 为 pro。"""
    model_id = "kling-2.6"
    duration_min = 5
    duration_max = 10
    duration_choices = (5, 10)


class Kling25Strategy(Kling26Strategy):
    model_id = "kling-2.5"


class Kling21Strategy(Kling26Strategy):
    model_id = "kling-2.1"


class Veo3Strategy(Veo31Strategy):
    """Veo 3：只做文生 / 首帧图生，没有参考图模式。"""
    model_id = "veo3"
    max_reference_images = 1


class Veo3FastStrategy(Veo3Strategy):
    model_id = "veo3-fast"


class Wan26Strategy(_PiapiVideoStrategy):
    """Wan 2.6：5 / 10 / 15 秒，720p / 1080p，可带声音；有首帧走图生视频。"""
    model_id = "wan-2.6"
    resolutions = ("720p", "1080p")
    default_resolution = "720p"
    ratios = ("16:9", "9:16", "1:1")
    duration_min = 5
    duration_max = 15
    duration_choices = (5, 10, 15)
    supports_generate_audio = True


class Wan22Strategy(_PiapiVideoStrategy):
    """Wan 2.2（WanX 14B）：固定约 5 秒 720p，按条计费。"""
    model_id = "wan-2.2"
    resolutions = ("720p",)
    ratios = ("16:9", "9:16")
    duration_min = 5
    duration_max = 5


class Wan21Strategy(Wan22Strategy):
    """Wan 2.1（WanX 14B）：固定约 5 秒 480p。"""
    model_id = "wan-2.1"
    resolutions = ("480p",)


class Hailuo23Strategy(_PiapiVideoStrategy):
    """Hailuo 2.3：6 / 10 秒，768p / 1080p（1080p 只能 6 秒）。"""
    model_id = "hailuo-2.3"
    resolutions = ("768p", "1080p")
    default_resolution = "768p"
    duration_min = 6
    duration_max = 10
    duration_choices = (6, 10)


    def normalize_and_validate(self, params):
        """1080p 上游只出 6 秒：在校验时就改成 6，计费与成片一致。"""
        out = super().normalize_and_validate(params)
        if out["resolution"] == "1080p":
            out["duration"] = 6
        return out


class Hailuo23FastStrategy(Hailuo23Strategy):
    model_id = "hailuo-2.3-fast"


class HunyuanStrategy(_PiapiVideoStrategy):
    """Hunyuan Video：固定约 5 秒，按条计费；有首帧走 img2video-concat。"""
    model_id = "hunyuan-video"
    resolutions = ("720p",)
    duration_min = 5
    duration_max = 5


class HunyuanFastStrategy(HunyuanStrategy):
    """Hunyuan 快速档：只做文生视频。"""
    model_id = "hunyuan-video-fast"
    max_reference_images = 0


class LumaRay2Strategy(_PiapiVideoStrategy):
    """Luma Ray 2：5 / 9 秒，支持首尾帧。"""
    model_id = "luma-ray-2"
    resolutions = ("720p",)
    ratios = ("16:9", "9:16", "1:1")
    duration_min = 5
    duration_max = 9
    duration_choices = (5, 9)
    max_reference_images = 2


class SkyReelsStrategy(_PiapiVideoStrategy):
    """SkyReels：只做图生视频（必须有首帧），固定约 5 秒。"""
    model_id = "skyreels"
    resolutions = ("720p",)
    duration_min = 5
    duration_max = 5


class FramePackStrategy(_PiapiVideoStrategy):
    """FramePack：只做图生视频（首帧必填，可带尾帧），10–30 秒长镜头。"""
    model_id = "framepack"
    resolutions = ("480p",)
    duration_min = 10
    duration_max = 30
    max_reference_images = 2


PIAPI_VIDEO_STRATEGIES = (
    Seedance20MiniStrategy, Kling40FlashStrategy, Kling30TurboStrategy, Kling26Strategy, Kling25Strategy,
    Kling21Strategy, Veo3Strategy, Veo3FastStrategy, Wan26Strategy, Wan22Strategy, Wan21Strategy,
    Hailuo23Strategy, Hailuo23FastStrategy, HunyuanStrategy, HunyuanFastStrategy, LumaRay2Strategy,
    SkyReelsStrategy, FramePackStrategy,
)
