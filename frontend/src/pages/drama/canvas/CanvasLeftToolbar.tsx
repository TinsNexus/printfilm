/** 画布左侧垂直居中工具栏与添加节点面板 */
import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
import { useCanvasStore } from './CanvasStore'
import { ADD_NODE_OPTIONS, CANVAS_NODE_OPTION_BY_KIND, type CanvasNodeKind } from './canvasTypes'
import { tv } from '../../../i18n/tv'

type CanvasLeftToolbarProps = {
  onSelectNode: (kind: CanvasNodeKind) => void
}

/** 渲染画布左侧浮动工具栏 */
export function CanvasLeftToolbar({ onSelectNode }: CanvasLeftToolbarProps) {
  const { nodes, requestFocusNode } = useCanvasStore()
  /*
   * panelOpen 添加节点面板
   * folderOpen 节点列表面板
   */
  const [panelOpen, setPanelOpen] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  const addAnchorRef = useRef<HTMLDivElement>(null)

  // 点击外侧关闭添加面板
  useEffect(() => {
    if (!panelOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const root = addAnchorRef.current
      if (!root) return
      if (event.target instanceof Node && root.contains(event.target)) return
      setPanelOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [panelOpen])

  return (
    <div className="fc-overlay fc-left-toolbar">
      <div className="fc-left-stack">
        <div
          ref={addAnchorRef}
          className={`fc-add-anchor${panelOpen ? ' is-open' : ''}`}
          onMouseEnter={() => setPanelOpen(true)}
          onMouseLeave={() => setPanelOpen(false)}
        >
          <button
            type="button"
            className={`fc-icon-btn is-primary${panelOpen ? ' is-open' : ''}`}
            aria-label={panelOpen ? tv('关闭添加节点', 'Đóng thêm nút') : tv('添加节点', 'Thêm nút')}
            aria-expanded={panelOpen}
            title={tv("添加节点", "Thêm nút")}
            onClick={(event) => {
              event.stopPropagation()
              setPanelOpen((v) => !v)
              setFolderOpen(false)
            }}
          >
            {panelOpen ? <X size={18} strokeWidth={2} /> : <Plus size={18} strokeWidth={2} />}
          </button>

          {panelOpen ? (
            <div className="fc-add-panel-bridge" role="menu" aria-label={tv("添加节点类型", "Loại nút cần thêm")}>
              <div className="fc-add-panel">
                {ADD_NODE_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSelectNode(option.id)
                        setPanelOpen(false)
                      }}
                    >
                      <span className="fc-add-panel-icon">
                        <Icon size={14} strokeWidth={1.8} />
                      </span>
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={`fc-icon-btn${folderOpen ? ' is-active' : ''}`}
          aria-label={tv("资产文件夹", "Thư mục tài sản")}
          title={tv("资产文件夹", "Thư mục tài sản")}
          aria-expanded={folderOpen}
          onClick={() => {
            setFolderOpen((v) => !v)
            setPanelOpen(false)
          }}
        >
          <FolderOpen size={18} strokeWidth={1.8} />
        </button>

        {folderOpen ? (
          <div className="fc-folder-panel" role="dialog" aria-label={tv("画布节点列表", "Danh sách nút canvas")}>
            <h4>{tv("画布节点", "Nút canvas")}</h4>
            {nodes.length === 0 ? (
              <p className="fc-folder-empty">{tv("暂无节点，点击 + 添加", "Chưa có nút, bấm + để thêm")}</p>
            ) : (
              nodes.map((node) => {
                const option = CANVAS_NODE_OPTION_BY_KIND[node.data.kind]
                const Icon = option.icon
                return (
                  <button
                    key={node.id}
                    type="button"
                    className="fc-folder-item"
                    onClick={() => {
                      requestFocusNode(node.id)
                      setFolderOpen(false)
                    }}
                  >
                    <Icon size={14} strokeWidth={1.8} />
                    <span>
                      {option.label} · {node.data.label}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
