from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "PRINTFILM"
    debug: bool = True
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7

    database_url: str = "sqlite+aiosqlite:///./ai_movie.db"
    database_url_sync: str = "sqlite:///./ai_movie.db"
    redis_url: str = "redis://127.0.0.1:6379/0"

    ark_api_key: str = ""
    ark_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    model_llm: str = "doubao-seed-2-0-pro-260215"
    model_image: str = "doubao-seedream-5-0-260128"
    model_video: str = "doubao-seedance-2-0-260128"
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

    ark_mock: bool = True
    use_celery: bool = True

    # Celery worker autoscaler (python -m app.workers.autoscale)
    # Windows: each worker is solo/concurrency=1; scale by process count.
    celery_autoscale_min: int = 1
    celery_autoscale_max: int = 3
    celery_autoscale_poll_sec: float = 5.0
    celery_autoscale_idle_sec: float = 45.0
    celery_autoscale_queue: str = "pipeline"
    # Prevent zombie tasks: hard kill hung workers; Redis redelivers after visibility_timeout
    celery_task_soft_time_limit: int = 1800  # 30 min soft
    celery_task_time_limit: int = 2100  # 35 min hard
    celery_visibility_timeout: int = 2400  # 40 min — must be > time_limit
    celery_stale_project_sec: int = 900  # redispatch RUNNING with no progress for 15 min

    max_shot_duration: int = 30
    default_preview_resolution: str = "480p"
    new_user_quota: int = 5
    # MVP: set false to skip quota check/deduction
    quota_enabled: bool = False

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

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reload_settings() -> Settings:
    get_settings.cache_clear()
    return get_settings()
