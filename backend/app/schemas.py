from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---- Auth ----
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=64)
    nickname: str = Field(default="创作者", max_length=64)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    nickname: str
    quota_left: int

    model_config = {"from_attributes": True}


# ---- Templates ----
class TemplateOut(BaseModel):
    id: str
    name: str
    description: str
    category: list[str]
    preview_cover: str
    default_ratio: str
    shot_duration_min: int
    shot_duration_max: int
    is_premium: bool
    sort_order: int

    model_config = {"from_attributes": True}


class TemplateDetailOut(TemplateOut):
    style_prefix: str
    negative_prompt: str
    llm_system_addon: str
    seedream_config: dict
    seedance_config: dict
    audio_config: dict
    subtitle_config: dict


# ---- Shots / Projects ----
class ShotOut(BaseModel):
    id: int
    shot_no: int
    duration: float
    narration: str
    overlay_title: str = ""
    overlay_subtitle: str = ""
    img_prompt: str
    video_prompt: str
    camera: str
    bgm_mood: str
    image_url: str | None
    video_url: str | None
    audio_url: str | None
    status: str
    version: int

    model_config = {"from_attributes": True}


class ShotUpdate(BaseModel):
    narration: str | None = None
    overlay_title: str | None = None
    overlay_subtitle: str | None = None
    img_prompt: str | None = None
    video_prompt: str | None = None
    duration: float | None = Field(default=None, ge=1, le=30)
    camera: str | None = None
    bgm_mood: str | None = None


class ProjectCreate(BaseModel):
    template_id: str
    title: str = "未命名作品"
    source_type: str = Field(default="theme", pattern="^(theme|script)$")
    source_text: str = Field(min_length=2, max_length=20000)
    resolution_mode: str = Field(default="preview", pattern="^(preview|hd)$")
    pipeline_mode: str = Field(default="full", pattern="^(full|image_text)$")
    output_ratio: str | None = Field(
        default=None,
        pattern=r"^(16:9|9:16|1:1|4:3|21:9)?$",
        max_length=16,
    )
    voice_id: str | None = Field(default=None, max_length=128)
    style_prompt: str | None = Field(default=None, max_length=2000)
    character_prompt: str | None = Field(default=None, max_length=2000)
    extra_prompt: str | None = Field(default=None, max_length=2000)
    ref_image_url: str | None = None


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    source_type: str | None = Field(default=None, pattern="^(theme|script)$")
    source_text: str | None = Field(default=None, min_length=2, max_length=20000)
    template_id: str | None = None
    pipeline_mode: str | None = Field(default=None, pattern="^(full|image_text)$")
    output_ratio: str | None = Field(
        default=None,
        pattern=r"^(16:9|9:16|1:1|4:3|21:9)$",
        max_length=16,
    )
    resolution_mode: str | None = Field(default=None, pattern="^(preview|hd)$")
    voice_id: str | None = Field(default=None, max_length=128)
    style_prompt: str | None = Field(default=None, max_length=2000)
    character_prompt: str | None = Field(default=None, max_length=2000)
    extra_prompt: str | None = Field(default=None, max_length=2000)
    ref_image_url: str | None = None
    cover_url: str | None = Field(default=None, max_length=1024)


class ProjectOut(BaseModel):
    id: int
    template_id: str
    title: str
    source_type: str
    source_text: str
    status: str
    progress: int
    error_msg: str | None
    cover_url: str | None
    final_video_url: str | None
    resolution_mode: str
    pipeline_mode: str = "full"
    output_ratio: str = ""
    voice_id: str = ""
    character_bible: str = ""
    style_prompt: str = ""
    character_prompt: str = ""
    extra_prompt: str = ""
    ref_image_url: str | None
    created_at: datetime
    updated_at: datetime
    shots: list[ShotOut] = []

    model_config = {"from_attributes": True}


class ProjectListItem(BaseModel):
    id: int
    title: str
    template_id: str
    status: str
    progress: int
    cover_url: str | None
    final_video_url: str | None = None
    error_msg: str | None = None
    pipeline_mode: str = "full"
    output_ratio: str = ""
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ProjectDownloadRequest(BaseModel):
    ids: list[int] = Field(default_factory=list, min_length=1, max_length=50)


class ContentExpandRequest(BaseModel):
    topic: str = Field(default="", max_length=2000)
    mode: str = Field(default="theme", pattern="^(theme|script)$")


class ContentExpandOut(BaseModel):
    title: str
    content: str


class VoicePreviewRequest(BaseModel):
    voice_id: str = Field(min_length=1, max_length=128)


class VoicePreviewOut(BaseModel):
    url: str
    voice_id: str


class WorkOut(BaseModel):
    id: int
    project_id: int
    user_id: int
    title: str
    cover_url: str | None
    video_url: str
    visibility: str
    published_at: datetime

    model_config = {"from_attributes": True}


class ProgressEvent(BaseModel):
    event: str
    stage: str | None = None
    shot: int | None = None
    total: int | None = None
    percent: int | None = None
    message: str | None = None
    video_url: str | None = None
    retryable: bool | None = None
    code: str | None = None
