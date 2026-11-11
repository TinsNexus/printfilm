/** 漫剧模型选择：图标族与展示文案辅助 */
import type { MediaModelOption } from '../api'
import { tr } from '../i18n/translate.ts'

export type MediaModelIconKind =
  | 'seedance25'
  | 'seedance'
  | 'seedanceMini'
  | 'minimax'
  | 'seedream'
  | 'gptImage'
  | 'generic'

/** MiniMax-H3（忽略大小写与连字符）才开放分集批量提交 */
export function isMinimaxH3Model(modelId: string | undefined | null): boolean {
  const id = (modelId || '').toLowerCase().replace(/[_-]/g, '')
  return id.includes('minimax') && id.includes('h3')
}

/** 按模型 id 推断图标族 */
export function mediaModelIconKind(modelId: string | undefined | null): MediaModelIconKind {
  const id = (modelId || '').toLowerCase()
  if (!id) return 'generic'
  if (id.includes('minimax')) return 'minimax'
  if (id.includes('seedream')) return 'seedream'
  if (id.includes('gpt-image') || id.includes('sunburst')) return 'gptImage'
  if (id.includes('seedance') && (id.includes('mini') || id.includes('fast'))) return 'seedanceMini'
  if (id.includes('seedance') && (id.includes('2-5') || id.includes('2.5'))) return 'seedance25'
  if (id.includes('seedance')) return 'seedance'
  return 'generic'
}

/** 能力标签（列表角标） */
export function mediaModelCapabilityBadge(model: MediaModelOption): string {
  const id = (model.id || '').toLowerCase()
  if (id.includes('minimax')) return 'MiniMax'
  if (id.includes('seedance')) return 'Seedance'
  if (id.includes('seedream')) return 'Seedream'
  if (id.includes('gpt-image')) return 'GPT Image'
  // PiAPI 上游的模型族
  if (id.includes('kling')) return 'Kling'
  if (id.includes('veo')) return 'Veo'
  if (id.includes('flux')) return 'Flux'
  return model.provider === 'tokenfree' ? 'TokenFree' : model.provider || tr('dramaMediaModelMeta.model')
}

/** 悬停 / title 完整介绍 */
export function mediaModelHoverText(model: MediaModelOption): string {
  const clip =
    typeof model.duration_min === 'number' && typeof model.duration_max === 'number'
      ? tr('dramaMediaModelMeta.videoS', { duration_min: model.duration_min, duration_max: model.duration_max })
      : ''
  const parts = [
    model.label || model.id,
    model.description?.trim(),
    model.eta_hint?.trim() ? tr('dramaMediaModelMeta.time', { trim: model.eta_hint.trim() }) : '',
    clip,
    model.pricing_hint?.trim() || '',
  ].filter(Boolean)
  return parts.join('\n')
}

/** 成片可选取时长文案 */
export function mediaModelClipDurationLabel(model: MediaModelOption): string {
  const lo = Number(model.duration_min)
  const hi = Number(model.duration_max)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo <= 0 || hi <= 0) return ''
  if (lo === hi) return tr('dramaMediaModelMeta.videoS2', { lo })
  return tr('dramaMediaModelMeta.videoS3', { lo, hi })
}
