import { getImageStyleLabel } from './dramaImageStyles.ts'
import { normalizeAssetDetailReferences, splitAssetDetailPrompt, type AssetDetailReference } from './assetDetailReferences.ts'
import { tr } from '../i18n/translate.ts'
export { normalizeAssetDetailReferences, splitAssetDetailPrompt, type AssetDetailReference, type AssetDetailPromptPart } from './assetDetailReferences.ts'

/** 统一资产详情数据：成功媒体快照优先，上传素材不混入旧生成参数。 */
export type AssetDetailRecord = {
  id?: number
  name?: string | null
  type: string
  asset_type?: string
  cover?: string | null
  url?: string | null
  params?: Record<string, unknown> | null
  references?: AssetDetailReference[]
  project_id?: number | null
  updated_at?: string | null
}

/** 只处理普通对象，兼容历史脏数据。 */
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** 仅展示标量值；保留 false 和 0，避免把内部对象直接输出到页面。 */
function display(value: unknown): string {
  if (typeof value === 'boolean') return value ? tr('assetDetails.yes') : tr('assetDetails.no')
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/** 成片时长最多保留两位小数，未知或无效值不伪造为零。 */
export function formatMediaDuration(value: unknown): string {
  const duration = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(duration) && duration > 0 ? tr('assetDetails.s', { p: Number(duration.toFixed(2)) }) : ''
}

/** 从当前媒体读取生成参数；新快照存在时绝不回退到旧模型。 */
export function assetDetailInfo(asset: AssetDetailRecord) {
  const params = object(asset.params)
  const gen = object(params.generation)
  const snapshot = object(params.media_metadata)
  const hasSnapshot = params.media_metadata != null && typeof params.media_metadata === 'object'
  const uploaded = (hasSnapshot ? snapshot.source : gen.source) === 'upload'
  const options = hasSnapshot ? object(snapshot.parameters) : { ...params, ...object(params.videoOptions), ...gen }
  const model = uploaded ? '' : display(hasSnapshot ? snapshot.model_id : options.model_id)
  const source = uploaded ? tr('assetDetails.upload') : (hasSnapshot ? snapshot.source === 'generated' : Boolean(model)) ? tr('assetDetails.aiGenerated') : tr('assetDetails.notRecorded')
  const prompt = display(hasSnapshot ? snapshot.prompt : params.visualPrompt || params.visualImage || params.voicePrompt || params.prompt || params.description)
  // An explicit empty frozen list is authoritative; never borrow a later form's references.
  const references = uploaded ? [] : normalizeAssetDetailReferences(
    Object.hasOwn(snapshot, 'references') ? snapshot.references : asset.references,
  )
  const labels: Record<string, string> = {
    aspect_ratio: snapshot.parameter_source === 'request' ? tr('assetDetails.setAspectRatio') : tr('assetDetails.aspectRatio'),
    resolution: snapshot.parameter_source === 'request' ? tr('assetDetails.setResolution') : tr('assetDetails.resolution'),
    size: snapshot.parameter_source === 'request' ? tr('assetDetails.setSize') : tr('assetDetails.size'), duration_sec: tr('assetDetails.duration'), duration: tr('assetDetails.duration'),
    requested_duration_sec: tr('assetDetails.setDuration'), video_mode: tr('assetDetails.generationMode'), count: tr('assetDetails.count'), negative: tr('assetDetails.negativePrompt'),
    strength: tr('assetDetails.referenceStrength'), motion: tr('assetDetails.motionStrength'),
    image_style_id: tr('assetDetails.visualStyle'), generate_audio: tr('assetDetails.generateAudio'), watermark: tr('assetDetails.watermark'), camera_fixed: tr('assetDetails.fixedCamera'),
    seed: tr('assetDetails.seed'), speaker: tr('assetDetails.voice'), sample_text: tr('assetDetails.previewText'), sampleText: tr('assetDetails.previewText'),
  }
  const parameters = uploaded ? [] : Object.entries(labels).flatMap(([key, label]) => {
    const modes: Record<string, string> = { text_to_video: tr('assetDetails.textVideo'), first_last_frame: tr('assetDetails.firstLastFrame'), omni_reference: tr('assetDetails.multiReference') }
    const raw = options[key]
    const value = key === 'video_mode' ? modes[display(raw)] || ''
      : key === 'image_style_id' ? getImageStyleLabel(display(raw)) || display(raw)
      : ['generate_audio', 'watermark', 'camera_fixed'].includes(key) && typeof raw === 'string' && /^(true|false)$/i.test(raw) ? display(raw.toLowerCase() === 'true')
      : display(raw)
    const duration = key.includes('duration') && (typeof raw === 'number' || typeof raw === 'string') ? formatMediaDuration(Number(String(raw).replace(/\s*s$/i, ''))) : ''
    return value ? [{ key, label, value: key.includes('duration') ? duration : value }].filter((item) => item.value) : []
  })
  return {
    source, model, prompt, references, promptParts: splitAssetDetailPrompt(prompt, references),
    parameters, mediaDuration: formatMediaDuration(options.media_duration_sec),
    filename: display(snapshot.filename), fileSize: typeof snapshot.file_size === 'number' ? snapshot.file_size : null,
    createdAt: display(snapshot.created_at || gen.finished_at || asset.updated_at),
  }
}
