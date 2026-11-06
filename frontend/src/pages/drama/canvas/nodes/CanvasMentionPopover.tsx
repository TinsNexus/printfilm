/** 画布提示词：键入 @ 后选择角色/场景等节点插入（不 portal，避免点选时画布取消选中） */
import { Landmark, UserRound, Image as ImageIcon, PlaySquare } from 'lucide-react'
import { resolveDramaMediaUrl } from '../../../../api/drama'
import type { CanvasNodeKind } from '../canvasTypes'
import { tv } from '../../../../i18n/tv'

export type CanvasMentionItem = {
  nodeId: string
  assetId: number
  kind: CanvasNodeKind
  label: string
  mediaUrl?: string | null
}

type CanvasMentionPopoverProps = {
  open: boolean
  query: string
  items: CanvasMentionItem[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onSelect: (item: CanvasMentionItem) => void
  onClose: () => void
}

/** 按节点类型返回图标 */
function KindIcon({ kind }: { kind: CanvasNodeKind }) {
  if (kind === 'character') return <UserRound size={14} strokeWidth={1.8} />
  if (kind === 'scene') return <Landmark size={14} strokeWidth={1.8} />
  if (kind === 'video') return <PlaySquare size={14} strokeWidth={1.8} />
  return <ImageIcon size={14} strokeWidth={1.8} />
}

/** 类型中文标签 */
function kindLabel(kind: CanvasNodeKind) {
  if (kind === 'character') return tv('角色', 'Nhân vật')
  if (kind === 'scene') return tv('场景', 'Bối cảnh')
  if (kind === 'video') return tv('视频', 'Video')
  if (kind === 'image') return tv('图片', 'Hình ảnh')
  return tv('资产', 'Tài sản')
}

/** 按查询过滤可引用节点 */
export function filterCanvasMentionItems(items: CanvasMentionItem[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => {
    const label = item.label.toLowerCase()
    const type = kindLabel(item.kind)
    return label.includes(q) || type.includes(q) || String(item.assetId).includes(q)
  })
}

/** 渲染 @ 引用候选列表 */
export function CanvasMentionPopover({
  open,
  query,
  items,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  onClose,
}: CanvasMentionPopoverProps) {
  if (!open) return null

  const filtered = filterCanvasMentionItems(items, query)

  return (
    <div
      className="fc-mention-popover nodrag nopan nowheel"
      role="listbox"
      aria-label={tv("引用画布节点", "Tham chiếu nút canvas")}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div className="fc-mention-head">
        <span>{tv("引用节点", "Tham chiếu nút")}</span>
        <button
          type="button"
          className="fc-mention-close"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }}
          aria-label={tv("关闭", "Đóng")}
        >
          ×
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="fc-mention-empty">{tv("无已连线节点 · 先把角色/场景连到本节点", "Chưa có nút nào được nối dây · Hãy nối nhân vật/bối cảnh vào nút này trước")}</div>
      ) : (
        <ul className="fc-mention-list">
          {filtered.map((item, index) => {
            const thumb = resolveDramaMediaUrl(item.mediaUrl)
            const active = index === activeIndex
            return (
              <li key={item.nodeId}>
                <button
                  type="button"
                  className={`fc-mention-item${active ? ' is-active' : ''}`}
                  onMouseEnter={() => onActiveIndexChange(index)}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onSelect(item)
                  }}
                >
                  <span className="fc-mention-thumb">
                    {thumb ? <img src={thumb} alt="" /> : <KindIcon kind={item.kind} />}
                  </span>
                  <span className="fc-mention-meta">
                    <strong>{item.label}</strong>
                    <em>{kindLabel(item.kind)}</em>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
