/** 出境资产节点：缩略图卡片，连线到分镜视频 */
import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { X } from 'lucide-react'
import type { EpisodeAssetNodeData } from './buildEpisodeFlow'

type Props = NodeProps<Node<EpisodeAssetNodeData>> & {
  onUnlinkAsset?: (fragmentId: number, assetId: number) => void
}

// 渲染出境资产节点
function EpisodeAssetNodeComponent({ data, selected, onUnlinkAsset }: Props) {
  return (
    <div className={`ep-asset-node${selected ? ' is-selected' : ''}`}>
      <div className="ep-asset-node-head">
        <span>{data.typeLabel}</span>
        {selected ? (
          <button
            type="button"
            className="ep-asset-node-unlink nodrag nopan"
            aria-label={`取消关联 ${data.name}`}
            title="取消关联"
            onClick={() => onUnlinkAsset?.(data.fragmentId, data.assetId)}
          >
            <X size={12} strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
      <div className="ep-asset-node-thumb">
        {data.previewUrl ? (
          <img src={data.previewUrl} alt="" draggable={false} />
        ) : (
          <span>{(data.name || '?')[0]}</span>
        )}
      </div>
      <div className="ep-asset-node-name">{data.name}</div>
      <Handle className="ep-frag-handle" type="source" position={Position.Right} />
    </div>
  )
}

export const EpisodeAssetNode = memo(EpisodeAssetNodeComponent)
