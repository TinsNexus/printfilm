/** 分集分镜 → 资产节点连线到分镜视频节点 */
import type { Edge, Node } from '@xyflow/react'
import {
  resolveDramaMediaUrl,
  type DramaAsset,
  type DramaFragment,
} from '../../../api/drama'
import {
  collectFragmentAssetIds,
  formatFragLabel,
  normalizeAssetTab,
} from '../dramaEpisodeEditUtils'

export type EpisodeFragmentNodeData = {
  fragmentId: number
  sortOrder: number
  label: string
  content: string
  videoUrl: string
  coverUrl: string
  durationSec: number
  linkedCount: number
  [key: string]: unknown
}

export type EpisodeAssetNodeData = {
  assetId: number
  fragmentId: number
  name: string
  typeLabel: string
  previewUrl: string
  [key: string]: unknown
}

export type EpisodeFlowNodeData = EpisodeFragmentNodeData | EpisodeAssetNodeData

export const EPISODE_FRAGMENT_NODE_WIDTH = 220
export const EPISODE_ASSET_NODE_WIDTH = 148
export const EPISODE_COL_GAP = 56
export const EPISODE_ASSET_ROW_GAP = 16
export const EPISODE_ASSET_TO_VIDEO_GAP = 48

// 分镜视频节点 id
export function episodeFragmentNodeId(fragmentId: number): string {
  return `frag-${fragmentId}`
}

// 分镜下某个出境资产节点 id（按镜复制，便于排布与取消关联）
export function episodeAssetNodeId(fragmentId: number, assetId: number): string {
  return `frag-${fragmentId}-asset-${assetId}`
}

// 构建：左列出境资产 → 连线 → 右列分镜视频（下挂提示词），分镜之间顺序相连
export function buildEpisodeFragmentFlow(
  fragments: DramaFragment[],
  assets: DramaAsset[] = [],
): {
  nodes: Node<EpisodeFlowNodeData>[]
  edges: Edge[]
} {
  const ordered = [...fragments].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const byId = new Map(assets.map((a) => [a.id, a]))
  const nodes: Node<EpisodeFlowNodeData>[] = []
  const edges: Edge[] = []

  const colWidth = EPISODE_ASSET_NODE_WIDTH + EPISODE_ASSET_TO_VIDEO_GAP + EPISODE_FRAGMENT_NODE_WIDTH

  ordered.forEach((frag, index) => {
    const fragNodeId = episodeFragmentNodeId(frag.id)
    const linkedIds = collectFragmentAssetIds(frag)
    const colX = index * (colWidth + EPISODE_COL_GAP)
    const videoX = colX + EPISODE_ASSET_NODE_WIDTH + EPISODE_ASSET_TO_VIDEO_GAP
    const videoY = 120

    linkedIds.forEach((assetId, assetIndex) => {
      const asset = byId.get(assetId)
      const assetNodeId = episodeAssetNodeId(frag.id, assetId)
      const tab = normalizeAssetTab(asset?.type || '')
      nodes.push({
        id: assetNodeId,
        type: 'episodeAsset',
        position: {
          x: colX,
          y: 40 + assetIndex * (EPISODE_ASSET_NODE_WIDTH + EPISODE_ASSET_ROW_GAP),
        },
        data: {
          assetId,
          fragmentId: frag.id,
          name: asset?.name || `资产 ${assetId}`,
          typeLabel: tab || asset?.type || '资产',
          previewUrl: resolveDramaMediaUrl(asset?.cover || asset?.url) || '',
        },
        draggable: true,
      })
      edges.push({
        id: `ea-${frag.id}-${assetId}`,
        source: assetNodeId,
        target: fragNodeId,
        targetHandle: 'assets',
        type: 'smoothstep',
        animated: false,
      })
    })

    nodes.push({
      id: fragNodeId,
      type: 'episodeFragment',
      position: { x: videoX, y: videoY },
      data: {
        fragmentId: frag.id,
        sortOrder: frag.sort_order ?? index,
        label: formatFragLabel(index, frag.duration_sec),
        content: frag.content || '',
        videoUrl: resolveDramaMediaUrl(frag.video) || '',
        coverUrl: resolveDramaMediaUrl(frag.cover) || '',
        durationSec: frag.duration_sec && frag.duration_sec > 0 ? frag.duration_sec : 8,
        linkedCount: linkedIds.length,
      },
      draggable: true,
    })

    if (index > 0) {
      const prev = ordered[index - 1]
      edges.push({
        id: `ef-${prev.id}-${frag.id}`,
        source: episodeFragmentNodeId(prev.id),
        sourceHandle: 'next',
        target: fragNodeId,
        targetHandle: 'prev',
        type: 'smoothstep',
        animated: false,
        style: { strokeDasharray: '6 4' },
      })
    }
  })

  return { nodes, edges }
}
