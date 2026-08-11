/** 分集编辑页辅助：资产分类、引用解析、标签文案 */
import type { DramaAsset } from '../../api/drama'

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

// 规范化资产分类
export function normalizeAssetTab(type: string): AssetTab | null {
  const t = (type || '').toLowerCase()
  if (t === 'character' || t === '角色') return 'character'
  if (t === 'scene' || t === '场景') return 'scene'
  if (t === 'prop' || t === '道具') return 'prop'
  if (t === 'material' || t === '素材') return 'material'
  return null
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
