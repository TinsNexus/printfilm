/** 漫剧画布 / 分集：视频生成选项（方舟 Seedance + Kie 主流） */

export type VideoGenerationModelId =
  | 'seedance-2.5'
  | 'seedance-1.5'
  | 'kie-seedance-2.5'
  | 'kie-veo3-fast'
  | 'kie-veo3'

export type VideoAspectRatio = '9:16' | '16:9' | '1:1'
export type VideoResolution = '480p' | '720p' | '1080p'

export type VideoGenerationOptions = {
  image_style_id?: string
  model_id: VideoGenerationModelId
  aspect_ratio: VideoAspectRatio
  resolution: VideoResolution
  duration_sec: number
}

export const VIDEO_GENERATION_MODELS: Array<{
  id: VideoGenerationModelId
  label: string
  description: string
}> = [
  {
    id: 'kie-seedance-2.5',
    label: 'Seedance 2.5（Kie）',
    description: '字节 Seedance 图生视频，适合分镜成片。',
  },
  {
    id: 'kie-veo3-fast',
    label: 'Veo 3.1 Fast（Kie）',
    description: 'Google Veo 快速版，运动自然。',
  },
  {
    id: 'kie-veo3',
    label: 'Veo 3.1 Quality（Kie）',
    description: 'Google Veo 画质版，更慢更稳。',
  },
  {
    id: 'seedance-2.5',
    label: 'Seedance 2.5（方舟）',
    description: '画质与运动更稳，适合成片。',
  },
  {
    id: 'seedance-1.5',
    label: 'Seedance 1.5（方舟）',
    description: '速度更快，适合草稿预览。',
  },
]

export const VIDEO_ASPECT_RATIO_OPTIONS: VideoAspectRatio[] = ['9:16', '16:9', '1:1']
export const VIDEO_RESOLUTION_OPTIONS: VideoResolution[] = ['480p', '720p', '1080p']
export const VIDEO_DURATION_PRESETS = [5, 8, 10, 15] as const
export const VIDEO_DURATION_MIN = 4
export const VIDEO_DURATION_MAX = 30

export const DEFAULT_VIDEO_GENERATION_OPTIONS: VideoGenerationOptions = {
  model_id: 'kie-seedance-2.5',
  aspect_ratio: '9:16',
  resolution: '720p',
  duration_sec: 8,
}

/** 夹紧时长到允许区间 */
export function clampVideoDuration(sec: number) {
  const n = Math.round(Number(sec) || DEFAULT_VIDEO_GENERATION_OPTIONS.duration_sec)
  return Math.min(VIDEO_DURATION_MAX, Math.max(VIDEO_DURATION_MIN, n))
}

/** 格式化比例 · 清晰度 */
export function formatVideoOutputLabel(
  aspectRatio: VideoAspectRatio,
  resolution: VideoResolution,
) {
  return `${aspectRatio} · ${resolution}`
}

/** 解析模型展示名 */
export function getVideoModelLabel(modelId: string | undefined | null) {
  return VIDEO_GENERATION_MODELS.find((m) => m.id === modelId)?.label ?? 'Seedance 2.5（Kie）'
}

/** 是否已登记的视频模型 id */
export function isVideoGenerationModelId(id: string): id is VideoGenerationModelId {
  return VIDEO_GENERATION_MODELS.some((m) => m.id === id)
}

/** 从节点 data 恢复视频选项 */
export function readVideoGenerationOptions(raw: unknown): VideoGenerationOptions {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const modelId = String(row.model_id || '')
  const aspect = String(row.aspect_ratio || '')
  const resolution = String(row.resolution || '')
  return {
    image_style_id: typeof row.image_style_id === 'string' ? row.image_style_id : undefined,
    model_id: isVideoGenerationModelId(modelId)
      ? modelId
      : DEFAULT_VIDEO_GENERATION_OPTIONS.model_id,
    aspect_ratio: VIDEO_ASPECT_RATIO_OPTIONS.includes(aspect as VideoAspectRatio)
      ? (aspect as VideoAspectRatio)
      : DEFAULT_VIDEO_GENERATION_OPTIONS.aspect_ratio,
    resolution: VIDEO_RESOLUTION_OPTIONS.includes(resolution as VideoResolution)
      ? (resolution as VideoResolution)
      : DEFAULT_VIDEO_GENERATION_OPTIONS.resolution,
    duration_sec: clampVideoDuration(Number(row.duration_sec)),
  }
}
