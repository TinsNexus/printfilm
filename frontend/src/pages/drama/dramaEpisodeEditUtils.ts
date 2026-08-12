/** 分集编辑页辅助：资产分类、引用解析、标签文案 */
import type { DramaAsset, DramaFragment } from '../../api/drama'

export type AssetScope = 'episode' | 'series'
export type AssetTab = 'character' | 'scene' | 'prop' | 'material'

export const ASSET_TABS: Array<{ key: AssetTab; label: string }> = [
  { key: 'character', label: '角色' },
  { key: 'scene', label: '场景' },
  { key: 'material', label: '素材' },
  { key: 'prop', label: '道具' },
]

export const MODEL_OPTIONS = [
  { id: 'seedance-2.5', label: 'Seedance 2.5' },
  { id: 'seedance-1.5', label: 'Seedance 1.5' },
]

export const RATIO_OPTIONS = ['9:16', '16:9', '1:1'] as const
export const RES_OPTIONS = ['480p', '720p', '1080p'] as const

// 从分镜正文提取 @asset:id
export function extractAssetIds(content: string): number[] {
  const ids: number[] = []
  const re = /@asset:(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    ids.push(Number(m[1]))
  }
  return ids
}

// 合并正文 @asset 与 asset_ids，去重保序
export function collectFragmentAssetIds(frag: DramaFragment | null | undefined): number[] {
  if (!frag) return []
  const seen = new Set<number>()
  const out: number[] = []
  for (const id of [...extractAssetIds(frag.content || ''), ...(frag.asset_ids || [])]) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export type FragmentRefStripItem = {
  assetId: number
  name: string
  type: string
  previewUrl: string
}

// 组装当前分镜关联资产条
export function buildFragmentRefStripItems(
  frag: DramaFragment | null | undefined,
  assets: DramaAsset[],
  resolveUrl: (url: string | null | undefined) => string,
): FragmentRefStripItem[] {
  const byId = new Map(assets.map((a) => [a.id, a]))
  return collectFragmentAssetIds(frag).map((assetId) => {
    const asset = byId.get(assetId)
    const preview = asset ? resolveUrl(asset.cover || asset.url) : ''
    return {
      assetId,
      name: asset?.name || `资产 ${assetId}`,
      type: asset?.type || '',
      previewUrl: preview,
    }
  })
}

// 规范化资产分类
export function normalizeAssetTab(type: string): AssetTab | null {
  const t = (type || '').toLowerCase()
  if (t === 'character' || t === '角色') return 'character'
  if (t === 'scene' || t === '场景') return 'scene'
  if (t === 'prop' || t === '道具') return 'prop'
  if (t === 'material' || t === '素材') return 'material'
  return null
}

// 从分镜正文合计 @duration 秒数（与后端 fragment_content_duration 一致）
export function sumFragmentContentDuration(content: string): number {
  const re = /@duration:(\d+)/g
  let total = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content || ''))) {
    const sec = Number(m[1])
    if (sec > 0) total += sec
  }
  return total
}

// 解析分镜生成状态（params.generation 或已有 video）
export function readFragmentGenerationStatus(
  frag: DramaFragment,
): { status: string; error?: string } {
  if (frag.video) return { status: 'done' }
  const gen = frag.params?.generation
  if (gen && typeof gen === 'object') {
    const row = gen as Record<string, unknown>
    const status = typeof row.status === 'string' ? row.status : 'idle'
    const error = typeof row.error === 'string' ? row.error : undefined
    return { status, error }
  }
  return { status: 'idle' }
}

// 保存前：有 @duration 标签时用合计值作为 duration_sec
export function resolveFragmentDurationSec(
  content: string,
  durationSec: number | null | undefined,
): number {
  const fromTags = sumFragmentContentDuration(content)
  if (fromTags > 0) return Math.min(30, Math.max(4, fromTags))
  const fallback = durationSec && durationSec > 0 ? durationSec : 8
  return Math.min(30, Math.max(4, fallback))
}

// 格式化片段标签
export function formatFragLabel(index: number, durationSec: number | null | undefined) {
  const n = String(index + 1).padStart(2, '0')
  const sec = durationSec && durationSec > 0 ? durationSec : 8
  return `片段 ${n} · ${sec}s`
}

// 按本集/全集与分类筛选资产
export function filterEpisodeAssets(
  assets: DramaAsset[],
  scope: AssetScope,
  tab: AssetTab | null,
  referencedIds: Set<number>,
): DramaAsset[] {
  let list = assets.filter((a) => normalizeAssetTab(a.type))
  if (scope === 'episode') {
    list = list.filter((a) => referencedIds.has(a.id))
  }
  if (tab) {
    list = list.filter((a) => normalizeAssetTab(a.type) === tab)
  }
  return list
}
