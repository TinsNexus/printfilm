from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "PRINTFILM"
    debug: bool = True
    # 是否打印 SQLAlchemy 原始 SQL（默认关，避免刷屏；需要排查 SQL 时设 SQL_ECHO=true）
    sql_echo: bool = False
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7

    database_url: str = "sqlite+aiosqlite:///./ai_movie.db"
    database_url_sync: str = "sqlite:///./ai_movie.db"
    redis_url: str = "redis://127.0.0.1:6379/0"

    ark_api_key: str = ""
    ark_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    # 文字模型（Kimi 等 OpenAI 兼容 API，对齐 manju OPENAI_*）
    openai_api_key: str = ""
    openai_base_url: str = ""
    model_llm: str = "kimi-k2.6"
    model_image: str = "doubao-seedream-5-0-260128"
    # Seedream 4.5 接入点（可选；未配则回退 model_image）
    model_image_45: str = ""
    model_video: str = "doubao-seedance-2-5-260628"
    # Seedance 2.5 官方范围约 4–30 秒
    seedance_duration_min: int = 4
    seedance_duration_max: int = 30
    model_audio: str = "seed-tts-2.0"
    # 豆包语音（openspeech）— 与方舟 ARK_API_KEY 不同产品线
    volc_tts_app_id: str = ""
    volc_tts_access_key: str = ""
    volc_tts_resource_id: str = "seed-tts-2.0"
    volc_tts_speaker: str = "zh_female_cancan_uranus_bigtts"
    volc_tts_url: str = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
    # Seedream: 2k|3k|4k or WIDTHxHEIGHT，且总像素 >= 3686400（约 2560x1440）
    ark_image_size: str = "2k"
    ark_video_resolution: str = "480p"
    ark_video_ratio: str = "16:9"
    ark_video_poll_interval: float = 8.0
    ark_video_poll_timeout: float = 900.0
    # Parallel generation concurrency (per project)
    pipeline_image_concurrency: int = 3
    pipeline_video_concurrency: int = 2
    pipeline_audio_concurrency: int = 4
    # 科普 full：Seedance generate_audio 配音，跳过 TTS + 重合成，仅拼接镜头
    kepu_seedance_generate_audio: bool = True

    ark_mock: bool = False
    use_celery: bool = True

    # Celery worker autoscaler (python -m app.workers.autoscale)
    # Windows: each worker is solo/concurrency=1; scale by process count.
    celery_autoscale_min: int = 1
    celery_autoscale_max: int = 3
    celery_autoscale_poll_sec: float = 5.0
    celery_autoscale_idle_sec: float = 45.0
    celery_autoscale_queue: str = "pipeline"
    # Prevent zombie tasks: hard kill hung workers; Redis redelivers after visibility_timeout
    # 视频阶段包含多镜头/多重试（Seedance/合成/OSS回填），线上曾触发 soft time limit 导致 project 进度停在中间。
    # 这里适当放大，确保在“可预期的失败重试窗口”内有足够时间完成状态回写/标记失败。
    celery_task_soft_time_limit: int = 3600  # 60 min soft
    celery_task_time_limit: int = 4500  # 75 min hard
    celery_visibility_timeout: int = 5400  # 90 min — must be > time_limit
    celery_stale_project_sec: int = 900  # redispatch RUNNING with no progress for 15 min

    max_shot_duration: int = 30
    default_preview_resolution: str = "480p"
    new_user_quota: int = 5
    # Legacy flag; prefer billing_enabled
    quota_enabled: bool = False

    # Token billing (charge = provider_cost * markup)
    billing_enabled: bool = False
    billing_markup: float = 1.5
    billing_estimate_buffer: float = 1.2
    # Yuan per million tokens (provider cost)
    billing_seedance_video0: float = 46.0
    billing_seedance_video1: float = 28.0
    billing_llm_per_m: float = 5.0
    billing_seedream_per_m: float = 8.0
    billing_tts_per_m: float = 2.0
    # Fallback tokens when API omits usage
    billing_est_llm_tokens: int = 80_000
    billing_est_seedream_tokens: int = 20_000
    billing_est_tts_tokens: int = 5_000
    billing_est_seedance_tokens_per_sec: int = 20_000
    # Signup grant (fen)
    billing_signup_grant_fen: int = 500

    # Epay (pay.gitcc.com)
    epay_api_url: str = "https://pay.gitcc.com"
    epay_pid: str = ""
    epay_key: str = ""
    epay_notify_url: str = ""
    epay_return_url: str = ""

    public_base_url: str = "http://127.0.0.1:8000"
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"

    tos_endpoint: str = ""
    tos_bucket: str = ""
    tos_access_key: str = ""
    tos_secret_key: str = ""
    cdn_base: str = "http://localhost:8000/static"

    # Aliyun OSS — 成片/分镜上传；FFmpeg 仍读本地文件
    oss_enabled: bool = False
    oss_endpoint: str = "oss-cn-beijing.aliyuncs.com"
    oss_region: str = "cn-hangzhou"
    oss_bucket: str = ""
    oss_folder: str = "kepu"
    oss_access_key_id: str = ""
    oss_access_key_secret: str = ""
    # 可选自定义域名；空则用 https://{bucket}.{endpoint}
    oss_public_base: str = ""
    # 生成链路：先落盘返回 /static，再入队异步上传并回填 OSS URL
    oss_upload_async: bool = True
    oss_upload_queue: str = "oss"

    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174"
    )
    # Comma-separated emails promoted to admin on startup (existing users only)
    admin_bootstrap_emails: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reload_settings() -> Settings:
    get_settings.cache_clear()
    return get_settings()
