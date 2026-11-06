import { getImageStyleLabel } from './dramaImageStyles.ts'
import { normalizeAssetDetailReferences, splitAssetDetailPrompt, type AssetDetailReference } from './assetDetailReferences.ts'
import { tv } from '../i18n/tv'
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
  if (typeof value === 'boolean') return value ? tv('是', 'Có') : tv('否', 'Không')
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/** 成片时长最多保留两位小数，未知或无效值不伪造为零。 */
export function formatMediaDuration(value: unknown): string {
  const duration = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(duration) && duration > 0 ? tv(`${Number(duration.toFixed(2))} 秒`, `${Number(duration.toFixed(2))} giây`) : ''
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
  const source = uploaded ? tv('上传', 'Tải lên') : (hasSnapshot ? snapshot.source === 'generated' : Boolean(model)) ? tv('AI 生成', 'AI tạo') : tv('未记录', 'Chưa ghi nhận')
  const prompt = display(hasSnapshot ? snapshot.prompt : params.visualPrompt || params.visualImage || params.voicePrompt || params.prompt || params.description)
  // An explicit empty frozen list is authoritative; never borrow a later form's references.
  const references = uploaded ? [] : normalizeAssetDetailReferences(
    Object.hasOwn(snapshot, 'references') ? snapshot.references : asset.references,
  )
  const labels: Record<string, string> = {
    aspect_ratio: snapshot.parameter_source === 'request' ? tv('设定画幅', 'Đặt tỷ lệ khung') : tv('比例', 'Tỷ lệ'),
    resolution: snapshot.parameter_source === 'request' ? tv('设定分辨率', 'Đặt độ phân giải') : tv('分辨率', 'Độ phân giải'),
    size: snapshot.parameter_source === 'request' ? tv('设定尺寸', 'Đặt kích thước') : tv('尺寸', 'Kích thước'), duration_sec: tv('时长', 'Thời lượng'), duration: tv('时长', 'Thời lượng'),
    requested_duration_sec: tv('设定时长', 'Đặt thời lượng'), video_mode: tv('生成方式', 'Cách tạo'), count: tv('生成数量', 'Số lượng tạo'), negative: tv('负向提示词', 'Prompt phủ định'),
    strength: tv('参考强度', 'Cường độ tham chiếu'), motion: tv('运动幅度', 'Biên độ chuyển động'),
    image_style_id: tv('画面风格', 'Phong cách hình ảnh'), generate_audio: tv('生成声音', 'Tạo âm thanh'), watermark: tv('水印', 'Watermark'), camera_fixed: tv('固定镜头', 'Cố định máy quay'),
    seed: tv('随机种子', 'Hạt giống ngẫu nhiên'), speaker: tv('音色', 'Giọng nói'), sample_text: tv('试听文本', 'Văn bản nghe thử'), sampleText: tv('试听文本', 'Văn bản nghe thử'),
  }
  const parameters = uploaded ? [] : Object.entries(labels).flatMap(([key, label]) => {
    const modes: Record<string, string> = { text_to_video: tv('文生视频', 'Văn bản thành video'), first_last_frame: tv('首尾帧', 'Khung đầu cuối'), omni_reference: tv('全能参考', 'Tham chiếu đa năng') }
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
