export const RUNNING = new Set([
  'SCRIPTING',
  'IMAGING',
  'VIDEOING',
  'AUDIOING',
  'COMPOSING',
  'AUDITING',
  'PARALLEL_ASSETS',
])

export const STATUS_CN: Record<string, string> = {
  DRAFT: '草稿',
  SCRIPTING: '拆分镜中',
  SCRIPT_READY: '分镜待确认',
  IMAGING: '出图+配音并行中',
  IMAGE_READY: '分镜图/配音完成',
  VIDEOING: '生成 AI 视频',
  VIDEO_READY: '镜头视频完成',
  AUDIOING: '生成配音',
  COMPOSING: '合成成片',
  AUDITING: '审核中',
  DONE: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消',
  REJECTED: '未通过',
  PARALLEL_ASSETS: '出图+配音并行',
  ASSETS_READY: '素材就绪',
}

export function isRunning(status: string) {
  return RUNNING.has(status)
}

export function statusTone(status: string): 'ok' | 'bad' | 'run' | 'idle' {
  if (status === 'DONE') return 'ok'
  if (status === 'FAILED' || status === 'REJECTED' || status === 'CANCELLED') return 'bad'
  if (isRunning(status)) return 'run'
  return 'idle'
}

/** Per-shot statuses from pipeline */
export const SHOT_STATUS_CN: Record<string, string> = {
  PENDING: '等待中',
  IMAGE_READY: '图已生成',
  VIDEO_READY: '视频已生成',
  AUDIO_READY: '已完成',
  DONE: '已完成',
  FAILED: '失败',
}

export function shotStatusLabel(status: string) {
  return SHOT_STATUS_CN[status] || STATUS_CN[status] || status
}

export function shotIsDone(status: string) {
  return ['AUDIO_READY', 'VIDEO_READY', 'DONE', 'IMAGE_READY'].includes(status)
}

export function formatMmSs(seconds: number) {
  const s = Math.max(0, Math.round(seconds || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export const CREATE_STEPS = [
  { key: 'template', label: '选择模板' },
  { key: 'content', label: '输入内容' },
  { key: 'style', label: '风格配置' },
  { key: 'generate', label: '开始生成' },
]

export const BOARD_STEPS = [
  { key: 'theme', label: '输入主题' },
  { key: 'smart', label: '智能生成' },
  { key: 'preset', label: '精细画面' },
  { key: 'board', label: '生成分镜' },
  { key: 'compose', label: '成片预览' },
]
