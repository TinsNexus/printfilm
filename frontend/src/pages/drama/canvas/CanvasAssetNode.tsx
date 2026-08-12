/** 画布资产自定义节点：类型图标 + 媒体卡片 + 选中工具栏 */
import { memo, useCallback, type ChangeEvent } from 'react'
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from '@xyflow/react'
import { AudioLines, Image as ImageIcon, Landmark, Loader2, Play, UserRound } from 'lucide-react'
import { resolveDramaMediaUrl } from '../../../api/drama'
import { useCanvasStore } from './CanvasStore'
import {
  CANVAS_GENERATABLE_KINDS,
  CANVAS_NODE_OPTION_BY_KIND,
  CANVAS_UPLOADABLE_KINDS,
  type CanvasAssetNodeData,
} from './canvasTypes'
import { CanvasNodeGeneratePanel } from './nodes/CanvasNodeGeneratePanel'
import { CanvasNodeUploadBar } from './nodes/CanvasNodeUploadBar'

/** 按类型返回占位图标 */
function PlaceholderIcon({ kind }: { kind: CanvasAssetNodeData['kind'] }) {
  const className = 'fc-placeholder-icon'
  if (kind === 'character') return <UserRound className={className} size={40} strokeWidth={1.4} />
  if (kind === 'scene') return <Landmark className={className} size={40} strokeWidth={1.4} />
  if (kind === 'video') return <Play className={className} size={40} strokeWidth={1.4} />
  if (kind === 'audio') return <AudioLines className={className} size={32} strokeWidth={1.4} />
  if (kind === 'text') return null
  return <ImageIcon className={className} size={40} strokeWidth={1.4} />
}

/** 渲染单个画布资产节点 */
function CanvasAssetNodeComponent({ id, data, selected }: NodeProps<Node<CanvasAssetNodeData>>) {
  const { updateNodeTextContent } = useCanvasStore()
  const option = CANVAS_NODE_OPTION_BY_KIND[data.kind]
  const Icon = option.icon
  const isText = data.kind === 'text'
  const mediaSrc = resolveDramaMediaUrl(data.mediaUrl)
  const showUpload = selected && CANVAS_UPLOADABLE_KINDS.has(data.kind)
  const showGenerate = selected && CANVAS_GENERATABLE_KINDS.has(data.kind)
  const voiceLabel = typeof data.voiceLabel === 'string' ? data.voiceLabel : ''
  const footerLabel =
    data.kind === 'character'
      ? voiceLabel
        ? `基础形象 · ${voiceLabel}`
        : '基础形象'
      : data.kind === 'scene'
        ? data.label
        : null

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeTextContent(id, event.target.value)
    },
    [id, updateNodeTextContent],
  )

  return (
    <div className={`fc-asset-node${selected ? ' is-selected' : ''}${data.generating ? ' is-generating' : ''}`}>
      {showUpload ? (
        <NodeToolbar nodeId={id} position={Position.Top} align="center" offset={10}>
          <CanvasNodeUploadBar
            nodeId={id}
            kind={data.kind}
            voiceLabel={data.kind === 'character' ? voiceLabel || null : null}
          />
        </NodeToolbar>
      ) : null}

      <div className="fc-asset-node-header">
        <Icon size={14} strokeWidth={1.8} />
        <span>
          {data.kind === 'character'
            ? typeof data.characterName === 'string' && data.characterName
              ? data.characterName
              : option.label
            : data.label}
        </span>
      </div>

      <div className="fc-asset-card">
        <div className={`fc-asset-body is-${data.kind}`}>
          {isText ? (
            selected ? (
              <textarea
                className="fc-text-editor nodrag nowheel"
                value={data.textContent || ''}
                onChange={handleTextChange}
                placeholder="输入文本…"
                rows={4}
              />
            ) : (
              <span>{data.textContent || data.label || '文本'}</span>
            )
          ) : data.generating ? (
            <div className="fc-generating">
              <Loader2 size={28} className="fc-spin" />
              <span>生成中…</span>
            </div>
          ) : mediaSrc ? (
            <img className="fc-asset-media" src={mediaSrc} alt={data.label} draggable={false} />
          ) : (
            <PlaceholderIcon kind={data.kind} />
          )}
        </div>
        {footerLabel ? <div className="fc-asset-footer">{footerLabel}</div> : null}
      </div>

      {showGenerate ? (
        <NodeToolbar nodeId={id} position={Position.Bottom} align="center" offset={14}>
          <CanvasNodeGeneratePanel
            nodeId={id}
            kind={data.kind}
            generating={Boolean(data.generating)}
            defaultPrompt={typeof data.promptHint === 'string' ? data.promptHint : ''}
          />
        </NodeToolbar>
      ) : null}

      <Handle className="fc-handle" type="target" position={Position.Left} />
      <Handle className="fc-handle" type="source" position={Position.Right} />
    </div>
  )
}

export const CanvasAssetNode = memo(CanvasAssetNodeComponent)
